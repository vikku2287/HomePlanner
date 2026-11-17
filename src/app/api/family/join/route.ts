import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/http";
import { currentUser } from "@/lib/session";
import { getStore } from "@/lib/store";

const BodySchema = z.object({ inviteCode: z.string().trim().min(4).max(20) });

/** Joins the family behind an invite code. */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (user.familyId) {
    return NextResponse.json({ error: "You're already in a family." }, { status: 409 });
  }
  try {
    const { inviteCode } = BodySchema.parse(await req.json());
    const family = await getStore().joinFamily(user, inviteCode);
    if (!family) {
      return NextResponse.json({ error: "That invite code didn't match a family." }, { status: 404 });
    }
    return NextResponse.json({ id: family.id, name: family.name });
  } catch (err) {
    return errorResponse(err);
  }
}
