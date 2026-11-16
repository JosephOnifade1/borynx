"use client";

import { getStoredToken } from "./browser";
import type { ApiError } from "./types";

export class ClientError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  // Present only in header-fallback mode (session cookie blocked by an embedded preview).
  const token = getStoredToken();
  const res = await fetch(url, {
    ...rest,
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { "x-bx-session": token } : {}),
      ...(rest.headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: "same-origin",
  });
  if (!res.ok) {
    let payload: Partial<ApiError> = {};
    try {
      payload = (await res.json()) as Partial<ApiError>;
    } catch {
      /* non-JSON error */
    }
    throw new ClientError(res.status, payload.error ?? `Request failed (${res.status})`, payload.code ?? "error");
  }
  return (await res.json()) as T;
}

export const queryKeys = {
  posts: (params: Record<string, string | undefined>) => ["posts", params] as const,
  comments: (postId: number) => ["comments", postId] as const,
  leads: (params: Record<string, string | undefined>) => ["leads", params] as const,
  user: (username: string) => ["user", username] as const,
  userFollow: (username: string) => ["userFollow", username] as const,
  notifications: () => ["notifications"] as const,
  leaderboard: (params?: Record<string, string | undefined>) => ["leaderboard", params] as const,
  search: (q: string) => ["search", q] as const,
};
