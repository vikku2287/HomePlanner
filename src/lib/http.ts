import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ZodError) {
    return NextResponse.json({ error: "Invalid input", issues: err.issues }, { status: 400 });
  }
  if (err instanceof SyntaxError) {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
