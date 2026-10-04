import { NextResponse, type NextRequest } from "next/server";
import { suggest } from "@/lib/assistant";
import { errorResponse } from "@/lib/http";
import { getStore } from "@/lib/store";

export async function GET(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 503 });
  }
  try {
    const timeZone = req.nextUrl.searchParams.get("timeZone") ?? "UTC";
    return NextResponse.json(await suggest(getStore(), timeZone));
  } catch (err) {
    return errorResponse(err);
  }
}
