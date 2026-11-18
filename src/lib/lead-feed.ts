import { and, arrayOverlaps, count, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { leads, leadSaves, spaces, users, votes } from "@/db/schema";
import { openPublicLead, publicLead } from "./lead-access";
import { LEAD_PAGE_SIZE, LEAD_RANK_WINDOW, leadSeekToken, type LeadFilters, type LeadPaging } from "./lead-discovery";
import { getLeadEngagement } from "./lead-engagement";
import { rankItems } from "./sorting";
import type { CursorPage, FeedLead, LeadFeedPage } from "./types";
import { routes } from "./utils";

type FeedTime = typeof leads.createdAt | typeof leadSaves.createdAt;

function leadCardQuery(time: FeedTime = leads.createdAt) {
  return db.select({
    lead: leads,
    author: { id: users.id, username: users.username, displayName: users.displayName, avatarHue: users.avatarHue, isVerified: users.isVerified, karma: users.karma },
    space: { id: spaces.id, slug: spaces.slug, name: spaces.name, accentHue: spaces.accentHue },
    // Keep all six fractional digits for pagination; JavaScript Dates only preserve milliseconds.
    pageTime: sql<string>`to_char(${time} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
  }).from(leads).innerJoin(users, eq(users.id, leads.authorId)).leftJoin(spaces, eq(spaces.id, leads.spaceId));
}

type LeadRow = Awaited<ReturnType<typeof leadCardQuery>>[number];

function preview(body: string): string {
  const flat = body.replace(/```[\s\S]*?```/g, "").replace(/[#*`>|_-]+/g, " ").replace(/\s+/g, " ").trim();
  return flat.length > 200 ? `${flat.slice(0, 199).trimEnd()}…` : flat;
}

async function feedItems(rows: LeadRow[], viewerId: number | null, savedPage = false): Promise<FeedLead[]> {
  const ids = rows.map((r) => r.lead.id);
  const [voteRows, saveRows] = viewerId && ids.length ? await Promise.all([
    db.select({ targetId: votes.targetId, value: votes.value }).from(votes)
      .where(and(eq(votes.userId, viewerId), eq(votes.targetType, "lead"), inArray(votes.targetId, ids))),
    savedPage ? [] : db.select({ leadId: leadSaves.leadId }).from(leadSaves)
      .where(and(eq(leadSaves.userId, viewerId), inArray(leadSaves.leadId, ids))),
  ]) : [[], []];
  const voteMap = new Map(voteRows.map((row) => [row.targetId, row.value]));
  const savedIds = new Set(saveRows.map((row) => row.leadId));
  const now = Date.now();
  return rows.map(({ lead, author, space }) => {
    const engagement = getLeadEngagement(lead, now);
    return {
      id: lead.id, slug: lead.slug, title: lead.title, excerpt: preview(lead.description),
      category: lead.category, kind: lead.kind, budgetMin: lead.budgetMin, budgetMax: lead.budgetMax,
      currency: lead.currency, budgetUnit: lead.budgetUnit, skillTags: lead.skillTags,
      acceptingBids: engagement === "open", engagement, location: lead.location,
      isVerified: lead.isVerified, isEscrowed: lead.isEscrowed, status: lead.status,
      upvotes: lead.upvotes, downvotes: lead.downvotes, bidCount: lead.bidCount,
      createdAt: lead.createdAt.toISOString(), author, space, userVote: voteMap.get(lead.id) ?? 0,
      ...(viewerId !== null && { saved: savedPage || savedIds.has(lead.id) }),
      href: routes.lead(lead.id, lead.slug),
    };
  });
}

function matchingLeads(filters: LeadFilters, authorId: number | undefined): SQL {
  const conditions = [filters.openOnly ? openPublicLead : publicLead];
  if (authorId !== undefined) conditions.push(eq(leads.authorId, authorId));
  if (filters.category) conditions.push(eq(leads.category, filters.category));
  if (filters.kind) conditions.push(eq(leads.kind, filters.kind));
  if (filters.verifiedOnly) conditions.push(eq(leads.isVerified, true));
  if (filters.currency) conditions.push(eq(leads.currency, filters.currency));
  if (filters.unit) conditions.push(eq(leads.budgetUnit, filters.unit));
  if (filters.min !== undefined) conditions.push(gte(leads.budgetMax, filters.min));
  if (filters.max !== undefined) conditions.push(lte(leads.budgetMin, filters.max));
  if (filters.skills.length) conditions.push(arrayOverlaps(leads.skillTags, filters.skills));
  return and(...conditions)!;
}

function olderThan(time: FeedTime, id: typeof leads.id | typeof leadSaves.leadId, cursor: { time: string; id: number }) {
  return sql`(${time}, ${id}) < (${cursor.time}::timestamptz, ${cursor.id}::integer)`;
}

async function seekPage(rows: LeadRow[], limit: number, scope: "new" | "saved", viewerId: number | null): Promise<CursorPage<FeedLead>> {
  const last = rows[limit - 1];
  return {
    items: await feedItems(rows.slice(0, limit), viewerId, scope === "saved"),
    nextCursor: rows.length > limit ? leadSeekToken(scope, last.pageTime, last.lead.id) : null,
  };
}

export async function listLeads({ filters, authorId, viewerId, paging = { limit: LEAD_PAGE_SIZE } }: {
  filters: LeadFilters;
  authorId?: number;
  viewerId: number | null;
  paging?: LeadPaging;
}): Promise<LeadFeedPage> {
  const { sort } = filters;
  const { limit, cursor } = paging;
  const where = matchingLeads(filters, authorId);
  if (sort === "new") {
    const seek = cursor?.scope === "new" ? olderThan(leads.createdAt, leads.id, cursor) : undefined;
    const [rows, [{ total }]] = await Promise.all([
      leadCardQuery().where(and(where, seek)).orderBy(desc(leads.createdAt), desc(leads.id)).limit(limit + 1),
      db.select({ total: count() }).from(leads).where(where),
    ]);
    return { mode: sort, total, ...await seekPage(rows, limit, "new", viewerId) };
  }

  // The approximate Hot/Best rankings are separate from exact New discovery. The parser
  // disallows discovery filters here. Fetch only ranking metadata for the candidate window.
  const candidates = await db.select({ id: leads.id, upvotes: leads.upvotes, downvotes: leads.downvotes, commentCount: leads.bidCount, createdAt: leads.createdAt })
    .from(leads).where(where).orderBy(desc(leads.createdAt), desc(leads.id)).limit(LEAD_RANK_WINDOW);
  const ranked = rankItems(candidates, sort);
  const offset = cursor && "offset" in cursor && cursor.scope === sort ? cursor.offset : 0;
  const ids = ranked.slice(offset, offset + limit).map((row) => row.id);
  const rows = ids.length ? await leadCardQuery().where(and(where, inArray(leads.id, ids))) : [];
  const byId = new Map(rows.map((row) => [row.lead.id, row]));
  const ordered = ids.flatMap((id) => byId.get(id) ?? []);
  return {
    mode: sort, total: ranked.length,
    items: await feedItems(ordered, viewerId),
    nextCursor: offset + limit < ranked.length ? `${sort}:${offset + limit}` : null,
  };
}

export async function listSavedLeads(viewerId: number, paging: LeadPaging = { limit: LEAD_PAGE_SIZE }): Promise<CursorPage<FeedLead>> {
  const { limit, cursor } = paging;
  const seek = cursor?.scope === "saved" ? olderThan(leadSaves.createdAt, leadSaves.leadId, cursor) : undefined;
  const rows = await leadCardQuery(leadSaves.createdAt)
    .innerJoin(leadSaves, eq(leadSaves.leadId, leads.id))
    .where(and(publicLead, eq(leadSaves.userId, viewerId), seek))
    .orderBy(desc(leadSaves.createdAt), desc(leadSaves.leadId)).limit(limit + 1);
  return seekPage(rows, limit, "saved", viewerId);
}
