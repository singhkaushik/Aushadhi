import fs from "fs";
import os from "os";
import path from "path";
import { db } from "@/lib/db";
import { today } from "@/lib/format";
import { guardApi } from "@/lib/auth";

export async function GET() {
  const g = await guardApi("admin");
  if (g.res) return g.res;
  const tmp = path.join(os.tmpdir(), `pharma-backup-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  try {
    await db().backup(tmp);
    const buf = fs.readFileSync(tmp);
    return new Response(buf, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="pharma-erp-backup-${today()}.db"`,
      },
    });
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}
