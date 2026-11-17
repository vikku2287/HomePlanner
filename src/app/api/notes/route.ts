import { NextResponse, after, type NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/http";
import { aiEnabled, processNote } from "@/lib/notes";
import { requireFamily } from "@/lib/session";

const BodySchema = z.object({ text: z.string().trim().min(1).max(2000) });

export async function GET() {
  const ctx = await requireFamily();
  if (ctx instanceof NextResponse) return ctx;
  return NextResponse.json(await ctx.store.listNotes());
}

/**
 * Posts a note to the family feed. It is saved and shared right away; the
 * assistant then turns it into plan updates in the background.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireFamily();
  if (ctx instanceof NextResponse) return ctx;
  try {
    const { text } = BodySchema.parse(await req.json());
    const ai = aiEnabled();
    const note = await ctx.store.addNote({ text, author: ctx.me, status: ai ? "processing" : "saved" });
    if (ai) after(() => processNote(ctx.store, ctx.family, note));
    return NextResponse.json(note, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
