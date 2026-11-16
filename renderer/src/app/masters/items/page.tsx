import Link from "next/link";
import { db } from "@/lib/db";
import { money } from "@/lib/format";

export default async function Items({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const rows = db()
    .prepare(
      `SELECT i.*, COALESCE((SELECT SUM(qty) FROM batches b WHERE b.item_id = i.id), 0) AS stock
       FROM items i WHERE i.active = 1 AND (i.name LIKE ? OR IFNULL(i.company,'') LIKE ? OR IFNULL(i.salt,'') LIKE ?)
       ORDER BY i.name LIMIT 500`,
    )
    .all(`%${q}%`, `%${q}%`, `%${q}%`) as Record<string, string | number>[];
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="h1 mb-0">Items / Products</h1>
        <Link href="/masters/items/new" className="btn">+ New Item</Link>
      </div>
      <form className="mb-3 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Search name / company / salt" className="input max-w-sm" />
        <button className="btn-sec">Search</button>
      </form>
      <div className="card p-0">
        <table className="tbl">
          <thead><tr><th>Name</th><th>Company</th><th>Pack</th><th>HSN</th><th className="num">GST%</th><th className="num">MRP</th><th className="num">PTR</th><th className="num">Pur. Rate</th><th className="num">Stock</th><th>Rack</th></tr></thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id}>
                <td><Link className="text-teal-700 hover:underline" href={`/masters/items/${i.id}`}>{i.name}</Link></td>
                <td>{i.company}</td><td>{i.pack}</td><td>{i.hsn}</td><td className="num">{i.gst_rate}</td>
                <td className="num">{money(Number(i.mrp))}</td><td className="num">{money(Number(i.ptr))}</td><td className="num">{money(Number(i.purchase_rate))}</td>
                <td className={`num ${Number(i.stock) <= Number(i.min_stock) ? "text-red-600" : ""}`}>{i.stock}</td><td>{i.rack}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={10} className="py-6 text-center text-slate-500">No items found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
