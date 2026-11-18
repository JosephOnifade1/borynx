import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { CommentNode, FeedPage, FeedPost, SearchResult } from "../types";

// The disposable database harness starts a fresh app for this suite (npm run test:db).
const origin = process.env.BORYNX_POST_TEST_ORIGIN;
const tag = randomUUID().slice(0, 8);
const username = "demo-buyer";
const spaceSlug = "devops-cloud";
type Session = { token: string };

function request(path: string, method = "GET", session?: Session, json?: unknown) {
  return fetch(new URL(path, origin), {
    method,
    headers: {
      ...(session && { "x-bx-session": session.token }),
      ...(json !== undefined && { "Content-Type": "application/json" }),
    },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
}

async function read<T>(response: Promise<Response>, status = 200): Promise<T> {
  const res = await response;
  const text = await res.text();
  expect(res.status, `${res.url}: ${res.statusText}`).toBe(status);
  return JSON.parse(text) as T;
}

describe.runIf(Boolean(origin))("post author actions against a disposable app", () => {
  let author: Session;
  let reader: Session;
  let moderator: Session;

  beforeAll(async () => {
    expect(["localhost", "127.0.0.1", "[::1]"]).toContain(new URL(origin!).hostname);
    expect((await request("/api/health")).status).toBe(200);
    [author, reader, moderator] = await Promise.all([
      read<Session>(request("/api/auth/login", "POST", undefined, { username })),
      read<Session>(request("/api/auth/login", "POST", undefined, { username: "demo-bidder-a" })),
      read<Session>(request("/api/auth/login", "POST", undefined, { username: "demo-reviewer" })),
    ]);
  });

  const createPost = (title: string, body: string, space = spaceSlug) => read<{ id: number; href: string }>(
    request("/api/posts", "POST", author, { spaceSlug: space, title, body, kind: "help" }), 201,
  );
  const reportPost = (id: number) => read<{ id: number }>(
    request("/api/reports", "POST", reader, { targetType: "post", targetId: id, reason: "off_topic" }), 201,
  );

  it("keeps the permalink and discussion on edit, then closes replies and withdraws discovery on deletion", async () => {
    const originalTitle = `Original thread ${tag}`;
    const originalBody = `#### Legacy heading\n\nPrivate-to-the-test body ${tag}.\n\nhttps://example.com/${tag}`;
    const post = await createPost(originalTitle, originalBody);
    const path = `/api/posts/${post.id}`;
    const reply = await read<{ id: number }>(request(`${path}/comments`, "POST", reader, { body: "Existing answer." }), 201);
    await read(request(`/api/comments/${reply.id}/solution`, "POST", author));
    await read(request(`${path}/vote`, "POST", reader, { value: 1 }));
    await read(request(`${path}/save`, "POST", reader));
    await reportPost(post.id);

    const title = `Updated thread ${tag}`;
    expect((await request(path, "PATCH", undefined, { title, editedAt: null })).status).toBe(401);
    for (const stranger of [reader, moderator]) {
      expect((await request(path, "PATCH", stranger, { title, editedAt: null })).status).toBe(404);
      expect((await request(path, "DELETE", stranger)).status).toBe(404);
    }
    const edit = await read<{ href: string; editedAt: string }>(request(path, "PATCH", author, { title, editedAt: null }));
    expect(edit.href).toBe(post.href);
    expect(edit.editedAt).toBeTruthy();
    expect((await request(path, "PATCH", author, { title, editedAt: null })).status).toBe(409);
    const saved = () => read<FeedPage<FeedPost>>(request(`/api/posts?saved=1&author=${username}`, "GET", reader));
    expect((await saved()).items).toEqual([expect.objectContaining({
      href: post.href, title, primaryLink: `https://example.com/${tag}`, upvotes: 1, isSolved: true, commentCount: 1, kind: "help",
    })]);

    expect((await request(path, "DELETE")).status).toBe(401);
    const deleted = await read<{ href: string }>(request(path, "DELETE", author));
    expect(deleted.href).toBe(`/b/${spaceSlug}/p/${post.id}/deleted`);
    expect(await read(request(path, "DELETE", author))).toEqual({ ok: true, href: deleted.href });
    expect((await request(path, "PATCH", author, { title, editedAt: edit.editedAt })).status).toBe(404);

    const { items } = await read<{ items: CommentNode[] }>(request(`${path}/comments`));
    expect(items).toEqual([expect.objectContaining({ id: reply.id, body: "Existing answer.", isSolution: true })]);
    for (const parentId of [null, reply.id]) {
      expect((await request(`${path}/comments`, "POST", reader, { body: "New reply.", parentId })).status).toBe(404);
    }
    expect((await request(`${path}/save`, "POST", reader)).status).toBe(404);
    expect((await request(`${path}/vote`, "POST", reader, { value: -1 })).status).toBe(404);
    expect((await request(`/api/comments/${reply.id}/solution`, "POST", author)).status).toBe(404);
    expect((await saved()).items).toEqual([]);
    expect((await read<FeedPage<FeedPost>>(request(`/api/posts?space=${spaceSlug}&author=${username}`))).items).toEqual([]);
    expect((await read<{ results: SearchResult[] }>(request(`/api/search?q=${encodeURIComponent(title)}`))).results).toEqual([]);
    const profile = await read<{ postCount: number }>(request(`/api/users/${username}`));
    expect(profile.postCount).toBe(0);

    for (const oldLink of [post.href, `/p/${post.id}`]) {
      const response = await request(oldLink);
      expect(new URL(response.url).pathname).toBe(deleted.href);
      const html = await response.text();
      expect(html).toContain("This post was deleted by its author.");
      expect(html).toContain("Existing answer.");
      for (const text of [originalTitle, title, `Private-to-the-test body ${tag}`, post.href]) expect(html).not.toContain(text);
    }
    for (const session of [author, reader]) {
      const { notifications } = await read<{ notifications: Array<{ href: string; message: string }> }>(request("/api/notifications", "GET", session));
      expect(notifications).toContainEqual(expect.objectContaining({ href: deleted.href, message: "Activity on a deleted post." }));
      expect(JSON.stringify(notifications)).not.toContain(originalTitle);
    }
    const queue = await (await request("/mod/queue", "GET", moderator)).text();
    expect(queue).toContain(originalTitle);
    expect(queue).toContain(`Private-to-the-test body ${tag}`);
  });

  it("does not reopen a thread removed by moderators", async () => {
    const title = `Moderator test thread ${tag}`;
    const post = await createPost(title, "A body to preserve for the moderator.");
    const report = await reportPost(post.id);
    await read(request(`/api/mod/reports/${report.id}`, "PATCH", moderator, { action: "approve" }));
    const path = `/api/posts/${post.id}`;
    expect((await request(path, "PATCH", author, { title: "Do not replace a removed post", editedAt: null })).status).toBe(404);
    await read(request(path, "DELETE", author));
    const html = await (await request(post.href)).text();
    expect(html).toContain("This thread was removed by a moderator.");
    expect(html).not.toContain(title);
    const approved = await (await request("/mod/queue?status=approved", "GET", moderator)).text();
    expect(approved).toContain(title);
  });

  it("keeps private threads and their tombstones private", async () => {
    const space = `post-private-${tag}`;
    await read(request("/api/spaces", "POST", author, { slug: space, name: "Private post test", privacy: "private" }), 201);
    const post = await createPost(`Private thread ${tag}`, "Private body.", space);
    const path = `/api/posts/${post.id}`;
    expect((await request(`${path}/comments`, "GET", reader)).status).toBe(404);
    const deleted = await read<{ href: string }>(request(path, "DELETE", author));
    expect(await (await request(post.href, "GET", author)).text()).toContain("This post was deleted by its author.");
    expect((await request(`${path}/comments`, "GET", reader)).status).toBe(404);
    expect(await (await request(deleted.href, "GET", reader)).text()).not.toContain("This post was deleted by its author.");
  });
});
