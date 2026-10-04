import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { chat } from "@/lib/assistant";
import { errorResponse } from "@/lib/http";
import { getStore } from "@/lib/store";

const BodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1) }))
    .min(1),
  timeZone: z.string().optional(),
});

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set. Copy .env.example to .env.local and add your key." },
      { status: 503 },
    );
  }
  try {
    const { messages, timeZone } = BodySchema.parse(await req.json());
    const reply = await chat(getStore(), messages, timeZone);
    return NextResponse.json({ reply });
  } catch (err) {
    return errorResponse(err);
  }
}
