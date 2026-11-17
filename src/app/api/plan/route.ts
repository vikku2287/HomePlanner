import { NextResponse } from "next/server";
import { requireFamily } from "@/lib/session";

/** Everything a device needs to show the family's plan, plus the revision it reflects. */
export async function GET() {
  const ctx = await requireFamily();
  if (ctx instanceof NextResponse) return ctx;
  // Read the revision first: if a write lands mid-read, the next sync check refetches.
  const revision = ctx.family.revision;
  const snapshot = await ctx.store.snapshot();
  return NextResponse.json({ revision, meId: ctx.me.id, ...snapshot }, { headers: { "cache-control": "no-store" } });
}
