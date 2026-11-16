import { db, getSettings } from "./db";
import { fmtExpiry } from "./format";
import type { InvoiceInitial, Row } from "@/components/InvoiceForm";
import type { CashInitial } from "@/components/CashForm";

export function companyInfo() {
  const s = getSettings();
  return { state: s.state || "", gstin: s.gstin || "" };
}

export function cashAccounts() {
  return db()
    .prepare("SELECT id, name FROM accounts WHERE active = 1 AND grp IN ('Cash-in-Hand','Bank Accounts') ORDER BY code IS NULL, id")
    .all() as { id: number; name: string }[];
}

export function salesmenList() {
  return db().prepare("SELECT id, name FROM salesmen WHERE active = 1 ORDER BY name").all() as { id: number; name: string }[];
}

/** Prefill a bill from an open order/challan. */
export function loadForConversion(sourceId: number, target: string): InvoiceInitial {
  const inv = loadInvoice(sourceId);
  const rows = inv.rows.map((r) => {
    if (target !== "sale" || r.batch_no) return r;
    const b = r.batches.find((x) => x.qty > 0);
    return b
      ? { ...r, batches: r.batches.filter((x) => x.qty > 0), batch_no: b.batch_no, expiry: fmtExpiry(b.expiry), mrp: b.mrp || r.mrp }
      : r;
  });
  return { ...inv, id: undefined, number: undefined, source_id: sourceId, rows };
}

export function loadInvoice(id: number): InvoiceInitial {
  const d = db();
  const v = d.prepare("SELECT * FROM vouchers WHERE id = ?").get(id) as Record<string, string | number | null>;
  const party = v.party_id
    ? (d.prepare("SELECT id, name, state, gstin, default_disc, salesman_id FROM accounts WHERE id = ?").get(v.party_id) as InvoiceInitial["party"])
    : null;
  const lines = d
    .prepare("SELECT vi.*, i.name AS item_name, i.pack, i.scheme_qty, i.scheme_free FROM voucher_items vi JOIN items i ON i.id = vi.item_id WHERE voucher_id = ? ORDER BY vi.id")
    .all(id) as Record<string, string | number | null>[];
  const bq = d.prepare("SELECT * FROM batches WHERE item_id = ? ORDER BY expiry");
  let key = 100000;
  const rows: Row[] = lines.map((l) => {
    const batches = (bq.all(l.item_id) as Row["batches"]).map((b) =>
      b.batch_no === l.batch_no && (v.type === "sale" || v.type === "purchase_return" || (v.type === "challan" && v.status !== "converted"))
        ? { ...b, qty: b.qty + Number(l.qty) + Number(l.free) }
        : b,
    );
    return {
      key: key++,
      item_id: Number(l.item_id),
      item_name: String(l.item_name),
      pack: (l.pack as string) ?? "",
      batches,
      batch_no: String(l.batch_no ?? ""),
      expiry: fmtExpiry(l.expiry as string),
      qty: Number(l.qty),
      free: Number(l.free) || "",
      mrp: Number(l.mrp) || "",
      rate: Number(l.rate) || "",
      disc_pct: Number(l.disc_pct) || "",
      gst_rate: Number(l.gst_rate),
      sale_rate: (batches.find((b) => b.batch_no === l.batch_no)?.sale_rate as number) || "",
      scheme_qty: Number(l.scheme_qty) || 0,
      scheme_free: Number(l.scheme_free) || 0,
    };
  });
  return {
    id,
    number: Number(v.number),
    date: String(v.date),
    party,
    cash: !!v.cash_account_id,
    salesman_id: (v.salesman_id as number) ?? null,
    ref_no: (v.ref_no as string) ?? "",
    ref_date: (v.ref_date as string) ?? "",
    narration: (v.narration as string) ?? "",
    rows,
  };
}

export function loadCash(id: number): CashInitial {
  const d = db();
  const v = d.prepare("SELECT * FROM vouchers WHERE id = ?").get(id) as Record<string, string | number | null>;
  const party = v.party_id ? (d.prepare("SELECT id, name FROM accounts WHERE id = ?").get(v.party_id) as { id: number; name: string }) : null;
  const les = d
    .prepare("SELECT l.*, a.name FROM ledger_entries l JOIN accounts a ON a.id = l.account_id WHERE voucher_id = ? ORDER BY l.id")
    .all(id) as { account_id: number; name: string; debit: number; credit: number }[];
  let key = 100000;
  return {
    id,
    number: Number(v.number),
    date: String(v.date),
    party,
    cash_account_id: (v.cash_account_id as number) ?? null,
    amount: Number(v.total),
    ref_no: (v.ref_no as string) ?? "",
    narration: (v.narration as string) ?? "",
    lines: [
      ...les.map((l) => ({ key: key++, account_id: l.account_id, name: l.name, debit: l.debit || ("" as const), credit: l.credit || ("" as const) })),
      { key: key++, account_id: 0, name: "", debit: "" as const, credit: "" as const },
    ],
  };
}
