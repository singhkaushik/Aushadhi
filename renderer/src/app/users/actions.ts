"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { checkPassword, currentUser, hashPassword, requireRole, ROLES } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function addUser(f: FormData) {
  const u = await requireRole("admin");
  const username = String(f.get("username") || "").trim();
  const pw = String(f.get("password") || "");
  const role = String(f.get("role") || "billing");
  if (!username || pw.length < 4) throw new Error("Username and a password of at least 4 characters are required");
  if (!ROLES.includes(role as (typeof ROLES)[number])) throw new Error("Invalid role");
  db().prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)").run(username, hashPassword(pw), role);
  audit(u.username, "create", "user", null, username);
  revalidatePath("/users");
}

export async function updateUser(f: FormData) {
  const u = await requireRole("admin");
  const id = Number(f.get("id"));
  const role = String(f.get("role"));
  if (!ROLES.includes(role as (typeof ROLES)[number])) throw new Error("Invalid role");
  const active = f.get("active") ? 1 : 0;
  const pw = String(f.get("password") || "");
  if (pw && pw.length < 4) throw new Error("Password must be at least 4 characters");
  const admins = db().prepare("SELECT COUNT(*) c FROM users WHERE role = 'admin' AND active = 1 AND id <> ?").get(id) as { c: number };
  if (admins.c === 0 && (role !== "admin" || !active)) throw new Error("At least one active admin is required");
  db().prepare("UPDATE users SET role = ?, active = ? WHERE id = ?").run(role, active, id);
  if (pw) db().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(pw), id);
  audit(u.username, "edit", "user", id, `role=${role}`);
  revalidatePath("/users");
}

export async function changeOwnPassword(f: FormData) {
  const u = await currentUser();
  if (!u) throw new Error("Not logged in");
  const row = db().prepare("SELECT password_hash FROM users WHERE id = ?").get(u.id) as { password_hash: string };
  if (!checkPassword(String(f.get("current") || ""), row.password_hash)) redirect("/password?err=1");
  const pw = String(f.get("password") || "");
  if (pw.length < 4 || pw !== String(f.get("confirm"))) redirect("/password?err=2");
  db().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(pw), u.id);
  redirect("/password?ok=1");
}
