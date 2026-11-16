import Link from "next/link";
import { db } from "@/lib/db";
import { fmtExpiry, money, today } from "@/lib/format";

export default async function Expiry({ searchParams }: { searchParams: Promise<{ months?: string }> }) {
  const months = Number((await searchParams).months || 3);
  const t = today();
  const cur = t.slice(0, 7);
  const lim = new Date(t + "T00:00:00Z");
  lim.setUTCMonth(lim.getUTCMonth() + months);
  const limit = lim.toISOString().slice(0, 7);
  const rows = db()
    .prepare(
      `SELECT b.*, i.name, i.company, i.pack FROM batches b JOIN items i ON i.id = b.item_id
       WHERE b.qty > 0 AND b.expiry IS NOT NULL AND b.expiry <= ? ORDER BY b.expiry, i.name`,
    )
    .all(limit) as Record<string, string | number>[];
  const expired = rows.filter((r) => String(r.expiry) < cur);
  const near = rows.filter((r) => String(r.expiry) >= cur);
  const T = ({ list, title, cls }: { list: typeof rows; title: string; cls: string }) => (
    <>
      <h2 className={`mt-4 mb-1 font-semibold ${cls}`}>{title} ({list.length})</h2>
      <div className="card p-0">
        <table className="tbl">
          <thead><tr><th>Item</th><th>Company</th><th>Pack</th><th>Batch</th><th>Expiry</th><th className="num">Qty</th><th className="num">MRP</th><th className="num">Value</th></tr></thead>
          <tbody>
            {list.map((b) => (
              <tr key={b.id}>
                <td><Link href={`/masters/items/${b.item_id}`} className="hover:underline">{b.name}</Link></td><td>{b.company}</td><td>{b.pack}</td>
                <td>{b.batch_no}</td><td>{fmtExpiry(b.expiry as string)}</td><td className="num">{b.qty}</td><td className="num">{money(Number(b.mrp))}</td>
                <td className="num">{money(Number(b.qty) * Number(b.purchase_rate))}</td>
              </tr>
            ))}
            <tr className="font-semibold"><td colSpan={7} className="text-right">Total</td><td className="num">{money(list.reduce((a, b) => a + Number(b.qty) * Number(b.purchase_rate), 0))}</td></tr>
          </tbody>
        </table>
      </div>
    </>
  );
  return (
    <div>
      <h1 className="h1">Expiry Report</h1>
      <form className="no-print flex items-end gap-2">
        <div><label className="label">Near expiry within (months)</label><input name="months" type="number" defaultValue={months} className="input w-32" /></div>
        <button className="btn-sec">Show</button>
      </form>
      <T list={expired} title="Expired" cls="text-red-700" />
      <T list={near} title={`Expiring within ${months} months`} cls="text-amber-700" />
    </div>
  );
}
