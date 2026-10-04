import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/http";
import { getStore } from "@/lib/store";

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from") ?? undefined;
  const to = req.nextUrl.searchParams.get("to") ?? undefined;
  return NextResponse.json(await getStore().listEvents({ from, to }));
}

export async function POST(req: NextRequest) {
  try {
    return NextResponse.json(await getStore().addEvent(await req.json()), { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
