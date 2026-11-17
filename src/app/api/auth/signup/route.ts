import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { publicUser, startSession } from "@/lib/session";
import { DuplicateKeyError, getStore } from "@/lib/store";

const BodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email(),
  password: z.string().min(8, "Use at least 8 characters").max(200),
});

export async function POST(req: NextRequest) {
  try {
    const { name, email, password } = BodySchema.parse(await req.json());
    const user = await getStore().createUser({ name, email, passwordHash: await hashPassword(password) });
    await startSession(user.id);
    return NextResponse.json({ user: publicUser(user) }, { status: 201 });
  } catch (err) {
    if (err instanceof DuplicateKeyError) {
      return NextResponse.json({ error: "That email already has an account. Sign in instead." }, { status: 409 });
    }
    return errorResponse(err);
  }
}
