"use client";

import type { Member, Note, PlanEvent } from "@/lib/types";

export type Me = {
  user: { id: string; name: string; email: string } | null;
  family: { id: string; name: string; timeZone: string; inviteCode: string } | null;
  realtime?: { url: string; anonKey: string; channel: string } | null;
  ai?: boolean;
};

export type Plan = {
  revision: string;
  meId: string;
  members: Member[];
  events: PlanEvent[];
  notes: Note[];
};

/** fetch + JSON with the server's error message surfaced as an Error. */
export async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? (init?.body === undefined ? "GET" : "POST"),
    headers: init?.body === undefined ? undefined : { "content-type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const issue = body.issues?.[0]?.message;
    throw new Error(issue ?? body.error ?? `Request failed (${res.status})`);
  }
  return body as T;
}
