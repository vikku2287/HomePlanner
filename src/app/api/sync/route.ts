import { NextResponse } from "next/server";
import { requireFamily } from "@/lib/session";

/** A cheap check devices poll: the plan's revision changes on every edit. */
export async function GET() {
  const ctx = await requireFamily();
  if (ctx instanceof NextResponse) return ctx;
  return NextResponse.json({ revision: ctx.family.revision }, { headers: { "cache-control": "no-store" } });
}
