import { and, asc, count, desc, eq, gt, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { db, type Database } from "@/db";
import { portfolioProjectCovers as covers, portfolioProjectDecisions as decisions, portfolioProjects as projects, users, type User } from "@/db/schema";
import { isSiteStaff, isSuspended, restrictionMessage } from "./auth";
import { HttpError } from "./errors";
import { PROJECT_LIMITS, type OwnedProject, type ProjectDecision, type ProjectFields, type ProjectPatch, type PublicProject } from "./portfolio-input";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
const visible = and(eq(projects.isPublished, true), isNull(projects.hiddenAt));
const owned = (userId: number, id?: number) => and(eq(projects.userId, userId), id === undefined ? undefined : eq(projects.id, id));
const notFound = () => new HttpError(404, "Project not found", "not_found");
const coverUrl = (id: number, version: Date) => `/api/projects/${id}/cover?v=${version.getTime()}`;

const cardColumns = {
  id: projects.id,
  title: projects.title,
  description: projects.description,
  roleOutcome: projects.roleOutcome,
  liveUrl: projects.liveUrl,
  repoUrl: projects.repoUrl,
  techTags: projects.techTags,
  coverAlt: covers.altText,
  coverVersion: covers.updatedAt,
};

type CardRow = ProjectFields & { id: number; coverAlt: string | null; coverVersion: Date | null };

function publicCard(row: CardRow): PublicProject {
  return {
    id: row.id, title: row.title, description: row.description, roleOutcome: row.roleOutcome,
    liveUrl: row.liveUrl, repoUrl: row.repoUrl, techTags: row.techTags,
    coverAlt: row.coverAlt, coverUrl: row.coverVersion ? coverUrl(row.id, row.coverVersion) : null,
  };
}

export async function listPublicProjects(userId: number): Promise<PublicProject[]> {
  const rows = await db.select(cardColumns).from(projects).leftJoin(covers, eq(covers.projectId, projects.id))
    .where(and(owned(userId), visible)).orderBy(asc(projects.position)).limit(PROJECT_LIMITS.projects);
  return rows.map(publicCard);
}

export async function countPublicProjects(userId: number) {
  const [row] = await db.select({ count: count() }).from(projects).where(and(owned(userId), visible));
  return row.count;
}

export async function listOwnedProjects(userId: number, exec: Database | Tx = db, id?: number): Promise<OwnedProject[]> {
  const rows = await exec.select({ ...cardColumns, isPublished: projects.isPublished, hiddenAt: projects.hiddenAt })
    .from(projects).leftJoin(covers, eq(covers.projectId, projects.id)).where(owned(userId, id))
    .orderBy(asc(projects.position)).limit(PROJECT_LIMITS.projects);
  return rows.map((row) => ({ ...publicCard(row), isPublished: row.isPublished, hidden: row.hiddenAt !== null }));
}

/** Every owner mutation serializes on the same user row, even when the list is empty. */
async function withProjectWriter<T>(actorId: number, run: (tx: Tx, actor: User) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    const [actor] = await tx.select().from(users).where(eq(users.id, actorId)).limit(1).for("update");
    if (!actor) throw new HttpError(401, "Sign in to continue", "unauthenticated");
    if (isSuspended(actor)) throw new HttpError(403, restrictionMessage(actor), "restricted");
    return run(tx, actor);
  });
}

async function lockOwnedProject(tx: Tx, userId: number, id: number) {
  const [project] = await tx.select({ id: projects.id, position: projects.position }).from(projects)
    .where(owned(userId, id)).limit(1).for("update");
  if (!project) throw notFound();
  return project;
}

export async function checkProjectOwner(userId: number, id: number) {
  const [project] = await db.select({ id: projects.id }).from(projects).where(owned(userId, id)).limit(1);
  if (!project) throw notFound();
}

export function createProject(userId: number, fields: ProjectFields) {
  return withProjectWriter(userId, async (tx) => {
    const [{ c }] = await tx.select({ c: count() }).from(projects).where(owned(userId));
    if (c >= PROJECT_LIMITS.projects) throw new HttpError(409, "You can have up to six projects, including drafts.", "project_limit");
    const [{ id }] = await tx.insert(projects).values({ ...fields, userId, position: c }).returning({ id: projects.id });
    const [project] = await listOwnedProjects(userId, tx, id);
    return project;
  });
}

export function updateProject(userId: number, id: number, patch: ProjectPatch) {
  return withProjectWriter(userId, async (tx) => {
    await lockOwnedProject(tx, userId, id);
    if (Object.keys(patch).length) {
      await tx.update(projects).set({ ...patch, updatedAt: new Date() }).where(owned(userId, id));
    }
    const [project] = await listOwnedProjects(userId, tx, id);
    return project;
  });
}

export function deleteProject(userId: number, id: number) {
  return withProjectWriter(userId, async (tx) => {
    const { position } = await lockOwnedProject(tx, userId, id);
    await tx.delete(projects).where(owned(userId, id));
    await tx.update(projects).set({ position: sql`${projects.position} - 1` })
      .where(and(owned(userId), gt(projects.position, position)));
  });
}

export function reorderProjects(userId: number, ids: number[]) {
  return withProjectWriter(userId, async (tx) => {
    const rows = await tx.select({ id: projects.id, position: projects.position }).from(projects).where(owned(userId));
    const positions = new Map(rows.map(({ id, position }) => [id, position]));
    if (ids.length !== positions.size || !ids.every((id) => positions.has(id))) {
      throw new HttpError(409, "Your project list changed. Refresh it and reorder the current list.", "project_order_changed");
    }
    for (const [position, id] of ids.entries()) {
      if (positions.get(id) !== position) await tx.update(projects).set({ position, updatedAt: new Date() }).where(owned(userId, id));
    }
    return listOwnedProjects(userId, tx);
  });
}

export function setProjectCover(userId: number, id: number, bytes: Buffer, altText: string) {
  return withProjectWriter(userId, async (tx) => {
    await lockOwnedProject(tx, userId, id);
    // Replacing the one row leaves no stale key or orphan; a failed write leaves the old cover intact.
    const updatedAt = new Date();
    await tx.insert(covers).values({ projectId: id, bytes, altText, updatedAt })
      .onConflictDoUpdate({ target: covers.projectId, set: { bytes, altText, updatedAt } });
    await tx.update(projects).set({ updatedAt }).where(owned(userId, id));
    return { coverUrl: coverUrl(id, updatedAt), altText };
  });
}

export function removeProjectCover(userId: number, id: number) {
  return withProjectWriter(userId, async (tx) => {
    await lockOwnedProject(tx, userId, id);
    await tx.delete(covers).where(eq(covers.projectId, id));
    await tx.update(projects).set({ updatedAt: new Date() }).where(owned(userId, id));
  });
}

/** Staff do not get private cover access by ID. Visibility is checked in the bytes query itself. */
export async function readProjectCover(id: number, viewerId: number | undefined): Promise<Buffer> {
  const [row] = await db.select({ bytes: covers.bytes }).from(covers).innerJoin(projects, eq(projects.id, covers.projectId))
    .where(and(eq(projects.id, id), or(visible, viewerId === undefined ? undefined : eq(projects.userId, viewerId)))).limit(1);
  if (!row) throw notFound();
  return row.bytes;
}

/** Minimal identifiers for staff restoration, without any hidden or draft portfolio content. */
export async function listHiddenProjectsForReview(staffId: number) {
  return db.select({ id: projects.id, username: users.username, hiddenAt: projects.hiddenAt })
    .from(projects).innerJoin(users, eq(users.id, projects.userId))
    .where(and(isNotNull(projects.hiddenAt), ne(projects.userId, staffId)))
    .orderBy(desc(projects.hiddenAt), desc(projects.id)).limit(50);
}

export function moderateProject(staffId: number, id: number, decision: ProjectDecision) {
  return withProjectWriter(staffId, async (tx, staff) => {
    if (!isSiteStaff(staff)) throw new HttpError(403, "Moderator access required", "forbidden");
    const [project] = await tx.select({ id: projects.id }).from(projects)
      .where(and(eq(projects.id, id), ne(projects.userId, staffId), decision.action === "hide" ? visible : isNotNull(projects.hiddenAt)))
      .limit(1).for("update");
    if (!project) throw notFound();
    const hidden = decision.action === "hide";
    await tx.update(projects).set({ hiddenAt: hidden ? new Date() : null }).where(eq(projects.id, id));
    await tx.insert(decisions).values({ projectId: id, moderatorId: staffId, ...decision });
    return { id, hidden };
  });
}
