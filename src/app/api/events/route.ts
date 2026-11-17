import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/http";
import { requireFamily } from "@/lib/session";

export async function GET(req: NextRequest) {
  const ctx = await requireFamily();
  if (ctx instanceof NextResponse) return ctx;
  const from = req.nextUrl.searchParams.get("from") ?? undefined;
  const to = req.nextUrl.searchParams.get("to") ?? undefined;
  return NextResponse.json(await ctx.store.listEvents({ from, to }));
}

export async function POST(req: NextRequest) {
  const ctx = await requireFamily();
  if (ctx instanceof NextResponse) return ctx;
  try {
    return NextResponse.json(await ctx.store.addEvent(await req.json()), { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
