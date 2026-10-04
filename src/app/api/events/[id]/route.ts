import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/http";
import { getStore } from "@/lib/store";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const updated = await getStore().updateEvent((await params).id, await req.json());
    return updated
      ? NextResponse.json(updated)
      : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const ok = await getStore().deleteEvent((await params).id);
  return ok ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
