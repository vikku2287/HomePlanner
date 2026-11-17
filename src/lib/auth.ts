import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = "hp_session";
export const SESSION_DAYS = 60;

/** Hashes a password as `scrypt$<salt>$<hash>` (base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 32);
  return ["scrypt", salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(password, Buffer.from(salt, "base64url"), expected.length);
  return timingSafeEqual(actual, expected);
}

const DEV_SECRET = "homeplanner-dev-only-secret-change-me";

function sessionSecret(): string {
  const secret = process.env.HOMEPLANNER_SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("HOMEPLANNER_SESSION_SECRET must be set to at least 32 random characters.");
  }
  return DEV_SECRET;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** A signed, expiring session token: `<base64url json>.<hmac>`. */
export function createSessionToken(userId: string, now = Date.now(), secret = sessionSecret()): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: now + SESSION_DAYS * 24 * 60 * 60 * 1000 }),
  ).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

/** Returns the user id in a valid, unexpired token, or null. */
export function readSessionToken(
  token: string | undefined,
  now = Date.now(),
  secret = sessionSecret(),
): string | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof uid === "string" && typeof exp === "number" && exp > now ? uid : null;
  } catch {
    return null;
  }
}
