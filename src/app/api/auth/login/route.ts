import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyPassword } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { publicUser, startSession } from "@/lib/session";
import { getStore } from "@/lib/store";

const BodySchema = z.object({ email: z.string().trim(), password: z.string() });

export async function POST(req: NextRequest) {
  try {
    const { email, password } = BodySchema.parse(await req.json());
    const user = await getStore().findUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json({ error: "Wrong email or password." }, { status: 401 });
    }
    await startSession(user.id);
    return NextResponse.json({ user: publicUser(user) });
  } catch (err) {
    return errorResponse(err);
  }
}
