import Link from "next/link";
import { db } from "@/lib/db";
import { fmtDate, money, VOUCHER_LABEL, vno } from "@/lib/format";
import { range } from "@/lib/reports";
import DateRange from "@/components/DateRange";

export default async function DayBook({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { from, to } = range(await searchParams, "today");
  const rows = db()
    .prepare(
      `SELECT v.*, a.name AS party, ca.name AS cash_name FROM vouchers v LEFT JOIN accounts a ON a.id = v.party_id
       LEFT JOIN accounts ca ON ca.id = v.cash_account_id WHERE v.date BETWEEN ? AND ? ORDER BY v.date, v.id`,
    )
    .all(from, to) as Record<string, string | number>[];
  const byType = new Map<string, number>();
  for (const r of rows) byType.set(r.type as string, (byType.get(r.type as string) || 0) + Number(r.total));
  return (
    <div>
      <h1 className="h1">Day Book</h1>
      <DateRange from={from} to={to} />
      <div className="mb-3 flex flex-wrap gap-2">
        {[...byType.entries()].map(([t, v]) => (
          <div key={t} className="card px-3 py-2 text-sm"><div className="text-xs text-slate-500">{VOUCHER_LABEL[t]}</div><div className="font-semibold">₹ {money(v)}</div></div>
        ))}
      </div>
      <div className="card p-0">
        <table className="tbl">
          <thead><tr><th>Date</th><th>Voucher</th><th>Type</th><th>Party</th><th>Narration</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{fmtDate(r.date as string)}</td>
                <td><Link href={`/vouchers/view/${r.id}`} className="text-teal-700 hover:underline">{vno(r.type as string, r.number as number)}</Link></td>
                <td>{VOUCHER_LABEL[r.type as string]}</td><td>{r.party || r.cash_name}</td><td className="text-xs text-slate-500">{r.narration}</td>
                <td className="num">{money(Number(r.total))}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="py-6 text-center text-slate-500">No vouchers in this period</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
