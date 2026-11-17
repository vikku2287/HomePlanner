import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { chat } from "@/lib/assistant";
import { errorResponse } from "@/lib/http";
import { requireFamily } from "@/lib/session";

const BodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1) }))
    .min(1),
});

export async function POST(req: NextRequest) {
  const ctx = await requireFamily();
  if (ctx instanceof NextResponse) return ctx;
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set. Copy .env.example to .env.local and add your key." },
      { status: 503 },
    );
  }
  try {
    const { messages } = BodySchema.parse(await req.json());
    const reply = await chat(ctx.store, ctx.family, ctx.me, messages);
    return NextResponse.json({ reply });
  } catch (err) {
    return errorResponse(err);
  }
}
