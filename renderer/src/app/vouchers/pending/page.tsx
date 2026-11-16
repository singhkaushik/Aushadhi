import Link from "next/link";
import { db } from "@/lib/db";
import { fmtDate, money, vno } from "@/lib/format";
import TypeBadge from "@/components/TypeBadge";
import { CONVERTS_TO } from "@/lib/vouchers";
import { currentUser } from "@/lib/auth";

export default async function Pending() {
  const canWrite = (await currentUser())?.role !== "viewer";
  const rows = db()
    .prepare(
      `SELECT v.*, a.name party FROM vouchers v LEFT JOIN accounts a ON a.id = v.party_id
       WHERE v.type IN ('sale_order','purchase_order','challan') AND v.status = 'open' ORDER BY v.date, v.id`,
    )
    .all() as Record<string, string | number>[];
  return (
    <div>
      <h1 className="h1">Pending Orders / Challans</h1>
      <div className="card p-0">
        <table className="tbl">
          <thead><tr><th>Date</th><th>No</th><th>Type</th><th>Party</th><th className="num">Amount</th><th></th></tr></thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id}>
                <td>{fmtDate(v.date as string)}</td>
                <td><Link href={`/vouchers/view/${v.id}`} className="text-teal-700 hover:underline">{vno(v.type as string, v.number as number)}</Link></td>
                <td><TypeBadge type={v.type as string} /></td><td>{v.party}</td><td className="num">{money(Number(v.total))}</td>
                <td>{canWrite && <Link href={`/vouchers/${CONVERTS_TO[v.type as string]}/new?from=${v.id}`} className="text-teal-700 hover:underline">Convert to bill →</Link>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="py-6 text-center text-slate-500">Nothing pending</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
