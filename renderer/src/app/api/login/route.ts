import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkPassword } from "@/lib/auth";
import { COOKIE, signSession, Role } from "@/lib/session";

// Basic brute-force throttle: 10 failed tries per username within 5 minutes locks for 5 minutes.
const WINDOW_MS = 5 * 60 * 1000;
const MAX_TRIES = 10;
const attempts = new Map<string, { n: number; until: number }>();

function throttled(key: string) {
  const a = attempts.get(key);
  return !!a && a.until > Date.now() && a.n >= MAX_TRIES;
}
function recordFail(key: string) {
  const a = attempts.get(key);
  if (!a || a.until <= Date.now()) attempts.set(key, { n: 1, until: Date.now() + WINDOW_MS });
  else a.n++;
}
function clearFails(key: string) {
  attempts.delete(key);
}

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();
    const uname = String(username || "").trim();
    if (!uname) return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    if (throttled(uname.toLowerCase())) {
      return NextResponse.json({ error: "Too many attempts — try again in a few minutes" }, { status: 429 });
    }
    const u = db().prepare("SELECT * FROM users WHERE username = ? AND active = 1").get(uname) as
      | { id: number; username: string; password_hash: string; role: Role }
      | undefined;
    if (!u || !checkPassword(String(password || ""), u.password_hash)) {
      recordFail(uname.toLowerCase());
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }
    clearFails(uname.toLowerCase());
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE, signSession({ id: u.id, username: u.username, role: u.role }), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 86400,
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
