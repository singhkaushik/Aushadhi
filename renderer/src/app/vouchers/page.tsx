import Link from "next/link";
import { db } from "@/lib/db";
import { fmtDate, isISODate, money, today, VOUCHER_LABEL, vno } from "@/lib/format";
import TypeBadge from "@/components/TypeBadge";

export default async function Vouchers({ searchParams }: { searchParams: Promise<{ type?: string; from?: string; to?: string; q?: string }> }) {
  const sp = await searchParams;
  const to = isISODate(sp.to) ? sp.to : today();
  const from = isISODate(sp.from) ? sp.from : to.slice(0, 8) + "01";
  const type = sp.type || "";
  const q = sp.q || "";
  const rows = db()
    .prepare(
      `SELECT v.*, a.name AS party FROM vouchers v LEFT JOIN accounts a ON a.id = v.party_id
       WHERE v.date BETWEEN ? AND ? ${type ? "AND v.type = ?" : ""} AND (IFNULL(a.name,'') LIKE ? OR IFNULL(v.ref_no,'') LIKE ?)
       ORDER BY v.date DESC, v.id DESC LIMIT 1000`,
    )
    .all(from, to, ...(type ? [type] : []), `%${q}%`, `%${q}%`) as Record<string, string | number>[];
  return (
    <div>
      <h1 className="h1">Vouchers</h1>
      <form className="mb-3 flex flex-wrap items-end gap-2">
        <div><label className="label">Type</label>
          <select name="type" defaultValue={type} className="input">
            <option value="">All</option>
            {Object.entries(VOUCHER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div><label className="label">From</label><input type="date" name="from" defaultValue={from} className="input" /></div>
        <div><label className="label">To</label><input type="date" name="to" defaultValue={to} className="input" /></div>
        <div><label className="label">Party / Ref</label><input name="q" defaultValue={q} className="input" /></div>
        <button className="btn-sec">Show</button>
      </form>
      <div className="card p-0">
        <table className="tbl">
          <thead><tr><th>Date</th><th>No</th><th>Type</th><th>Party</th><th>Ref</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id}>
                <td>{fmtDate(v.date as string)}</td>
                <td><Link href={`/vouchers/view/${v.id}`} className="text-teal-700 hover:underline">{vno(v.type as string, v.number as number)}</Link></td>
                <td><TypeBadge type={v.type as string} /></td>
                <td>{v.party || (v.cash_account_id ? "Cash" : "")}</td>
                <td>{v.ref_no}</td>
                <td className="num">{money(Number(v.total))}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="py-6 text-center text-slate-500">No vouchers</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
