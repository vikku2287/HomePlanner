import { NextResponse, type NextRequest } from "next/server";
import { dueReminders } from "@/lib/reminders";
import { getStore } from "@/lib/store";

export async function GET(req: NextRequest) {
  const window = Number(req.nextUrl.searchParams.get("windowMinutes") ?? 60);
  const events = await getStore().listEvents();
  return NextResponse.json(dueReminders(events, new Date(), Number.isFinite(window) ? window : 60));
}
