import fs from "fs";
import os from "os";
import path from "path";
import { db } from "@/lib/db";
import { today } from "@/lib/format";

export async function GET() {
  const tmp = path.join(os.tmpdir(), `pharma-backup-${Date.now()}.db`);
  await db().backup(tmp);
  const buf = fs.readFileSync(tmp);
  fs.unlinkSync(tmp);
  return new Response(buf, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="pharma-erp-backup-${today()}.db"`,
    },
  });
}
