import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { fmtDate, money, VOUCHER_LABEL, vno } from "@/lib/format";
import { range } from "@/lib/reports";
import DateRange from "@/components/DateRange";
import AccountPicker from "@/components/AccountPicker";

export default async function Ledger({ searchParams }: { searchParams: Promise<{ account?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const { from, to } = range(sp, "fy");
  const id = Number(sp.account || 0);
  const d = db();
  const acc = id ? (d.prepare("SELECT * FROM accounts WHERE id = ?").get(id) as Record<string, string | number>) : null;
  let rows: Record<string, string | number>[] = [];
  let opening = 0;
  if (acc) {
    opening = Number(acc.opening) + (d.prepare("SELECT COALESCE(SUM(debit - credit), 0) b FROM ledger_entries WHERE account_id = ? AND date < ?").get(id, from) as { b: number }).b;
    rows = d
      .prepare(
        `SELECT l.*, v.type, v.number, v.narration, v.ref_no,
          (SELECT GROUP_CONCAT(a.name, ', ') FROM ledger_entries l2 JOIN accounts a ON a.id = l2.account_id
           WHERE l2.voucher_id = l.voucher_id AND l2.account_id <> l.account_id AND ((l.debit > 0 AND l2.credit > 0) OR (l.credit > 0 AND l2.debit > 0))) AS contra
         FROM ledger_entries l JOIN vouchers v ON v.id = l.voucher_id
         WHERE l.account_id = ? AND l.date BETWEEN ? AND ? ORDER BY l.date, l.id`,
      )
      .all(id, from, to) as Record<string, string | number>[];
  }
  let bal = opening;
  const dr = rows.reduce((a, r) => a + Number(r.debit), 0);
  const cr = rows.reduce((a, r) => a + Number(r.credit), 0);
  const fmtBal = (b: number) => `${money(Math.abs(b))} ${b >= 0 ? "Dr" : "Cr"}`;
  return (
    <div>
      <h1 className="h1">Ledger {acc ? `— ${acc.name}` : ""}</h1>
      <div className="no-print flex flex-wrap items-end gap-3">
        <Suspense><AccountPicker name={(acc?.name as string) ?? ""} /></Suspense>
        <DateRange from={from} to={to}><input type="hidden" name="account" value={id || ""} /></DateRange>
      </div>
      {acc && (
        <div className="card p-0">
          <table className="tbl">
            <thead><tr><th>Date</th><th>Voucher</th><th>Particulars</th><th>Narration</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Balance</th></tr></thead>
            <tbody>
              <tr className="font-medium"><td>{fmtDate(from)}</td><td colSpan={5}>Opening Balance</td><td className="num">{fmtBal(opening)}</td></tr>
              {rows.map((r) => {
                bal += Number(r.debit) - Number(r.credit);
                return (
                  <tr key={r.id}>
                    <td>{fmtDate(r.date as string)}</td>
                    <td><Link href={`/vouchers/view/${r.voucher_id}`} className="text-teal-700 hover:underline">{VOUCHER_LABEL[r.type as string]} {vno(r.type as string, r.number as number)}</Link></td>
                    <td>{r.contra}</td><td className="text-xs text-slate-500">{r.ref_no} {r.narration}</td>
                    <td className="num">{Number(r.debit) ? money(Number(r.debit)) : ""}</td><td className="num">{Number(r.credit) ? money(Number(r.credit)) : ""}</td>
                    <td className="num">{fmtBal(bal)}</td>
                  </tr>
                );
              })}
              <tr className="font-semibold"><td colSpan={4} className="text-right">Total</td><td className="num">{money(dr)}</td><td className="num">{money(cr)}</td><td className="num">{fmtBal(bal)}</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
