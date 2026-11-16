import crypto from "crypto";
import fs from "fs";
import path from "path";
import { db } from "./db";

export type Role = "admin" | "billing" | "viewer";
export type SessionUser = { id: number; username: string; role: Role };
export const COOKIE = "erp_session";
const VALID_ROLES: Role[] = ["admin", "billing", "viewer"];

function secret() {
  const dir = process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : path.join(process.cwd(), "data");
  const p = path.join(dir, ".secret");
  if (!fs.existsSync(p)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, crypto.randomBytes(32).toString("hex"), { mode: 0o600 });
    try {
      fs.chmodSync(p, 0o600);
    } catch {
      /* platform without POSIX permissions */
    }
  }
  return fs.readFileSync(p, "utf8").trim();
}

const hmac = (key: string, payload: string) => crypto.createHmac("sha256", key).update(payload).digest("base64url");

/**
 * The signature key includes the user's current password hash, so changing or
 * resetting a password invalidates every existing session for that user.
 * verifySession also re-reads role/active/username from the users table on each
 * call, so demotion, deactivation, deletion and DB restores take effect
 * immediately instead of surviving for the 7-day cookie lifetime.
 */
function signingKey(id: number) {
  const row = db().prepare("SELECT password_hash FROM users WHERE id = ?").get(id) as
    | { password_hash: string }
    | undefined;
  return row ? `${secret()}:${row.password_hash}` : null;
}

export function signSession(u: SessionUser, days = 7) {
  const key = signingKey(u.id);
  if (!key) throw new Error("Cannot sign a session for an unknown user");
  const payload = Buffer.from(JSON.stringify({ id: u.id, username: u.username, exp: Date.now() + days * 86400000 })).toString(
    "base64url",
  );
  return `${payload}.${hmac(key, payload)}`;
}

export function verifySession(token?: string | null): SessionUser | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  let data: { id: number; username: string; exp: number };
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }
  if (typeof data?.exp !== "number" || data.exp < Date.now()) return null;
  const row = db().prepare("SELECT username, role, active, password_hash FROM users WHERE id = ?").get(data.id) as
    | { username: string; role: Role; active: number; password_hash: string }
    | undefined;
  if (!row || !row.active || row.username !== data.username || !VALID_ROLES.includes(row.role)) return null;
  const expected = hmac(`${secret()}:${row.password_hash}`, payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return { id: data.id, username: row.username, role: row.role };
}
