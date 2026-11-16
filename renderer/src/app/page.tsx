import Link from "next/link";
import { db, sysAcc } from "@/lib/db";
import { fmtDate, money, today, vno } from "@/lib/format";
import TypeBadge from "@/components/TypeBadge";
import { accountBalance } from "@/lib/vouchers";
import { defaultPasswordInUse } from "@/lib/auth";
import { Icon } from "@/components/icons";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { denied } = await searchParams;
  const d = db();
  const t = today();
  const m = t.slice(0, 8) + "01";
  const sum = (type: string, from: string) =>
    (d.prepare("SELECT COALESCE(SUM(total), 0) s FROM vouchers WHERE type = ? AND date BETWEEN ? AND ?").get(type, from, t) as { s: number }).s;
  const groupBal = (grp: string) =>
    (d.prepare(
      `SELECT COALESCE(SUM(a.opening + COALESCE((SELECT SUM(debit - credit) FROM ledger_entries l WHERE l.account_id = a.id), 0)), 0) s
       FROM accounts a WHERE a.grp = ?`,
    ).get(grp) as { s: number }).s;
  const cur = t.slice(0, 7);
  const lim = new Date(t + "T00:00:00Z");
  lim.setUTCMonth(lim.getUTCMonth() + 3);
  const expiring = (d.prepare("SELECT COUNT(*) c FROM batches WHERE qty > 0 AND expiry >= ? AND expiry <= ?").get(cur, lim.toISOString().slice(0, 7)) as { c: number }).c;
  const expired = (d.prepare("SELECT COUNT(*) c FROM batches WHERE qty > 0 AND expiry < ?").get(cur) as { c: number }).c;
  const low = (d.prepare("SELECT COUNT(*) c FROM items i WHERE active = 1 AND min_stock > 0 AND COALESCE((SELECT SUM(qty) FROM batches b WHERE b.item_id = i.id), 0) <= min_stock").get() as { c: number }).c;
  const recent = d.prepare("SELECT v.*, a.name party FROM vouchers v LEFT JOIN accounts a ON a.id = v.party_id ORDER BY v.id DESC LIMIT 10").all() as Record<string, string | number>[];
  const counts = d.prepare("SELECT (SELECT COUNT(*) FROM items WHERE active=1) items, (SELECT COUNT(*) FROM accounts WHERE grp IN ('Sundry Debtors','Sundry Creditors')) parties").get() as { items: number; parties: number };
  const dayRows = d.prepare("SELECT date, SUM(total) s FROM vouchers WHERE type = 'sale' AND date >= date(?, '-13 days') GROUP BY date").all(t) as { date: string; s: number }[];
  const dayMap = new Map(dayRows.map((r) => [r.date, Number(r.s)]));
  const days = Array.from({ length: 14 }, (_, i) => {
    const dd = new Date(Date.now() - (13 - i) * 86400000);
    const key = dd.toISOString().slice(0, 10);
    return { key, s: dayMap.get(key) ?? 0 };
  });
  const maxSale = Math.max(...days.map((x) => x.s), 1);
  const total14 = days.reduce((a, x) => a + x.s, 0);

  const Stat = ({ label, value, href, icon, tint }: { label: string; value: string; href?: string; icon: React.ReactNode; tint: string }) => (
    <Link href={href ?? "#"} className="card group flex items-center gap-3 transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tint}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs text-slate-500">{label}</span>
        <span className="block truncate text-lg font-semibold tabular-nums">{value}</span>
      </span>
    </Link>
  );
  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="h1 mb-0">Dashboard</h1>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500 shadow-sm ring-1 ring-slate-200">{fmtDate(t)}</span>
      </div>
      {denied && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">You don&apos;t have permission for that page.</div>}
      {defaultPasswordInUse() && (
        <div className="mb-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Default admin password is still &quot;admin&quot;. <Link href="/password" className="underline">Change it now</Link>.
        </div>
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/vouchers/sale/new" className="btn">+ Sale Bill (F2)</Link>
        <Link href="/vouchers/purchase/new" className="btn">+ Purchase (F3)</Link>
        <Link href="/vouchers/receipt/new" className="btn-sec">+ Receipt (F6)</Link>
        <Link href="/vouchers/payment/new" className="btn-sec">+ Payment (F7)</Link>
        <Link href="/masters/items/new" className="btn-sec">+ Item</Link>
        <Link href="/masters/accounts/new" className="btn-sec">+ Party</Link>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Today's Sales" value={`₹ ${money(sum("sale", t))}`} href={`/reports/register?type=sale&from=${t}&to=${t}`} icon={Icon.sale("h-5 w-5")} tint="bg-teal-100 text-teal-700" />
        <Stat label="This Month Sales" value={`₹ ${money(sum("sale", m))}`} href="/reports/register?type=sale" icon={Icon.sale("h-5 w-5")} tint="bg-emerald-100 text-emerald-700" />
        <Stat label="This Month Purchases" value={`₹ ${money(sum("purchase", m))}`} href="/reports/register?type=purchase" icon={Icon.purchase("h-5 w-5")} tint="bg-blue-100 text-blue-700" />
        <Stat label="Cash in Hand" value={`₹ ${money(accountBalance(sysAcc("CASH")))}`} href={`/reports/ledger?account=${sysAcc("CASH")}`} icon={Icon.cash("h-5 w-5")} tint="bg-green-100 text-green-700" />
        <Stat label="Receivables" value={`₹ ${money(groupBal("Sundry Debtors"))}`} href="/reports/outstanding" icon={Icon.receivable("h-5 w-5")} tint="bg-indigo-100 text-indigo-700" />
        <Stat label="Payables" value={`₹ ${money(-groupBal("Sundry Creditors"))}`} href="/reports/outstanding?side=payable" icon={Icon.payable("h-5 w-5")} tint="bg-orange-100 text-orange-700" />
        <Stat label="Expiring in 3 months (batches)" value={String(expiring)} href="/reports/expiry" icon={Icon.expiry("h-5 w-5")} tint="bg-amber-100 text-amber-700" />
        <Stat label="Expired in stock (batches)" value={String(expired)} href="/reports/expiry" icon={Icon.alert("h-5 w-5")} tint="bg-red-100 text-red-700" />
        <Stat label="Low stock items" value={String(low)} href="/reports/reorder" icon={Icon.alert("h-5 w-5")} tint="bg-rose-100 text-rose-700" />
        <Stat label="Items" value={String(counts.items)} href="/masters/items" icon={Icon.box("h-5 w-5")} tint="bg-slate-200 text-slate-700" />
        <Stat label="Parties" value={String(counts.parties)} href="/masters/accounts" icon={Icon.users("h-5 w-5")} tint="bg-violet-100 text-violet-700" />
      </div>
      <div className="card mt-3">
        <div className="mb-2 flex items-baseline justify-between">
          <div className="text-sm font-semibold text-slate-700">Sales — last 14 days</div>
          <div className="text-sm font-semibold text-teal-700 tabular-nums">₹ {money(total14)}</div>
        </div>
        <svg viewBox="0 0 560 110" className="h-24 w-full" preserveAspectRatio="none">
          <line x1="0" y1="105" x2="560" y2="105" className="stroke-slate-200" strokeWidth="1" />
          {days.map((x, i) => {
            const h = Math.max(2, (x.s / maxSale) * 96);
            return (
              <g key={x.key}>
                <rect x={i * 40 + 6} y={105 - h} width={28} height={h} rx={3} className={`${x.s ? "fill-teal-600" : "fill-slate-200"} transition hover:fill-teal-500`}>
                  <title>{`${fmtDate(x.key)} — ₹ ${money(x.s)}`}</title>
                </rect>
                {i % 3 === 0 && <text x={i * 40 + 20} y="109" textAnchor="middle" className="fill-slate-400" fontSize="6">{x.key.slice(8)}</text>}
              </g>
            );
          })}
        </svg>
      </div>
      <h2 className="mt-6 mb-2 font-semibold text-slate-700">Recent Vouchers</h2>
      <div className="card p-0">
        <table className="tbl">
          <thead><tr><th>Date</th><th>No</th><th>Type</th><th>Party</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {recent.map((v) => (
              <tr key={v.id}>
                <td>{fmtDate(v.date as string)}</td>
                <td><Link href={`/vouchers/view/${v.id}`} className="text-teal-700 hover:underline">{vno(v.type as string, v.number as number)}</Link></td>
                <td><TypeBadge type={v.type as string} /></td><td>{v.party || "Cash"}</td><td className="num">{money(Number(v.total))}</td>
              </tr>
            ))}
            {!recent.length && <tr><td colSpan={5} className="py-6 text-center text-slate-500">No vouchers yet. Start with Settings → company details, then import Marg data or add items.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
