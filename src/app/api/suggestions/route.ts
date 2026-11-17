import { NextResponse } from "next/server";
import { suggest } from "@/lib/assistant";
import { errorResponse } from "@/lib/http";
import { requireFamily } from "@/lib/session";

export async function GET() {
  const ctx = await requireFamily();
  if (ctx instanceof NextResponse) return ctx;
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 503 });
  }
  try {
    return NextResponse.json(await suggest(ctx.store, ctx.family));
  } catch (err) {
    return errorResponse(err);
  }
}
