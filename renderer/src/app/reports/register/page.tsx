import Link from "next/link";
import { db } from "@/lib/db";
import { fmtDate, money, VOUCHER_LABEL, vno } from "@/lib/format";
import { range } from "@/lib/reports";
import DateRange from "@/components/DateRange";

export default async function Register({ searchParams }: { searchParams: Promise<{ type?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const type = ["sale", "purchase", "sale_return", "purchase_return"].includes(sp.type || "") ? sp.type! : "sale";
  const { from, to } = range(sp);
  const rows = db()
    .prepare(
      `SELECT v.*, a.name AS party, a.gstin FROM vouchers v LEFT JOIN accounts a ON a.id = v.party_id
       WHERE v.type = ? AND v.date BETWEEN ? AND ? ORDER BY v.date, v.number`,
    )
    .all(type, from, to) as Record<string, string | number>[];
  const sum = (k: string) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);
  return (
    <div>
      <h1 className="h1">{VOUCHER_LABEL[type]} Register</h1>
      <DateRange from={from} to={to}>
        <div><label className="label">Type</label>
          <select name="type" defaultValue={type} className="input">
            {["sale", "purchase", "sale_return", "purchase_return"].map((t) => <option key={t} value={t}>{VOUCHER_LABEL[t]}</option>)}
          </select>
        </div>
      </DateRange>
      <div className="card p-0">
        <table className="tbl">
          <thead><tr><th>Date</th><th>No</th><th>Party</th><th>GSTIN</th><th>Ref</th><th className="num">Taxable</th><th className="num">CGST</th><th className="num">SGST</th><th className="num">IGST</th><th className="num">Total</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{fmtDate(r.date as string)}</td>
                <td><Link href={`/vouchers/view/${r.id}`} className="text-teal-700 hover:underline">{vno(type, r.number as number)}</Link></td>
                <td>{r.party || "Cash"}</td><td>{r.gstin}</td><td>{r.ref_no}</td>
                <td className="num">{money(Number(r.taxable))}</td><td className="num">{money(Number(r.cgst))}</td><td className="num">{money(Number(r.sgst))}</td>
                <td className="num">{money(Number(r.igst))}</td><td className="num">{money(Number(r.total))}</td>
              </tr>
            ))}
            <tr className="font-semibold"><td colSpan={5} className="text-right">Total ({rows.length} bills)</td>
              {["taxable", "cgst", "sgst", "igst", "total"].map((k) => <td key={k} className="num">{money(sum(k))}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
