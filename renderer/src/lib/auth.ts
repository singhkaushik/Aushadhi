import crypto from "crypto";
import { cookies } from "next/headers";
import { db } from "./db";
import { COOKIE, Role, SessionUser, verifySession } from "./session";

export function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString("hex")}`;
}

export function checkPassword(pw: string, stored: string) {
  const [salt, hash] = stored.split(":");
  const h = crypto.scryptSync(pw, salt, 64);
  return crypto.timingSafeEqual(h, Buffer.from(hash, "hex"));
}

export function ensureAdmin() {
  const c = db().prepare("SELECT COUNT(*) c FROM users").get() as { c: number };
  if (c.c === 0) db().prepare("INSERT INTO users (username, password_hash, role) VALUES ('admin', ?, 'admin')").run(hashPassword("admin"));
}

export async function currentUser(): Promise<SessionUser | null> {
  return verifySession((await cookies()).get(COOKIE)?.value);
}

const RANK: Record<Role, number> = { viewer: 0, billing: 1, admin: 2 };

export async function requireRole(min: Role) {
  const u = await currentUser();
  if (!u || RANK[u.role] < RANK[min]) throw new Error(`Permission denied: ${min} role required`);
  return u;
}

export function defaultPasswordInUse() {
  const u = db().prepare("SELECT password_hash FROM users WHERE username = 'admin' AND active = 1").get() as
    | { password_hash: string }
    | undefined;
  return !!u && checkPassword("admin", u.password_hash);
}
