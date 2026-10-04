import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/http";
import { getStore } from "@/lib/store";

export async function GET() {
  return NextResponse.json(await getStore().listMembers());
}

export async function POST(req: NextRequest) {
  try {
    return NextResponse.json(await getStore().addMember(await req.json()), { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
