import crypto from "crypto";
import fs from "fs";
import path from "path";

export type Role = "admin" | "billing" | "viewer";
export type SessionUser = { id: number; username: string; role: Role };
export const COOKIE = "erp_session";

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

export function signSession(u: SessionUser, days = 7) {
  const payload = Buffer.from(JSON.stringify({ ...u, exp: Date.now() + days * 86400000 })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifySession(token?: string | null): SessionUser | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.exp < Date.now()) return null;
    return { id: data.id, username: data.username, role: data.role };
  } catch {
    return null;
  }
}
