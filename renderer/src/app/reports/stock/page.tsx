import Link from "next/link";
import { db } from "@/lib/db";
import { fmtExpiry, money } from "@/lib/format";

export default async function Stock({ searchParams }: { searchParams: Promise<{ q?: string; batch?: string; zero?: string }> }) {
  const { q = "", batch, zero } = await searchParams;
  const d = db();
  const items = d
    .prepare(
      `SELECT i.id, i.name, i.company, i.pack, i.mrp, COALESCE(SUM(b.qty), 0) AS qty, COALESCE(SUM(b.qty * b.purchase_rate), 0) AS value
       FROM items i LEFT JOIN batches b ON b.item_id = i.id AND b.qty <> 0
       WHERE i.active = 1 AND (i.name LIKE ? OR IFNULL(i.company,'') LIKE ?)
       GROUP BY i.id ${zero ? "" : "HAVING qty <> 0"} ORDER BY i.name`,
    )
    .all(`%${q}%`, `%${q}%`) as Record<string, string | number>[];
  const bq = d.prepare("SELECT * FROM batches WHERE item_id = ? AND qty <> 0 ORDER BY expiry");
  const total = items.reduce((a, i) => a + Number(i.value), 0);
  return (
    <div>
      <h1 className="h1">Stock Summary</h1>
      <form className="no-print mb-3 flex items-center gap-3">
        <input name="q" defaultValue={q} placeholder="Item / company" className="input max-w-xs" />
        <label className="text-sm"><input type="checkbox" name="batch" value="1" defaultChecked={!!batch} /> Batch-wise</label>
        <label className="text-sm"><input type="checkbox" name="zero" value="1" defaultChecked={!!zero} /> Include zero stock</label>
        <button className="btn-sec">Show</button>
      </form>
      <div className="card p-0">
        <table className="tbl">
          <thead><tr><th>Item</th><th>Company</th><th>Pack</th>{batch && <><th>Batch</th><th>Expiry</th></>}<th className="num">Qty</th><th className="num">MRP</th><th className="num">Value (Pur.)</th></tr></thead>
          <tbody>
            {items.map((i) =>
              batch ? (
                (bq.all(i.id) as Record<string, string | number>[]).map((b) => (
                  <tr key={`${i.id}-${b.id}`}>
                    <td><Link href={`/masters/items/${i.id}`} className="hover:underline">{i.name}</Link></td><td>{i.company}</td><td>{i.pack}</td>
                    <td>{b.batch_no}</td><td>{fmtExpiry(b.expiry as string)}</td><td className="num">{b.qty}</td>
                    <td className="num">{money(Number(b.mrp))}</td><td className="num">{money(Number(b.qty) * Number(b.purchase_rate))}</td>
                  </tr>
                ))
              ) : (
                <tr key={i.id}>
                  <td><Link href={`/masters/items/${i.id}`} className="hover:underline">{i.name}</Link></td><td>{i.company}</td><td>{i.pack}</td>
                  <td className="num">{i.qty}</td><td className="num">{money(Number(i.mrp))}</td><td className="num">{money(Number(i.value))}</td>
                </tr>
              ),
            )}
            <tr className="font-semibold"><td colSpan={batch ? 7 : 5} className="text-right">Total Stock Value</td><td className="num">{money(total)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
