import { NextResponse, type NextRequest } from "next/server";
import { dueReminders } from "@/lib/reminders";
import { requireFamily } from "@/lib/session";

export async function GET(req: NextRequest) {
  const ctx = await requireFamily();
  if (ctx instanceof NextResponse) return ctx;
  const window = Number(req.nextUrl.searchParams.get("windowMinutes") ?? 60);
  const events = await ctx.store.listEvents();
  return NextResponse.json(dueReminders(events, new Date(), Number.isFinite(window) ? window : 60));
}
