import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { closeDb, db, dbPath } from "@/lib/db";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.subarray(0, 15).toString() !== "SQLite format 3") {
    return NextResponse.json({ error: "Not a valid backup file" }, { status: 400 });
  }
  const p = dbPath();
  const safety = `${p}.before-restore-${Date.now()}`;
  await db().backup(safety);
  closeDb();
  for (const ext of ["-wal", "-shm"]) if (fs.existsSync(p + ext)) fs.unlinkSync(p + ext);
  fs.writeFileSync(p, buf);
  db();
  return NextResponse.json({ ok: true });
}
