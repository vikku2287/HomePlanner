import { describe, expect, it } from "vitest";
import { createSessionToken, hashPassword, readSessionToken, verifyPassword } from "@/lib/auth";

const SECRET = "test-secret-test-secret-test-secret!!";

describe("passwords", () => {
  it("verifies the right password and rejects others", async () => {
    const hash = await hashPassword("correct horse");
    expect(hash).not.toContain("correct horse");
    expect(await verifyPassword("correct horse", hash)).toBe(true);
    expect(await verifyPassword("wrong horse", hash)).toBe(false);
    expect(await verifyPassword("correct horse", "garbage")).toBe(false);
  });
});

describe("session tokens", () => {
  const now = Date.parse("2026-11-17T12:00:00Z");

  it("round-trips the user id", () => {
    expect(readSessionToken(createSessionToken("u1", now, SECRET), now, SECRET)).toBe("u1");
  });

  it("rejects tampered, foreign and expired tokens", () => {
    const token = createSessionToken("u1", now, SECRET);
    const [payload, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ uid: "u2", exp: now + 1e9 })).toString("base64url");
    expect(readSessionToken(`${forged}.${sig}`, now, SECRET)).toBeNull();
    expect(readSessionToken(`${payload}.${sig}x`, now, SECRET)).toBeNull();
    expect(readSessionToken(token, now, "another-secret-another-secret-another")).toBeNull();
    expect(readSessionToken(token, now + 61 * 24 * 60 * 60 * 1000, SECRET)).toBeNull();
    expect(readSessionToken(undefined, now, SECRET)).toBeNull();
  });
});
