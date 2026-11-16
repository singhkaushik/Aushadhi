import Link from "next/link";
import { Fragment } from "react";
import { db } from "@/lib/db";
import { fmtDate, money, today, vno } from "@/lib/format";
import { pendingBills } from "@/lib/reports";

export default async function Outstanding({ searchParams }: { searchParams: Promise<{ side?: string; to?: string; detail?: string }> }) {
  const sp = await searchParams;
  const side = sp.side === "payable" ? -1 : 1;
  const to = sp.to || today();
  const grp = side === 1 ? "Sundry Debtors" : "Sundry Creditors";
  const parties = db().prepare("SELECT id, name, city, phone, credit_days FROM accounts WHERE grp IN ('Sundry Debtors','Sundry Creditors') AND active = 1 ORDER BY name").all() as Record<string, string | number>[];
  const data = parties
    .map((p) => {
      const bills = pendingBills(Number(p.id), side as 1 | -1, to);
      const total = bills.reduce((a, b) => a + b.pending, 0);
      const age = [0, 0, 0, 0];
      for (const b of bills) age[b.days <= 30 ? 0 : b.days <= 60 ? 1 : b.days <= 90 ? 2 : 3] += b.pending;
      return { p, bills, total, age };
    })
    .filter((x) => x.total > 0.004);
  const grand = data.reduce((a, x) => a + x.total, 0);
  return (
    <div>
      <h1 className="h1">Outstanding — {side === 1 ? "Receivable" : "Payable"}</h1>
      <form className="no-print mb-3 flex items-end gap-2">
        <div><label className="label">Type</label>
          <select name="side" defaultValue={side === 1 ? "receivable" : "payable"} className="input">
            <option value="receivable">Receivable (from customers)</option><option value="payable">Payable (to suppliers)</option>
          </select>
        </div>
        <div><label className="label">As on</label><input type="date" name="to" defaultValue={to} className="input" /></div>
        <label className="pb-1 text-sm"><input type="checkbox" name="detail" value="1" defaultChecked={!!sp.detail} /> Bill-wise detail</label>
        <button className="btn-sec">Show</button>
      </form>
      <p className="mb-2 text-xs text-slate-500">Bills adjusted on FIFO basis. Parties from {grp} and others with {side === 1 ? "debit" : "credit"} balance.</p>
      <div className="card p-0">
        <table className="tbl">
          <thead><tr><th>Party</th><th>City</th><th>Phone</th><th className="num">0-30</th><th className="num">31-60</th><th className="num">61-90</th><th className="num">90+</th><th className="num">Total</th></tr></thead>
          <tbody>
            {data.map(({ p, bills, total, age }) => (
              <Fragment key={p.id}>
                <tr className="font-medium">
                  <td><Link href={`/reports/ledger?account=${p.id}`} className="text-teal-700 hover:underline">{p.name}</Link></td><td>{p.city}</td><td>{p.phone}</td>
                  {age.map((a, i) => <td key={i} className="num">{a ? money(a) : ""}</td>)}
                  <td className="num">{money(total)}</td>
                </tr>
                {sp.detail && bills.map((b, i) => (
                  <tr key={`${p.id}-${i}`} className="text-xs text-slate-600">
                    <td className="pl-6" colSpan={3}>
                      {b.voucher_id ? <Link href={`/vouchers/view/${b.voucher_id}`} className="hover:underline">{vno(b.type, b.number ?? 0)}</Link> : "Opening"} {fmtDate(b.date)} · {b.days} days · bill {money(b.amount)}
                    </td>
                    <td colSpan={4}></td><td className="num">{money(b.pending)}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
            <tr className="font-semibold"><td colSpan={7} className="text-right">Total</td><td className="num">{money(grand)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
