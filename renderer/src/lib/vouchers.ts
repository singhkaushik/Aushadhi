import { db, fyOf, getSettings, sysAcc } from "./db";
import { isISODate, parseExpiry, r2 } from "./format";

export type BillType = "sale" | "purchase" | "sale_return" | "purchase_return";
export type InvoiceType = BillType | "sale_order" | "purchase_order" | "challan";
export const BILL_TYPES: BillType[] = ["sale", "purchase", "sale_return", "purchase_return"];
export const INVOICE_TYPES: InvoiceType[] = [...BILL_TYPES, "sale_order", "purchase_order", "challan"];
export const isBill = (t: string): t is BillType => (BILL_TYPES as string[]).includes(t);
/** Which voucher a document converts into. */
export const CONVERTS_TO: Record<string, BillType> = { sale_order: "sale", challan: "sale", purchase_order: "purchase" };

export type InvoiceLine = {
  item_id: number;
  batch_no: string;
  expiry?: string | null;
  qty: number;
  free?: number;
  mrp?: number;
  rate: number;
  disc_pct?: number;
  gst_rate: number;
  sale_rate?: number;
};

export type InvoiceInput = {
  type: InvoiceType;
  date: string;
  party_id: number | null;
  cash?: boolean;
  ref_no?: string;
  ref_date?: string;
  narration?: string;
  salesman_id?: number | null;
  source_id?: number | null;
  lines: InvoiceLine[];
};

/** Stock comes in for purchase/sale_return, goes out for sale/purchase_return/challan; orders don't move stock. */
const stockSign = (t: string) =>
  t === "purchase" || t === "sale_return" || t === "adjustment"
    ? 1
    : t === "sale" || t === "purchase_return" || t === "challan"
      ? -1
      : 0;
const needsExistingBatch = (t: string) => t === "sale" || t === "purchase_return" || t === "challan";
/** Party is debited for sale and purchase return. */
const partyDebit = (t: BillType) => t === "sale" || t === "purchase_return";
const mainAccount: Record<BillType, string> = {
  sale: "SALES",
  sale_return: "SALES_RET",
  purchase: "PURCHASE",
  purchase_return: "PURCH_RET",
};
const taxPrefix = (t: BillType) => (t === "sale" || t === "sale_return" ? "OUT" : "IN");

export function computeLine(l: InvoiceLine, interState: boolean) {
  const gross = r2(l.qty * l.rate);
  const disc = r2((gross * (l.disc_pct || 0)) / 100);
  const taxable = r2(gross - disc);
  const tax = r2((taxable * l.gst_rate) / 100);
  const igst = interState ? tax : 0;
  const cgst = interState ? 0 : r2(tax / 2);
  const sgst = interState ? 0 : r2(tax - cgst);
  return { gross, disc, taxable, cgst, sgst, igst, amount: r2(taxable + cgst + sgst + igst) };
}

export function isInterState(partyId: number | null) {
  if (!partyId) return false;
  const p = db().prepare("SELECT state, gstin FROM accounts WHERE id = ?").get(partyId) as
    | { state: string | null; gstin: string | null }
    | undefined;
  const s = getSettings();
  const companyState = (s.state || "").trim().toLowerCase();
  const partyState = (p?.state || "").trim().toLowerCase();
  if (s.gstin && p?.gstin && s.gstin.length >= 2 && p.gstin.length >= 2) {
    return s.gstin.slice(0, 2) !== p.gstin.slice(0, 2);
  }
  return !!partyState && !!companyState && partyState !== companyState;
}

/** Monotonic per (type, FY) sequence — numbers are never reused after a delete. */
function nextNumber(type: string, fy: number) {
  const d = db();
  d.prepare("INSERT OR IGNORE INTO voucher_seq (type, fy, next) VALUES (?, ?, 1)").run(type, fy);
  const r = d.prepare("UPDATE voucher_seq SET next = next + 1 WHERE type = ? AND fy = ? RETURNING next").get(type, fy) as {
    n: number;
  };
  return r.n - 1;
}

function applyStock(voucherId: number, sign: number) {
  if (!sign) return;
  const d = db();
  const lines = d.prepare("SELECT batch_id, qty, free FROM voucher_items WHERE voucher_id = ?").all(voucherId) as {
    batch_id: number | null;
    qty: number;
    free: number;
  }[];
  const upd = d.prepare("UPDATE batches SET qty = qty + ? WHERE id = ?");
  for (const l of lines) if (l.batch_id) upd.run(sign * (l.qty + l.free), l.batch_id);
}

function itemsOf(voucherId: number) {
  return (db().prepare("SELECT item_id FROM voucher_items WHERE voucher_id = ?").all(voucherId) as { item_id: number }[]).map(
    (r) => r.item_id,
  );
}

type BatchRow = { id: number; item_id: number; batch_no: string; qty: number };

function reverseVoucher(id: number) {
  const d = db();
  const v = d.prepare("SELECT * FROM vouchers WHERE id = ?").get(id) as { type: string; status: string } | undefined;
  if (!v) throw new Error("Voucher not found");
  if (v.status !== "converted") applyStock(id, -stockSign(v.type));
  d.prepare("DELETE FROM ledger_entries WHERE voucher_id = ?").run(id);
  d.prepare("DELETE FROM voucher_items WHERE voucher_id = ?").run(id);
  return v;
}

function checkNoNegative(itemIds: number[]) {
  if (!itemIds.length) return;
  const neg = db()
    .prepare(
      `SELECT i.name, b.batch_no, b.qty FROM batches b JOIN items i ON i.id = b.item_id
       WHERE b.qty < -0.0001 AND b.item_id IN (${itemIds.map(() => "?").join(",")})`,
    )
    .all(...itemIds) as { name: string; batch_no: string; qty: number }[];
  if (neg.length) {
    const n = neg[0];
    throw new Error(`Insufficient stock: ${n.name} batch ${n.batch_no} would become ${r2(n.qty)}`);
  }
}

function postLedger(voucherId: number, date: string, entries: [number, number][]) {
  const ins = db().prepare(
    "INSERT INTO ledger_entries (voucher_id, account_id, date, debit, credit) VALUES (?, ?, ?, ?, ?)",
  );
  const merged = new Map<number, number>();
  for (const [acc, amt] of entries) merged.set(acc, r2((merged.get(acc) || 0) + amt));
  let check = 0;
  for (const [acc, amt] of merged) {
    if (Math.abs(amt) < 0.005) continue;
    check += amt;
    ins.run(voucherId, acc, date, amt > 0 ? amt : 0, amt < 0 ? -amt : 0);
  }
  if (Math.abs(check) > 0.01) throw new Error(`Voucher not balanced (difference ${r2(check)})`);
}

export function saveInvoice(input: InvoiceInput, existingId?: number) {
  const d = db();
  const t = input.type;
  if (!INVOICE_TYPES.includes(t)) throw new Error("Invalid invoice type");
  if (!isISODate(input.date)) throw new Error("A valid date (YYYY-MM-DD) is required");
  if (!input.cash && !input.party_id) throw new Error("Select a party or mark as cash");
  for (const l of input.lines || []) {
    const qty = Number(l.qty) || 0;
    const free = Number(l.free) || 0;
    const rate = Number(l.rate) || 0;
    const disc = Number(l.disc_pct) || 0;
    const gst = Number(l.gst_rate) || 0;
    if (!l.item_id) continue;
    if (qty < 0 || free < 0) throw new Error("Quantity and free quantity cannot be negative");
    if (qty + free <= 0) throw new Error("Quantity cannot be zero on a filled line");
    if (rate < 0) throw new Error("Rate cannot be negative");
    if (Number(l.mrp) < 0) throw new Error("MRP cannot be negative");
    if (disc < 0 || disc > 100) throw new Error("Discount % must be between 0 and 100");
    if (gst < 0 || gst > 100) throw new Error("Invalid GST rate");
  }
  const lines = input.lines.filter((l) => l.item_id);
  if (!lines.length) throw new Error("Add at least one item");
  const fy = fyOf(input.date);

  return d.transaction(() => {
    let number: number;
    let id: number;
    let sourceId = input.source_id || null;
    const affected = new Set<number>();
    if (existingId) {
      const old = d.prepare("SELECT number, type, fy, status, source_id FROM vouchers WHERE id = ?").get(existingId) as
        | { number: number; type: string; fy: number; status: string; source_id: number | null }
        | undefined;
      if (!old) throw new Error("Voucher not found");
      if (old.type !== t) throw new Error("Cannot change voucher type");
      if (old.status === "converted") throw new Error("This document is already converted to a bill; edit the bill instead");
      itemsOf(existingId).forEach((i) => affected.add(i));
      reverseVoucher(existingId);
      number = old.fy === fy ? old.number : nextNumber(t, fy);
      sourceId = old.source_id;
      id = existingId;
    } else {
      number = nextNumber(t, fy);
      id = 0;
      if (sourceId) {
        const src = d.prepare("SELECT type, status FROM vouchers WHERE id = ?").get(sourceId) as
          | { type: string; status: string }
          | undefined;
        if (!src || CONVERTS_TO[src.type] !== t) throw new Error("Invalid source document");
        if (src.status === "converted") throw new Error("Source document already converted");
        itemsOf(sourceId).forEach((i) => affected.add(i));
        applyStock(sourceId, -stockSign(src.type));
        d.prepare("UPDATE vouchers SET status = 'converted' WHERE id = ?").run(sourceId);
      }
    }

    const inter = isInterState(input.party_id);
    const sign = stockSign(t);
    const findBatch = d.prepare("SELECT * FROM batches WHERE item_id = ? AND batch_no = ? COLLATE NOCASE");
    const insBatch = d.prepare(
      "INSERT INTO batches (item_id, batch_no, expiry, mrp, purchase_rate, sale_rate, qty) VALUES (?, ?, ?, ?, ?, ?, 0)",
    );
    const updBatchInfo = d.prepare(
      "UPDATE batches SET expiry = COALESCE(?, expiry), mrp = ?, purchase_rate = ?, sale_rate = COALESCE(?, sale_rate) WHERE id = ?",
    );
    const updQty = d.prepare("UPDATE batches SET qty = qty + ? WHERE id = ?");

    const computed = lines.map((l) => {
      const line = {
        ...l,
        qty: Number(l.qty) || 0,
        free: Number(l.free) || 0,
        rate: Number(l.rate) || 0,
        mrp: Number(l.mrp) || 0,
        disc_pct: Number(l.disc_pct) || 0,
        gst_rate: Number(l.gst_rate) || 0,
        batch_no: (l.batch_no || "").trim() || "NA",
        expiry: parseExpiry(l.expiry),
      };
      return { line, c: computeLine(line, inter) };
    });

    const tot = computed.reduce(
      (a, { c }) => ({
        gross: a.gross + c.gross,
        disc: a.disc + c.disc,
        taxable: a.taxable + c.taxable,
        cgst: a.cgst + c.cgst,
        sgst: a.sgst + c.sgst,
        igst: a.igst + c.igst,
      }),
      { gross: 0, disc: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0 },
    );
    const exact = r2(tot.taxable + tot.cgst + tot.sgst + tot.igst);
    const total = Math.round(exact);
    const roundOff = r2(total - exact);
    const cashAcc = input.cash ? sysAcc("CASH") : null;

    const vals = [
      t, fy, number, input.date, input.party_id || null, cashAcc, input.salesman_id || null, sourceId,
      input.ref_no || null, input.ref_date || null, input.narration || null, r2(tot.gross), r2(tot.disc),
      r2(tot.taxable), r2(tot.cgst), r2(tot.sgst), r2(tot.igst), roundOff, total,
    ];
    if (id) {
      d.prepare(
        `UPDATE vouchers SET type=?, fy=?, number=?, date=?, party_id=?, cash_account_id=?, salesman_id=?, source_id=?, ref_no=?,
         ref_date=?, narration=?, gross=?, discount=?, taxable=?, cgst=?, sgst=?, igst=?, round_off=?, total=? WHERE id=?`,
      ).run(...vals, id);
    } else {
      id = Number(
        d
          .prepare(
            `INSERT INTO vouchers (type, fy, number, date, party_id, cash_account_id, salesman_id, source_id, ref_no, ref_date,
             narration, gross, discount, taxable, cgst, sgst, igst, round_off, total) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(...vals).lastInsertRowid,
      );
    }

    const insLine = d.prepare(
      `INSERT INTO voucher_items (voucher_id, item_id, batch_id, batch_no, expiry, qty, free, mrp, rate, disc_pct,
       taxable, gst_rate, cgst, sgst, igst, amount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    for (const { line, c } of computed) {
      affected.add(line.item_id);
      if (sign === 0) {
        insLine.run(
          id, line.item_id, null, line.batch_no === "NA" ? null : line.batch_no, line.expiry || null, line.qty, line.free,
          line.mrp, line.rate, line.disc_pct, c.taxable, line.gst_rate, c.cgst, c.sgst, c.igst, c.amount,
        );
        continue;
      }
      let b = findBatch.get(line.item_id, line.batch_no) as (BatchRow & { expiry: string | null }) | undefined;
      if (!b) {
        if (needsExistingBatch(t)) {
          throw new Error(`Batch ${line.batch_no} not found for item #${line.item_id}`);
        }
        insBatch.run(
          line.item_id, line.batch_no, line.expiry || null, line.mrp,
          t === "purchase" ? line.rate : 0, line.sale_rate || 0,
        );
        b = findBatch.get(line.item_id, line.batch_no) as BatchRow & { expiry: string | null };
      } else if (t === "purchase") {
        updBatchInfo.run(line.expiry || null, line.mrp, line.rate, line.sale_rate || null, b.id);
      }
      if (t === "purchase") {
        d.prepare("UPDATE items SET purchase_rate = ?, mrp = CASE WHEN ? > 0 THEN ? ELSE mrp END WHERE id = ?").run(
          line.rate, line.mrp, line.mrp, line.item_id,
        );
        if (line.sale_rate) d.prepare("UPDATE items SET ptr = ? WHERE id = ?").run(line.sale_rate, line.item_id);
      }
      updQty.run(sign * (line.qty + line.free), b.id);
      insLine.run(
        id, line.item_id, b.id, b.batch_no, line.expiry || b.expiry || null, line.qty, line.free, line.mrp,
        line.rate, line.disc_pct, c.taxable, line.gst_rate, c.cgst, c.sgst, c.igst, c.amount,
      );
    }
    checkNoNegative([...affected]);
    if (!isBill(t)) return { id, number };

    const p = taxPrefix(t);
    const s = partyDebit(t) ? 1 : -1;
    const partyAcc = cashAcc || (input.party_id as number);
    postLedger(id, input.date, [
      [partyAcc, s * total],
      [sysAcc(mainAccount[t]), -s * r2(tot.taxable)],
      [sysAcc(`${p}_CGST`), -s * r2(tot.cgst)],
      [sysAcc(`${p}_SGST`), -s * r2(tot.sgst)],
      [sysAcc(`${p}_IGST`), -s * r2(tot.igst)],
      [sysAcc("ROUND_OFF"), -s * roundOff],
    ]);
    return { id, number };
  })();
}

export type CashInput = {
  type: "receipt" | "payment" | "journal";
  date: string;
  narration?: string;
  ref_no?: string;
  party_id?: number;
  cash_account_id?: number;
  amount?: number;
  lines?: { account_id: number; debit: number; credit: number }[];
};

const CASH_TYPES = ["receipt", "payment", "journal"] as const;

export function saveCashVoucher(input: CashInput, existingId?: number) {
  const d = db();
  if (!(CASH_TYPES as readonly string[]).includes(input.type)) throw new Error("Invalid voucher type");
  if (!isISODate(input.date)) throw new Error("A valid date (YYYY-MM-DD) is required");
  return d.transaction(() => {
    let entries: [number, number][];
    let total: number;
    const cashAccountId = input.type === "journal" ? null : Number(input.cash_account_id) || sysAcc("CASH");
    if (input.type === "journal") {
      const lines = (input.lines || []).filter((l) => l.account_id && (Number(l.debit) || Number(l.credit)));
      if (lines.length < 2) throw new Error("Journal needs at least two lines");
      for (const l of lines) {
        if (Number(l.debit) < 0 || Number(l.credit) < 0) throw new Error("Journal amounts cannot be negative");
        if (!d.prepare("SELECT id FROM accounts WHERE id = ?").get(Number(l.account_id)))
          throw new Error("Journal account not found");
      }
      entries = lines.map((l) => [Number(l.account_id), r2((Number(l.debit) || 0) - (Number(l.credit) || 0))]);
      total = r2(lines.reduce((a, l) => a + (Number(l.debit) || 0), 0));
    } else {
      const amt = r2(Number(input.amount) || 0);
      if (amt <= 0) throw new Error("Amount must be greater than zero");
      if (!input.party_id) throw new Error("Select an account");
      if (!d.prepare("SELECT id FROM accounts WHERE id = ?").get(Number(input.party_id)))
        throw new Error("Account not found");
      const s = input.type === "receipt" ? 1 : -1;
      entries = [
        [cashAccountId as number, s * amt],
        [Number(input.party_id), -s * amt],
      ];
      total = amt;
    }
    let id = existingId || 0;
    if (id) {
      const old = d.prepare("SELECT type FROM vouchers WHERE id = ?").get(id) as { type: string } | undefined;
      if (!old) throw new Error("Voucher not found");
      if (old.type !== input.type) throw new Error("Cannot change voucher type");
      reverseVoucher(id);
      d.prepare(
        "UPDATE vouchers SET date=?, party_id=?, cash_account_id=?, ref_no=?, narration=?, total=? WHERE id=?",
      ).run(input.date, input.party_id || null, cashAccountId, input.ref_no || null,
        input.narration || null, total, id);
    } else {
      const fy = fyOf(input.date);
      const number = nextNumber(input.type, fy);
      id = Number(
        d
          .prepare(
            "INSERT INTO vouchers (type, fy, number, date, party_id, cash_account_id, ref_no, narration, total) VALUES (?,?,?,?,?,?,?,?,?)",
          )
          .run(input.type, fy, number, input.date, input.party_id || null,
            cashAccountId, input.ref_no || null, input.narration || null, total).lastInsertRowid,
      );
    }
    postLedger(id, input.date, entries);
    return { id };
  })();
}

export type AdjustmentLine = {
  item_id: number;
  batch_no: string;
  expiry?: string | null;
  delta: number; // signed quantity: + adds stock, - removes (write-off)
  rate?: number; // value rate; defaults to batch/item purchase rate
};

export type AdjustmentInput = {
  type: "adjustment";
  date: string;
  narration?: string;
  ref_no?: string;
  lines: AdjustmentLine[];
};

/** Stock adjustment / write-off. Signed qty stored in voucher_items.qty; value posts Stock Write Off vs Purchase. */
export function saveAdjustment(input: AdjustmentInput, existingId?: number) {
  const d = db();
  if (!isISODate(input.date)) throw new Error("A valid date (YYYY-MM-DD) is required");
  const lines = (input.lines || []).filter((l) => l.item_id && Number(l.delta));
  if (!lines.length) throw new Error("Add at least one item");
  for (const l of lines) {
    if (!Number.isFinite(Number(l.delta))) throw new Error("Invalid adjustment quantity");
    if (Number(l.rate) < 0) throw new Error("Rate cannot be negative");
  }
  const fy = fyOf(input.date);

  return d.transaction(() => {
    let number: number;
    let id: number;
    const affected = new Set<number>();
    if (existingId) {
      const old = d.prepare("SELECT number, type, fy FROM vouchers WHERE id = ?").get(existingId) as
        | { number: number; type: string; fy: number }
        | undefined;
      if (!old) throw new Error("Voucher not found");
      if (old.type !== "adjustment") throw new Error("Cannot change voucher type");
      itemsOf(existingId).forEach((i) => affected.add(i));
      reverseVoucher(existingId);
      number = old.fy === fy ? old.number : nextNumber("adjustment", fy);
      id = existingId;
    } else {
      number = nextNumber("adjustment", fy);
      id = 0;
    }

    const findBatch = d.prepare("SELECT * FROM batches WHERE item_id = ? AND batch_no = ? COLLATE NOCASE");
    const insBatch = d.prepare(
      "INSERT INTO batches (item_id, batch_no, expiry, mrp, purchase_rate, sale_rate, qty) VALUES (?, ?, ?, ?, ?, ?, 0)",
    );
    const updQty = d.prepare("UPDATE batches SET qty = qty + ? WHERE id = ?");
    const itemRate = d.prepare("SELECT purchase_rate, mrp, name FROM items WHERE id = ?");

    const rows = lines.map((l) => {
      const item = itemRate.get(l.item_id) as { purchase_rate: number; mrp: number; name: string } | undefined;
      if (!item) throw new Error(`Item #${l.item_id} not found`);
      const delta = Number(l.delta);
      const batchNo = (l.batch_no || "").trim() || "NA";
      let b = findBatch.get(l.item_id, batchNo) as (BatchRow & { expiry: string | null; purchase_rate: number; mrp: number }) | undefined;
      const expiry = parseExpiry(l.expiry);
      if (!b) {
        if (delta < 0) throw new Error(`Batch ${batchNo} not found for ${item.name}`);
        const rate = Number(l.rate) || item.purchase_rate || 0;
        insBatch.run(l.item_id, batchNo, expiry, item.mrp, rate, 0);
        b = findBatch.get(l.item_id, batchNo) as BatchRow & { expiry: string | null; purchase_rate: number; mrp: number };
      }
      const rate = Number(l.rate) || b.purchase_rate || item.purchase_rate || 0;
      affected.add(l.item_id);
      return { l, b, delta, rate, expiry, amount: r2(Math.abs(delta) * rate) };
    });

    const total = r2(rows.reduce((a, r) => a + r.amount, 0));
    const vals = ["adjustment", fy, number, input.date, input.ref_no || null, input.narration || null, total];
    if (id) {
      d.prepare("UPDATE vouchers SET type=?, fy=?, number=?, date=?, ref_no=?, narration=?, total=? WHERE id=?").run(...vals, id);
    } else {
      id = Number(
        d.prepare("INSERT INTO vouchers (type, fy, number, date, ref_no, narration, total) VALUES (?,?,?,?,?,?,?)")
          .run(...vals).lastInsertRowid,
      );
    }

    const insLine = d.prepare(
      `INSERT INTO voucher_items (voucher_id, item_id, batch_id, batch_no, expiry, qty, free, mrp, rate, disc_pct,
       taxable, gst_rate, cgst, sgst, igst, amount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    for (const { l, b, delta, rate, expiry, amount } of rows) {
      updQty.run(delta, b.id);
      insLine.run(id, l.item_id, b.id, b.batch_no, expiry || b.expiry || null, delta, 0, b.mrp, rate, 0, 0, 0, 0, 0, 0, amount);
    }
    checkNoNegative([...affected]);

    const valueDelta = r2(rows.reduce((a, r) => a + r.delta * r.rate, 0));
    postLedger(id, input.date, [
      [sysAcc("STOCK_WO"), -valueDelta],
      [sysAcc("PURCHASE"), valueDelta],
    ]);
    return { id, number };
  })();
}

export function deleteVoucher(id: number) {
  const d = db();
  d.transaction(() => {
    const v = d.prepare("SELECT source_id, status FROM vouchers WHERE id = ?").get(id) as
      | { source_id: number | null; status: string }
      | undefined;
    if (!v) throw new Error("Voucher not found");
    if (v.status === "converted") throw new Error("Already converted to a bill; delete the bill first");
    const items = itemsOf(id);
    reverseVoucher(id);
    if (v.source_id) {
      const src = d.prepare("SELECT type FROM vouchers WHERE id = ?").get(v.source_id) as { type: string } | undefined;
      if (src) {
        d.prepare("UPDATE vouchers SET status = 'open' WHERE id = ?").run(v.source_id);
        applyStock(v.source_id, stockSign(src.type));
        items.push(...itemsOf(v.source_id));
      }
    }
    checkNoNegative(items);
    d.prepare("DELETE FROM vouchers WHERE id = ?").run(id);
  })();
}

export function accountBalance(accountId: number, upto?: string) {
  const d = db();
  const a = d.prepare("SELECT opening FROM accounts WHERE id = ?").get(accountId) as { opening: number };
  const r = d
    .prepare(
      `SELECT COALESCE(SUM(debit - credit), 0) AS b FROM ledger_entries WHERE account_id = ? ${upto ? "AND date <= ?" : ""}`,
    )
    .get(...(upto ? [accountId, upto] : [accountId])) as { b: number };
  return r2((a?.opening || 0) + r.b);
}
