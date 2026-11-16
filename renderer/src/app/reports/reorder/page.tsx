import Link from "next/link";
import { db } from "@/lib/db";

export default async function Reorder() {
  const rows = db()
    .prepare(
      `SELECT i.*, COALESCE((SELECT SUM(qty) FROM batches b WHERE b.item_id = i.id), 0) AS stock,
       (SELECT a.name FROM voucher_items vi JOIN vouchers v ON v.id = vi.voucher_id JOIN accounts a ON a.id = v.party_id
        WHERE vi.item_id = i.id AND v.type = 'purchase' ORDER BY v.date DESC LIMIT 1) AS last_supplier
       FROM items i WHERE i.active = 1 AND i.min_stock > 0 AND stock <= i.min_stock ORDER BY i.company, i.name`,
    )
    .all() as Record<string, string | number>[];
  return (
    <div>
      <h1 className="h1">Low Stock / Reorder</h1>
      <p className="mb-2 text-sm text-slate-500">Items at or below their Min Stock level (set Min Stock in item master).</p>
      <div className="card p-0">
        <table className="tbl">
          <thead><tr><th>Item</th><th>Company</th><th>Pack</th><th className="num">Stock</th><th className="num">Min</th><th className="num">Suggested Order</th><th>Last Supplier</th></tr></thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id}>
                <td><Link href={`/masters/items/${i.id}`} className="hover:underline">{i.name}</Link></td><td>{i.company}</td><td>{i.pack}</td>
                <td className="num text-red-600">{i.stock}</td><td className="num">{i.min_stock}</td>
                <td className="num">{Math.max(Number(i.min_stock) * 2 - Number(i.stock), 0)}</td><td>{i.last_supplier}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="py-6 text-center text-slate-500">Nothing to reorder</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
