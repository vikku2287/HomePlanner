import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/http";
import { currentUser } from "@/lib/session";
import { getStore } from "@/lib/store";

const BodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  timeZone: z.string().optional(),
});

function validTimeZone(tz: string | undefined): string {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

/** Creates a new family with the signed-in user in it. */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (user.familyId) {
    return NextResponse.json({ error: "You're already in a family." }, { status: 409 });
  }
  try {
    const { name, timeZone } = BodySchema.parse(await req.json());
    const family = await getStore().createFamily(user, { name, timeZone: validTimeZone(timeZone) });
    return NextResponse.json({ id: family.id, name: family.name }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
