import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accountBalance } from "@/lib/vouchers";
import { guardApi } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const g = await guardApi("viewer");
  if (g.res) return g.res;
  const q = req.nextUrl.searchParams.get("q") || "";
  const grp = req.nextUrl.searchParams.get("grp");
  const groups = grp ? grp.split(",").slice(0, 10) : null;
  const rows = db()
    .prepare(
      `SELECT * FROM accounts WHERE active = 1 AND name LIKE ? ${groups ? `AND grp IN (${groups.map(() => "?").join(",")})` : ""}
       ORDER BY CASE WHEN name LIKE ? THEN 0 ELSE 1 END, name LIMIT 30`,
    )
    .all(`%${q}%`, ...(groups ?? []), `${q}%`) as Record<string, unknown>[];
  return NextResponse.json(
    rows.map((a) => {
      const bal = accountBalance(a.id as number);
      return {
        ...a,
        label: a.name,
        sub: `${a.grp}${a.city ? " | " + a.city : ""}${a.gstin ? " | " + a.gstin : ""} | Bal ${Math.abs(bal).toFixed(2)} ${bal >= 0 ? "Dr" : "Cr"}`,
      };
    }),
  );
}
