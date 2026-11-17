import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_DAYS, createSessionToken, readSessionToken } from "./auth";
import { getStore, type FamilyStore } from "./store";
import type { Family, Member, PublicUser, User } from "./types";

export function publicUser(user: User): PublicUser {
  const { passwordHash: _omit, ...rest } = user;
  return rest;
}

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const userId = readSessionToken(jar.get(SESSION_COOKIE)?.value);
  return userId ? getStore().getUser(userId) : null;
}

export async function startSession(userId: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export interface FamilyContext {
  user: User;
  family: Family;
  /** The planner member that represents the signed-in user. */
  me: Member;
  store: FamilyStore;
}

/**
 * Resolves the signed-in user and their family. Returns a ready-made error
 * response when there is no session or the user hasn't joined a family yet.
 */
export async function requireFamily(): Promise<FamilyContext | NextResponse> {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const family = user.familyId ? await getStore().getFamily(user.familyId) : null;
  if (!family) {
    return NextResponse.json({ error: "Create or join a family first." }, { status: 403 });
  }
  const store = getStore().family(family.id);
  let me = (await store.listMembers()).find((m) => m.userId === user.id);
  me ??= await store.addMember({ name: user.name, userId: user.id });
  return { user, family, me, store };
}
