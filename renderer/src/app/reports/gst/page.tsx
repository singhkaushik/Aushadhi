import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { range } from "@/lib/reports";
import DateRange from "@/components/DateRange";

type R = Record<string, number | string>;

export default async function Gst({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { from, to } = range(await searchParams);
  const d = db();
  const signed = (types: [string, string]) =>
    `CASE v.type WHEN '${types[0]}' THEN 1 WHEN '${types[1]}' THEN -1 ELSE 0 END`;
  const out = signed(["sale", "sale_return"]);
  const inw = signed(["purchase", "purchase_return"]);
  const byRate = (sign: string) =>
    d.prepare(
      `SELECT vi.gst_rate AS rate, SUM(${sign} * vi.taxable) taxable, SUM(${sign} * vi.cgst) cgst, SUM(${sign} * vi.sgst) sgst, SUM(${sign} * vi.igst) igst
       FROM voucher_items vi JOIN vouchers v ON v.id = vi.voucher_id WHERE v.date BETWEEN ? AND ? AND ${sign} <> 0 GROUP BY vi.gst_rate ORDER BY vi.gst_rate`,
    ).all(from, to) as R[];
  const outRates = byRate(out);
  const inRates = byRate(inw);
  const b2b = d.prepare(
    `SELECT CASE WHEN IFNULL(a.gstin,'') <> '' THEN 'B2B' ELSE 'B2C' END AS kind, COUNT(DISTINCT v.id) bills,
      SUM(${out} * v.taxable) taxable, SUM(${out} * (v.cgst + v.sgst + v.igst)) tax
     FROM vouchers v LEFT JOIN accounts a ON a.id = v.party_id WHERE v.date BETWEEN ? AND ? AND v.type IN ('sale','sale_return') GROUP BY kind`,
  ).all(from, to) as R[];
  const hsn = d.prepare(
    `SELECT IFNULL(i.hsn,'') hsn, vi.gst_rate rate, SUM(${out} * (vi.qty + vi.free)) qty, SUM(${out} * vi.taxable) taxable,
      SUM(${out} * vi.cgst) cgst, SUM(${out} * vi.sgst) sgst, SUM(${out} * vi.igst) igst
     FROM voucher_items vi JOIN vouchers v ON v.id = vi.voucher_id JOIN items i ON i.id = vi.item_id
     WHERE v.date BETWEEN ? AND ? AND v.type IN ('sale','sale_return') GROUP BY i.hsn, vi.gst_rate ORDER BY i.hsn`,
  ).all(from, to) as R[];
  const tot = (rows: R[], k: string) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);
  const outTax = tot(outRates, "cgst") + tot(outRates, "sgst") + tot(outRates, "igst");
  const itc = tot(inRates, "cgst") + tot(inRates, "sgst") + tot(inRates, "igst");
  const RateTable = ({ rows, title }: { rows: R[]; title: string }) => (
    <div className="card p-0">
      <div className="px-3 py-2 font-semibold text-slate-700">{title}</div>
      <table className="tbl">
        <thead><tr><th>GST %</th><th className="num">Taxable</th><th className="num">CGST</th><th className="num">SGST</th><th className="num">IGST</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.rate}><td>{r.rate}%</td>{["taxable", "cgst", "sgst", "igst"].map((k) => <td key={k} className="num">{money(Number(r[k]))}</td>)}</tr>
          ))}
          <tr className="font-semibold"><td>Total</td>{["taxable", "cgst", "sgst", "igst"].map((k) => <td key={k} className="num">{money(tot(rows, k))}</td>)}</tr>
        </tbody>
      </table>
    </div>
  );
  return (
    <div>
      <h1 className="h1">GST Summary</h1>
      <DateRange from={from} to={to} />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="card"><div className="label">Output Tax (Sales - Returns)</div><div className="text-lg font-semibold">₹ {money(outTax)}</div></div>
        <div className="card"><div className="label">Input Tax Credit (Purchases - Returns)</div><div className="text-lg font-semibold">₹ {money(itc)}</div></div>
        <div className="card"><div className="label">Net GST Payable (3B)</div><div className={`text-lg font-semibold ${outTax - itc < 0 ? "text-green-700" : "text-red-700"}`}>₹ {money(outTax - itc)}</div></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <RateTable rows={outRates} title="Outward Supplies (GSTR-1 / 3B 3.1)" />
        <RateTable rows={inRates} title="Inward Supplies / ITC (3B 4)" />
      </div>
      <div className="card mt-3 p-0">
        <div className="px-3 py-2 font-semibold text-slate-700">B2B / B2C Split</div>
        <table className="tbl">
          <thead><tr><th>Type</th><th className="num">Bills</th><th className="num">Taxable</th><th className="num">Tax</th></tr></thead>
          <tbody>{b2b.map((r) => <tr key={r.kind}><td>{r.kind}</td><td className="num">{r.bills}</td><td className="num">{money(Number(r.taxable))}</td><td className="num">{money(Number(r.tax))}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="card mt-3 p-0">
        <div className="px-3 py-2 font-semibold text-slate-700">HSN Summary (GSTR-1 Table 12)</div>
        <table className="tbl">
          <thead><tr><th>HSN</th><th>GST %</th><th className="num">Qty</th><th className="num">Taxable</th><th className="num">CGST</th><th className="num">SGST</th><th className="num">IGST</th></tr></thead>
          <tbody>
            {hsn.map((r, i) => (
              <tr key={i}><td>{r.hsn || "-"}</td><td>{r.rate}%</td><td className="num">{r.qty}</td>{["taxable", "cgst", "sgst", "igst"].map((k) => <td key={k} className="num">{money(Number(r[k]))}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
