import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { NextRequest, NextResponse } from "next/server";
import { closeDb, db, dbPath } from "@/lib/db";
import { guardApi } from "@/lib/auth";
import { audit } from "@/lib/audit";

const MAX_BYTES = 256 * 1024 * 1024; // 256 MB — a pharma DB is nowhere near this
const SQLITE_MAGIC = Buffer.from("SQLite format 3\0", "binary");
const REQUIRED_TABLES = ["accounts", "items", "batches", "vouchers", "ledger_entries", "settings"];

/** Validate an upload is really one of this app's backups before touching the live DB. */
function validateBackup(buf: Buffer): string | null {
  if (buf.length < 100) return "File is too small to be a database backup";
  if (!buf.subarray(0, 16).equals(SQLITE_MAGIC)) return "Not a valid backup file";
  const tmp = path.join(os.tmpdir(), `restore-check-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  try {
    fs.writeFileSync(tmp, buf);
    const test = new Database(tmp, { readonly: true, fileMustExist: true });
    try {
      const names = new Set(
        (test.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((r) => r.name),
      );
      const missing = REQUIRED_TABLES.filter((t) => !names.has(t));
      if (missing.length) return `Backup is missing required tables: ${missing.join(", ")}`;
    } finally {
      test.close();
    }
    return null;
  } catch {
    return "Could not open the uploaded file as a SQLite database";
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

export async function POST(req: NextRequest) {
  try {
    const g = await guardApi("admin");
    if (g.res) return g.res;
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Backup file is too large" }, { status: 400 });
    const buf = Buffer.from(await file.arrayBuffer());
    const invalid = validateBackup(buf);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    const p = dbPath();
    const tmp = `${p}.restore-upload`;
    fs.writeFileSync(tmp, buf);
    const safety = `${p}.before-restore-${Date.now()}`;
    await db().backup(safety);
    // Flush the WAL into the main file so removing it cannot lose committed
    // transactions, then close our handle before replacing the file.
    try { db().pragma("wal_checkpoint(TRUNCATE)"); } catch { /* best effort */ }
    closeDb();
    // AV/indexers/other connections can hold -wal/-shm open briefly on Windows;
    // retry, then bail out cleanly BEFORE touching the live file.
    for (const ext of ["-wal", "-shm"]) {
      if (!fs.existsSync(p + ext)) continue;
      let removed = false;
      for (let i = 0; i < 10 && !removed; i++) {
        try { fs.unlinkSync(p + ext); removed = true; }
        catch { await new Promise((r) => setTimeout(r, 150)); }
      }
      if (!removed) {
        db(); // nothing was touched — keep the app usable
        try { fs.unlinkSync(tmp); } catch { /* ignore */ }
        return NextResponse.json(
          { error: `Cannot restore while another program is using the database (${path.basename(p)}${ext} is locked)` },
          { status: 400 },
        );
      }
    }
    try {
      fs.renameSync(tmp, p); // atomic replace — a crash can't leave a half-written DB
      db(); // reopen + migrate the restored file
      const uc = (db().prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c;
      if (!uc) throw new Error("Backup contains no user accounts");
    } catch (err) {
      // Roll back to the safety copy so the app is never left on a dead database.
      closeDb();
      for (const ext of ["-wal", "-shm"]) if (fs.existsSync(p + ext)) fs.unlinkSync(p + ext);
      fs.copyFileSync(safety, p);
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
      db();
      return NextResponse.json({ error: `Restore failed, previous data was kept: ${(err as Error).message}` }, { status: 400 });
    }
    // Keep the 3 most recent pre-restore safety copies, remove older ones.
    try {
      const dir = path.dirname(p);
      const prefix = `${path.basename(p)}.before-restore-`;
      const olds = fs.readdirSync(dir).filter((n) => n.startsWith(prefix)).sort();
      for (const n of olds.slice(0, -3)) fs.unlinkSync(path.join(dir, n));
    } catch {
      /* pruning is best-effort */
    }
    audit(g.user!.username, "edit", "settings", 0, `Restored database from ${(file as File).name}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
