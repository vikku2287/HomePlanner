import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/http";
import { requireFamily } from "@/lib/session";

const BodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  role: z.enum(["parent", "child", "other"]).optional(),
});

export async function GET() {
  const ctx = await requireFamily();
  if (ctx instanceof NextResponse) return ctx;
  return NextResponse.json(await ctx.store.listMembers());
}

/** Adds someone without their own account, e.g. a young child. */
export async function POST(req: NextRequest) {
  const ctx = await requireFamily();
  if (ctx instanceof NextResponse) return ctx;
  try {
    return NextResponse.json(await ctx.store.addMember(BodySchema.parse(await req.json())), { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
