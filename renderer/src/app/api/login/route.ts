import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkPassword, ensureAdmin } from "@/lib/auth";
import { COOKIE, signSession, Role } from "@/lib/session";

export async function POST(req: NextRequest) {
  ensureAdmin();
  const { username, password } = await req.json();
  const u = db().prepare("SELECT * FROM users WHERE username = ? AND active = 1").get(String(username || "").trim()) as
    | { id: number; username: string; password_hash: string; role: Role }
    | undefined;
  if (!u || !checkPassword(String(password || ""), u.password_hash)) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, signSession({ id: u.id, username: u.username, role: u.role }), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 86400,
  });
  return res;
}
