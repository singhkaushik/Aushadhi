import { NextRequest, NextResponse } from "next/server";
import { db, GROUPS } from "@/lib/db";
import { parseExpiry } from "@/lib/format";
import { guardApi } from "@/lib/auth";

type Row = Record<string, unknown>;
const s = (v: unknown) => {
  const t = String(v ?? "").trim();
  return t || null;
};
const n = (v: unknown) => {
  const t = String(v ?? "").replace(/[,₹\s]/g, "").replace(/(dr|cr)$/i, "");
  return Number(t) || 0;
};

function groupFor(v: unknown, fallback: string) {
  const t = String(v ?? "").toLowerCase();
  if (!t) return fallback;
  const exact = Object.keys(GROUPS).find((g) => g.toLowerCase() === t);
  if (exact) return exact;
  if (/creditor|supplier|vendor/.test(t)) return "Sundry Creditors";
  if (/debtor|customer|retail|buyer|chemist/.test(t)) return "Sundry Debtors";
  if (/bank/.test(t)) return "Bank Accounts";
  if (/cash/.test(t)) return "Cash-in-Hand";
  if (/expense/.test(t)) return "Indirect Expenses";
  return fallback;
}

const IMPORT_TYPES = ["parties", "items", "stock"];
const MAX_ROWS = 5000;

export async function POST(req: NextRequest) {
  const g = await guardApi("admin");
  if (g.res) return g.res;
  const { type, rows, defaultGroup = "Sundry Debtors" } = (await req.json()) as { type: string; rows: Row[]; defaultGroup?: string };
  if (!IMPORT_TYPES.includes(type)) return NextResponse.json({ error: "Unknown import type" }, { status: 400 });
  if (!Array.isArray(rows)) return NextResponse.json({ error: "No rows provided" }, { status: 400 });
  if (rows.length > MAX_ROWS) return NextResponse.json({ error: `Too many rows — import in batches of ${MAX_ROWS}` }, { status: 400 });
  if (!Object.keys(GROUPS).includes(defaultGroup)) return NextResponse.json({ error: "Invalid default group" }, { status: 400 });
  const d = db();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  try {
    d.transaction(() => {
      if (type === "parties") {
        const find = d.prepare("SELECT id FROM accounts WHERE name = ? COLLATE NOCASE");
        const ins = d.prepare(
          "INSERT INTO accounts (name, grp, address, city, state, phone, email, gstin, dl_no, opening, credit_days) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        );
        const upd = d.prepare(
          `UPDATE accounts SET grp=?, address=COALESCE(?,address), city=COALESCE(?,city), state=COALESCE(?,state), phone=COALESCE(?,phone),
           email=COALESCE(?,email), gstin=COALESCE(?,gstin), dl_no=COALESCE(?,dl_no), opening=?, credit_days=? WHERE id=?`,
        );
        for (const r of rows) {
          const name = s(r.name);
          if (!name) { skipped++; continue; }
          const grp = groupFor(r.grp, defaultGroup);
          let amt = n(r.opening);
          const sideText = `${r.opening_side ?? ""} ${r.opening ?? ""}`.toLowerCase();
          if (/\bcr\b|cr$|credit/.test(sideText)) amt = -Math.abs(amt);
          else if (/\bdr\b|dr$|debit/.test(sideText)) amt = Math.abs(amt);
          else if (GROUPS[grp] === "liability") amt = -Math.abs(amt);
          const vals = [grp, s(r.address), s(r.city), s(r.state), s(r.phone), s(r.email), s(r.gstin)?.toUpperCase() ?? null, s(r.dl_no), amt, n(r.credit_days)];
          const ex = find.get(name) as { id: number } | undefined;
          if (ex) { upd.run(...vals, ex.id); updated++; }
          else { ins.run(name, ...vals); created++; }
        }
      } else if (type === "items" || type === "stock") {
        const find = d.prepare("SELECT id FROM items WHERE name = ? COLLATE NOCASE");
        const ins = d.prepare(
          `INSERT INTO items (name, company, salt, pack, unit, hsn, gst_rate, mrp, ptr, pts, purchase_rate, rack, schedule, barcode, min_stock)
           VALUES (?,?,?,?,COALESCE(?, 'PCS'),?,?,?,?,?,?,?,?,?,?)`,
        );
        const upd = d.prepare(
          `UPDATE items SET company=COALESCE(?,company), salt=COALESCE(?,salt), pack=COALESCE(?,pack), unit=COALESCE(?,unit), hsn=COALESCE(?,hsn),
           gst_rate=CASE WHEN ? THEN ? ELSE gst_rate END, mrp=CASE WHEN ? > 0 THEN ? ELSE mrp END, ptr=CASE WHEN ? > 0 THEN ? ELSE ptr END,
           pts=CASE WHEN ? > 0 THEN ? ELSE pts END, purchase_rate=CASE WHEN ? > 0 THEN ? ELSE purchase_rate END,
           rack=COALESCE(?,rack), schedule=COALESCE(?,schedule), barcode=COALESCE(?,barcode), min_stock=CASE WHEN ? > 0 THEN ? ELSE min_stock END WHERE id=?`,
        );
        const batch = d.prepare(
          `INSERT INTO batches (item_id, batch_no, expiry, mrp, purchase_rate, sale_rate, opening_qty, qty) VALUES (?,?,?,?,?,?,?,?)
           ON CONFLICT(item_id, batch_no) DO UPDATE SET expiry=COALESCE(excluded.expiry, expiry), mrp=excluded.mrp,
           purchase_rate=excluded.purchase_rate, sale_rate=excluded.sale_rate,
           qty = qty - opening_qty + excluded.opening_qty, opening_qty = excluded.opening_qty`,
        );
        for (const r of rows) {
          const name = s(r.name);
          if (!name) { skipped++; continue; }
          const hasGst = s(r.gst_rate) !== null;
          const gst = n(r.gst_rate);
          const ptr = n(r.ptr ?? r.sale_rate);
          const pr = n(r.purchase_rate);
          const mrp = n(r.mrp);
          let ex = find.get(name) as { id: number } | undefined;
          if (ex) {
            upd.run(s(r.company), s(r.salt), s(r.pack), s(r.unit), s(r.hsn), hasGst ? 1 : 0, gst, mrp, mrp, ptr, ptr, n(r.pts), n(r.pts),
              pr, pr, s(r.rack), s(r.schedule), s(r.barcode), n(r.min_stock), n(r.min_stock), ex.id);
            if (type === "items") updated++;
          } else {
            const id = Number(ins.run(name, s(r.company), s(r.salt), s(r.pack), s(r.unit), s(r.hsn), hasGst ? gst : 12, mrp, ptr, n(r.pts), pr,
              s(r.rack), s(r.schedule), s(r.barcode), n(r.min_stock)).lastInsertRowid);
            ex = { id };
            if (type === "items") created++;
          }
          if (type === "stock") {
            const qty = n(r.qty);
            const bno = (s(r.batch_no) || "NA").toUpperCase();
            const existed = d.prepare("SELECT id FROM batches WHERE item_id = ? AND batch_no = ?").get(ex.id, bno);
            batch.run(ex.id, bno, parseExpiry(r.expiry), mrp, pr, ptr, qty, qty);
            if (existed) updated++;
            else created++;
          }
        }
      } else {
        throw new Error("Unknown import type");
      }
    })();
  } catch (e) {
    errors.push((e as Error).message);
    return NextResponse.json({ created: 0, updated: 0, skipped, errors }, { status: 400 });
  }
  return NextResponse.json({ created, updated, skipped, errors });
}
