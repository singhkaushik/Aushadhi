import { money } from "@/lib/format";
import { balanceSheet, profitAndLoss, range, Bal } from "@/lib/reports";
import DateRange from "@/components/DateRange";

const Line = ({ label, value, bold, indent }: { label: string; value: number; bold?: boolean; indent?: boolean }) => (
  <div className={`flex justify-between py-0.5 ${bold ? "font-semibold" : ""} ${indent ? "pl-4 text-slate-600" : ""}`}>
    <span>{label}</span><span className="tabular-nums">{money(value)}</span>
  </div>
);

const Detail = ({ rows, sign }: { rows: Bal[]; sign: 1 | -1 }) => (
  <>{rows.map((b) => <Line key={b.id} label={b.name} value={sign * b.period} indent />)}</>
);

export default async function Pnl({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { from, to } = range(await searchParams, "fy");
  const p = profitAndLoss(from, to);
  const bs = balanceSheet(to);
  const leftTrading = p.openingStock + p.purchases + p.directExp + Math.max(p.gross, 0);
  const rightTrading = p.sales + p.directInc + p.closingStock + Math.max(-p.gross, 0);
  return (
    <div className="max-w-5xl">
      <h1 className="h1">Profit &amp; Loss</h1>
      <DateRange from={from} to={to} />
      <div className="card grid grid-cols-2 gap-6 text-sm">
        <div>
          <Line label="Opening Stock" value={p.openingStock} bold />
          <Line label="Purchases (net)" value={p.purchases} bold /><Detail rows={p.groups.purchases} sign={1} />
          {p.directExp !== 0 && <><Line label="Direct Expenses" value={p.directExp} bold /><Detail rows={p.groups.directExp} sign={1} /></>}
          {p.gross > 0 && <Line label="Gross Profit c/o" value={p.gross} bold />}
          <div className="mt-2 border-t pt-1"><Line label="Total" value={leftTrading} bold /></div>
        </div>
        <div>
          <Line label="Sales (net)" value={p.sales} bold /><Detail rows={p.groups.sales} sign={-1} />
          {p.directInc !== 0 && <><Line label="Direct Incomes" value={p.directInc} bold /><Detail rows={p.groups.directInc} sign={-1} /></>}
          <Line label="Closing Stock" value={p.closingStock} bold />
          {p.gross < 0 && <Line label="Gross Loss c/o" value={-p.gross} bold />}
          <div className="mt-2 border-t pt-1"><Line label="Total" value={rightTrading} bold /></div>
        </div>
        <div className="border-t pt-2">
          {p.gross < 0 && <Line label="Gross Loss b/f" value={-p.gross} bold />}
          <Line label="Indirect Expenses" value={p.indirectExp} bold /><Detail rows={p.groups.indirectExp} sign={1} />
          {p.net > 0 && <Line label="Net Profit" value={p.net} bold />}
        </div>
        <div className="border-t pt-2">
          {p.gross > 0 && <Line label="Gross Profit b/f" value={p.gross} bold />}
          <Line label="Indirect Incomes" value={p.indirectInc} bold /><Detail rows={p.groups.indirectInc} sign={-1} />
          {p.net < 0 && <Line label="Net Loss" value={-p.net} bold />}
        </div>
      </div>
      <div className={`mt-2 text-lg font-semibold ${p.net >= 0 ? "text-green-700" : "text-red-700"}`}>
        Net {p.net >= 0 ? "Profit" : "Loss"}: ₹ {money(Math.abs(p.net))}
      </div>

      <h2 className="h1 mt-8">Balance Sheet as on {to}</h2>
      <div className="card grid grid-cols-2 gap-6 text-sm">
        <div>
          <div className="mb-1 font-semibold uppercase text-slate-500">Liabilities</div>
          {Object.entries(bs.liabilities).map(([g, rows]) => (
            <div key={g}>
              <Line label={g} value={-rows.reduce((a, b) => a + b.closing, 0)} bold />
              {rows.map((b) => <Line key={b.id} label={b.name} value={-b.closing} indent />)}
            </div>
          ))}
          <Line label="Profit & Loss A/c (cumulative)" value={bs.profit} bold />
          {Math.abs(bs.diff) > 0.01 && <Line label="Difference in Opening Balances" value={bs.diff} bold />}
          <div className="mt-2 border-t pt-1"><Line label="Total" value={bs.liabTotal} bold /></div>
        </div>
        <div>
          <div className="mb-1 font-semibold uppercase text-slate-500">Assets</div>
          {Object.entries(bs.assets).map(([g, rows]) => (
            <div key={g}>
              <Line label={g} value={rows.reduce((a, b) => a + b.closing, 0)} bold />
              {rows.map((b) => <Line key={b.id} label={b.name} value={b.closing} indent />)}
            </div>
          ))}
          <Line label="Closing Stock" value={bs.closingStock} bold />
          <div className="mt-2 border-t pt-1"><Line label="Total" value={bs.assetsTotal} bold /></div>
        </div>
      </div>
    </div>
  );
}
