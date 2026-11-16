import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { range } from "@/lib/reports";
import DateRange from "@/components/DateRange";

const BY: Record<string, { label: string; expr: string }> = {
  item: { label: "Item", expr: "i.name" },
  company: { label: "Company", expr: "IFNULL(i.company, '-')" },
  party: { label: "Party", expr: "IFNULL(a.name, 'Cash')" },
  area: { label: "Area / Route", expr: "IFNULL(a.area, '-')" },
  city: { label: "City", expr: "IFNULL(a.city, '-')" },
  salesman: { label: "Salesman", expr: "IFNULL(sm.name, '-')" },
  month: { label: "Month", expr: "substr(v.date, 1, 7)" },
};

export default async function Analysis({ searchParams }: { searchParams: Promise<{ by?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const by = BY[sp.by || ""] ? sp.by! : "item";
  const { from, to } = range(sp);
  const sign = "CASE v.type WHEN 'sale' THEN 1 ELSE -1 END";
  const rows = db()
    .prepare(
      `SELECT ${BY[by].expr} AS k, SUM(${sign} * (vi.qty + vi.free)) qty, SUM(${sign} * vi.taxable) taxable, SUM(${sign} * vi.amount) amount,
        SUM(${sign} * (vi.qty + vi.free) * IFNULL(b.purchase_rate, i.purchase_rate)) cost, COUNT(DISTINCT v.id) bills
       FROM voucher_items vi JOIN vouchers v ON v.id = vi.voucher_id JOIN items i ON i.id = vi.item_id
       LEFT JOIN batches b ON b.id = vi.batch_id LEFT JOIN accounts a ON a.id = v.party_id LEFT JOIN salesmen sm ON sm.id = v.salesman_id
       WHERE v.type IN ('sale','sale_return') AND v.date BETWEEN ? AND ? GROUP BY k ORDER BY taxable DESC`,
    )
    .all(from, to) as { k: string; qty: number; taxable: number; amount: number; cost: number; bills: number }[];
  const t = rows.reduce((a, r) => ({ taxable: a.taxable + r.taxable, amount: a.amount + r.amount, cost: a.cost + r.cost }), { taxable: 0, amount: 0, cost: 0 });
  return (
    <div>
      <h1 className="h1">Sales Analysis — by {BY[by].label}</h1>
      <DateRange from={from} to={to}>
        <div><label className="label">Group by</label>
          <select name="by" defaultValue={by} className="input">{Object.entries(BY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        </div>
      </DateRange>
      <p className="mb-2 text-xs text-slate-500">Net of sale returns. Profit = taxable value − cost at batch purchase rate (free qty counted in cost).</p>
      <div className="card p-0">
        <table className="tbl">
          <thead><tr><th>{BY[by].label}</th><th className="num">Bills</th><th className="num">Qty</th><th className="num">Taxable</th><th className="num">With GST</th><th className="num">Cost</th><th className="num">Profit</th><th className="num">Margin %</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.k}>
                <td>{r.k}</td><td className="num">{r.bills}</td><td className="num">{r.qty}</td><td className="num">{money(r.taxable)}</td>
                <td className="num">{money(r.amount)}</td><td className="num">{money(r.cost)}</td>
                <td className={`num ${r.taxable - r.cost < 0 ? "text-red-600" : ""}`}>{money(r.taxable - r.cost)}</td>
                <td className="num">{r.taxable ? (((r.taxable - r.cost) / r.taxable) * 100).toFixed(1) : "-"}</td>
              </tr>
            ))}
            <tr className="font-semibold"><td colSpan={3} className="text-right">Total</td><td className="num">{money(t.taxable)}</td><td className="num">{money(t.amount)}</td><td className="num">{money(t.cost)}</td><td className="num">{money(t.taxable - t.cost)}</td><td className="num">{t.taxable ? (((t.taxable - t.cost) / t.taxable) * 100).toFixed(1) : "-"}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
