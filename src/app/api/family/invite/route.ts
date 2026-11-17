import { NextResponse } from "next/server";
import { requireFamily } from "@/lib/session";
import { formatInviteCode, getStore } from "@/lib/store";

/** Replaces the family's invite code, e.g. after sharing it with the wrong person. */
export async function POST() {
  const ctx = await requireFamily();
  if (ctx instanceof NextResponse) return ctx;
  const family = await getStore().rotateInviteCode(ctx.family.id);
  return NextResponse.json({ inviteCode: family && formatInviteCode(family.inviteCode) });
}
