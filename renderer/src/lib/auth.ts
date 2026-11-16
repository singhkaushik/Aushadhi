import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "./db";
import { COOKIE, Role, SessionUser, verifySession } from "./session";

export const ROLES: Role[] = ["admin", "billing", "viewer"];
const RANK: Record<Role, number> = { viewer: 0, billing: 1, admin: 2 };

/** Unknown/bogus roles rank -1, i.e. below every required level — never trust them. */
export const roleAtLeast = (role: string, min: Role) => (RANK[role as Role] ?? -1) >= RANK[min];

export function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString("hex")}`;
}

export function checkPassword(pw: string, stored: string) {
  const [salt, hash] = String(stored ?? "").split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== 64) return false;
  const h = crypto.scryptSync(pw, salt, 64);
  return crypto.timingSafeEqual(h, expected);
}

/**
 * verifySession already re-reads role/active/username from the users table, so
 * demotion, deactivation, deletion and DB restores take effect immediately.
 */
export async function currentUser(): Promise<SessionUser | null> {
  return verifySession((await cookies()).get(COOKIE)?.value);
}

export async function requireRole(min: Role) {
  const u = await currentUser();
  if (!u || !roleAtLeast(u.role, min)) throw new Error(`Permission denied: ${min} role required`);
  return u;
}

/**
 * Same check for API routes: returns `{ res }` (a 401/403 response) or `{ user }`.
 * API routes must not rely solely on middleware for authorization.
 */
export async function guardApi(min: Role): Promise<{ res: NextResponse; user?: undefined } | { user: SessionUser; res?: undefined }> {
  const u = await currentUser();
  if (!u) return { res: NextResponse.json({ error: "Please log in" }, { status: 401 }) };
  if (!roleAtLeast(u.role, min)) return { res: NextResponse.json({ error: "Permission denied" }, { status: 403 }) };
  return { user: u };
}

export function defaultPasswordInUse() {
  const u = db().prepare("SELECT password_hash FROM users WHERE username = 'admin' AND active = 1").get() as
    | { password_hash: string }
    | undefined;
  return !!u && checkPassword("admin", u.password_hash);
}
