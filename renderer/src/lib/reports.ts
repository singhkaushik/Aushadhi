import { db, GROUPS } from "./db";
import { r2, today } from "./format";

export function fyStart(date = today()) {
  const [y, m] = date.split("-").map(Number);
  return `${m >= 4 ? y : y - 1}-04-01`;
}

export function range(sp: { from?: string; to?: string }, defaultFrom: "month" | "fy" | "today" = "month") {
  const to = sp.to || today();
  const from = sp.from || (defaultFrom === "fy" ? fyStart(to) : defaultFrom === "today" ? to : to.slice(0, 8) + "01");
  return { from, to };
}

// Adjustments store a signed delta in vi.qty, so their movement must be counted (+1 × delta).
const STOCK_SIGN_SQL = `CASE WHEN v.type IN ('purchase','sale_return','adjustment') THEN 1
  WHEN v.type IN ('sale','purchase_return') OR (v.type = 'challan' AND v.status <> 'converted') THEN -1 ELSE 0 END`;

/** Stock value at purchase rate as of a date (inclusive). Pass null for opening stock. */
export function stockValue(upto: string | null) {
  const rows = db()
    .prepare(
      `SELECT b.purchase_rate, b.opening_qty + COALESCE((
         SELECT SUM(${STOCK_SIGN_SQL} * (vi.qty + vi.free)) FROM voucher_items vi JOIN vouchers v ON v.id = vi.voucher_id
         WHERE vi.batch_id = b.id AND v.date <= ?), 0) AS q
       FROM batches b`,
    )
    .all(upto ?? "0000-00-00") as { purchase_rate: number; q: number }[];
  return r2(rows.reduce((a, r) => a + Math.max(r.q, 0) * (r.purchase_rate || 0), 0));
}

export type Bal = { id: number; name: string; grp: string; code: string | null; opening: number; period: number; closing: number };

/** Account balances: opening (as of before `from`), period movement, closing (as of `to`). */
export function balances(from: string, to: string): Bal[] {
  return db()
    .prepare(
      `SELECT a.id, a.name, a.grp, a.code,
        a.opening + COALESCE((SELECT SUM(debit - credit) FROM ledger_entries l WHERE l.account_id = a.id AND l.date < ?), 0) AS opening,
        COALESCE((SELECT SUM(debit - credit) FROM ledger_entries l WHERE l.account_id = a.id AND l.date BETWEEN ? AND ?), 0) AS period
       FROM accounts a ORDER BY a.grp, a.name`,
    )
    .all(from, from, to)
    .map((r) => {
      const b = r as Bal;
      return { ...b, opening: r2(b.opening), period: r2(b.period), closing: r2(b.opening + b.period) };
    });
}

export function profitAndLoss(from: string, to: string) {
  const bals = balances(from, to);
  const sum = (filter: (b: Bal) => boolean) => r2(bals.filter(filter).reduce((a, b) => a + b.period, 0));
  const byGroup = (g: string) => bals.filter((b) => b.grp === g && Math.abs(b.period) > 0.004);
  const openingStock = from <= "0001" ? stockValue(null) : stockValue(prevDay(from));
  const closingStock = stockValue(to);
  const sales = -sum((b) => b.grp === "Sales Accounts");
  const purchases = sum((b) => b.grp === "Purchase Accounts");
  const directExp = sum((b) => b.grp === "Direct Expenses");
  const directInc = -sum((b) => b.grp === "Direct Incomes");
  const gross = r2(sales + directInc + closingStock - openingStock - purchases - directExp);
  const indirectExp = sum((b) => b.grp === "Indirect Expenses");
  const indirectInc = -sum((b) => b.grp === "Indirect Incomes");
  const net = r2(gross + indirectInc - indirectExp);
  return {
    openingStock, closingStock, sales, purchases, directExp, directInc, gross, indirectExp, indirectInc, net,
    groups: {
      sales: byGroup("Sales Accounts"), purchases: byGroup("Purchase Accounts"), directExp: byGroup("Direct Expenses"),
      directInc: byGroup("Direct Incomes"), indirectExp: byGroup("Indirect Expenses"), indirectInc: byGroup("Indirect Incomes"),
    },
  };
}

export function balanceSheet(to: string) {
  const bals = balances("0000-00-00", to);
  const pl = profitAndLoss("0000-00-00", to);
  const assets: Record<string, Bal[]> = {};
  const liabilities: Record<string, Bal[]> = {};
  for (const b of bals) {
    const nature = GROUPS[b.grp];
    if (Math.abs(b.closing) < 0.005 || nature === "income" || nature === "expense") continue;
    const target = nature === "asset" ? assets : liabilities;
    (target[b.grp] ||= []).push(b);
  }
  const totalAssetsAcc = r2(Object.values(assets).flat().reduce((a, b) => a + b.closing, 0));
  const totalLiabAcc = r2(-Object.values(liabilities).flat().reduce((a, b) => a + b.closing, 0));
  const openingStock = stockValue(null);
  const accOpening = (db().prepare("SELECT COALESCE(SUM(opening), 0) AS s FROM accounts").get() as { s: number }).s;
  // Opening stock + opening Dr balances should equal opening Cr balances; any gap is shown like Tally does.
  const diff = r2(accOpening + openingStock);
  const assetsTotal = r2(totalAssetsAcc + pl.closingStock);
  const liabTotal = r2(totalLiabAcc + pl.net + diff);
  return { assets, liabilities, closingStock: pl.closingStock, profit: pl.net, diff, assetsTotal, liabTotal };
}

export function prevDay(date: string) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export type PendingBill = { voucher_id: number | null; type: string; number: number | null; date: string; amount: number; pending: number; days: number };

/** FIFO bill-wise outstanding for a party. side = 1 for receivable (debits are bills), -1 for payable. */
export function pendingBills(accountId: number, side: 1 | -1, asOf = today()): PendingBill[] {
  const d = db();
  const a = d.prepare("SELECT opening FROM accounts WHERE id = ?").get(accountId) as { opening: number };
  const entries = d
    .prepare(
      `SELECT l.voucher_id, v.type, v.number, l.date, (l.debit - l.credit) * ? AS amt FROM ledger_entries l
       JOIN vouchers v ON v.id = l.voucher_id WHERE l.account_id = ? AND l.date <= ? ORDER BY l.date, l.id`,
    )
    .all(side, accountId, asOf) as { voucher_id: number; type: string; number: number; date: string; amt: number }[];
  const bills: PendingBill[] = [];
  let credit = 0;
  const op = (a?.opening || 0) * side;
  if (op > 0) bills.push({ voucher_id: null, type: "opening", number: null, date: "", amount: op, pending: op, days: 0 });
  else credit += -op;
  for (const e of entries) {
    if (e.amt > 0) bills.push({ voucher_id: e.voucher_id, type: e.type, number: e.number, date: e.date, amount: e.amt, pending: e.amt, days: 0 });
    else credit += -e.amt;
  }
  for (const b of bills) {
    const use = Math.min(b.pending, credit);
    b.pending = r2(b.pending - use);
    credit = r2(credit - use);
  }
  const now = new Date(asOf + "T00:00:00Z").getTime();
  const open = bills
    .filter((b) => b.pending > 0.004)
    .map((b) => ({ ...b, days: b.date ? Math.floor((now - new Date(b.date + "T00:00:00Z").getTime()) / 86400000) : 0 }));
  // Unallocated receipts/advances (payments not consumed by any bill) — shown like Tally's "On Account".
  if (credit > 0.004) open.push({ voucher_id: null, type: "advance", number: null, date: "", amount: -r2(credit), pending: -r2(credit), days: 0 });
  return open;
}
