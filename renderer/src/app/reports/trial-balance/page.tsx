import Link from "next/link";
import { isISODate, money, today } from "@/lib/format";
import { balances } from "@/lib/reports";
import DateRange from "@/components/DateRange";

export default async function TrialBalance({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const sp = await searchParams;
  const to = isISODate(sp.to) ? sp.to : today();
  const rows = balances("0000-00-00", to).filter((b) => Math.abs(b.closing) > 0.004);
  const dr = rows.reduce((a, b) => a + (b.closing > 0 ? b.closing : 0), 0);
  const cr = rows.reduce((a, b) => a + (b.closing < 0 ? -b.closing : 0), 0);
  let lastGrp = "";
  return (
    <div className="max-w-4xl">
      <h1 className="h1">Trial Balance</h1>
      <DateRange to={to} />
      <div className="card p-0">
        <table className="tbl">
          <thead><tr><th>Particulars</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
          <tbody>
            {rows.flatMap((b) => {
              const out = [];
              if (b.grp !== lastGrp) {
                lastGrp = b.grp;
                out.push(<tr key={`g-${b.grp}`}><td colSpan={3} className="bg-slate-50 font-semibold">{b.grp}</td></tr>);
              }
              out.push(
                <tr key={b.id}>
                  <td className="pl-6"><Link href={`/reports/ledger?account=${b.id}&to=${to}`} className="hover:underline">{b.name}</Link></td>
                  <td className="num">{b.closing > 0 ? money(b.closing) : ""}</td><td className="num">{b.closing < 0 ? money(-b.closing) : ""}</td>
                </tr>,
              );
              return out;
            })}
            <tr className="font-semibold"><td className="text-right">Total</td><td className="num">{money(dr)}</td><td className="num">{money(cr)}</td></tr>
            {Math.abs(dr - cr) > 0.01 && <tr className="text-red-700"><td colSpan={3}>Difference in opening balances: {money(dr - cr)} (check ledger opening balances)</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
