import { NextRequest, NextResponse } from "next/server";
import { COOKIE, verifySession } from "@/lib/session";

const ADMIN_ONLY = ["/settings", "/import", "/users", "/api/import", "/api/restore", "/api/backup"];
const WRITE_PAGES = ["/vouchers/edit", "/masters/accounts/new", "/masters/items/new"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();
  const user = verifySession(req.cookies.get(COOKIE)?.value);
  const deny = (msg: string, status: number) =>
    pathname.startsWith("/api/")
      ? NextResponse.json({ error: msg }, { status })
      : status === 401
        ? NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname)}`, req.url))
        : NextResponse.redirect(new URL("/?denied=1", req.url));
  if (!user) return deny("Please log in", 401);
  const write = req.method !== "GET" && req.method !== "HEAD";
  if (user.role !== "admin" && ADMIN_ONLY.some((p) => pathname.startsWith(p))) return deny("Admin only", 403);
  if (user.role === "viewer") {
    if (write && pathname !== "/api/logout") return deny("Read-only user", 403);
    if (/^\/vouchers\/[^/]+\/new/.test(pathname) || WRITE_PAGES.some((p) => pathname.startsWith(p))) return deny("Read-only user", 403);
  }
  if (user.role === "billing" && req.method === "DELETE") return deny("Only admin can delete", 403);
  return NextResponse.next();
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
