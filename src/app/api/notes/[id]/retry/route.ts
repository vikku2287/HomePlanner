import { NextResponse, after, type NextRequest } from "next/server";
import { aiEnabled, processNote } from "@/lib/notes";
import { requireFamily } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

/** Runs the assistant over a note again, e.g. after an error. */
export async function POST(_req: NextRequest, { params }: Params) {
  const ctx = await requireFamily();
  if (ctx instanceof NextResponse) return ctx;
  if (!aiEnabled()) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 503 });
  const note = await ctx.store.updateNote((await params).id, { status: "processing", summary: undefined });
  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });
  after(() => processNote(ctx.store, ctx.family, note));
  return NextResponse.json(note, { status: 202 });
}
