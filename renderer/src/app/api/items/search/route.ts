import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fmtExpiry } from "@/lib/format";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  const items = db()
    .prepare(
      `SELECT i.*, COALESCE((SELECT SUM(qty) FROM batches b WHERE b.item_id = i.id), 0) AS stock
       FROM items i WHERE i.active = 1 AND (i.name LIKE ? OR i.salt LIKE ? OR i.barcode = ?)
       ORDER BY CASE WHEN i.name LIKE ? THEN 0 ELSE 1 END, i.name LIMIT 30`,
    )
    .all(`%${q}%`, `%${q}%`, q, `${q}%`) as Record<string, unknown>[];
  const bq = db().prepare(
    "SELECT * FROM batches WHERE item_id = ? ORDER BY CASE WHEN qty > 0 THEN 0 ELSE 1 END, expiry IS NULL, expiry, id",
  );
  return NextResponse.json(
    items.map((i) => ({
      ...i,
      id: i.id,
      label: i.name,
      sub: `${i.company ?? ""} | Pack ${i.pack ?? "-"} | MRP ${i.mrp} | GST ${i.gst_rate}% | Stock ${i.stock}`,
      batches: (bq.all(i.id) as Record<string, unknown>[]).map((b) => ({
        ...b,
        expiryLabel: fmtExpiry(b.expiry as string),
      })),
    })),
  );
}
