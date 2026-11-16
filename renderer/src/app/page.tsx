import Link from "next/link";
import { db, sysAcc } from "@/lib/db";
import { fmtDate, money, today, VOUCHER_LABEL, vno } from "@/lib/format";
import { accountBalance } from "@/lib/vouchers";
import { defaultPasswordInUse } from "@/lib/auth";

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

  const Stat = ({ label, value, href, cls = "" }: { label: string; value: string; href?: string; cls?: string }) => (
    <Link href={href ?? "#"} className="card block hover:border-teal-400">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-xl font-semibold ${cls}`}>{value}</div>
    </Link>
  );
  return (
    <div>
      <h1 className="h1">Dashboard</h1>
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
        <Stat label="Today's Sales" value={`₹ ${money(sum("sale", t))}`} href={`/reports/register?type=sale&from=${t}&to=${t}`} />
        <Stat label="This Month Sales" value={`₹ ${money(sum("sale", m))}`} href="/reports/register?type=sale" />
        <Stat label="This Month Purchases" value={`₹ ${money(sum("purchase", m))}`} href="/reports/register?type=purchase" />
        <Stat label="Cash in Hand" value={`₹ ${money(accountBalance(sysAcc("CASH")))}`} href={`/reports/ledger?account=${sysAcc("CASH")}`} />
        <Stat label="Receivables" value={`₹ ${money(groupBal("Sundry Debtors"))}`} href="/reports/outstanding" />
        <Stat label="Payables" value={`₹ ${money(-groupBal("Sundry Creditors"))}`} href="/reports/outstanding?side=payable" />
        <Stat label="Expiring in 3 months (batches)" value={String(expiring)} href="/reports/expiry" cls="text-amber-600" />
        <Stat label="Expired in stock (batches)" value={String(expired)} href="/reports/expiry" cls="text-red-600" />
        <Stat label="Low stock items" value={String(low)} href="/reports/reorder" cls="text-red-600" />
        <Stat label="Items" value={String(counts.items)} href="/masters/items" />
        <Stat label="Parties" value={String(counts.parties)} href="/masters/accounts" />
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
                <td>{VOUCHER_LABEL[v.type as string]}</td><td>{v.party || "Cash"}</td><td className="num">{money(Number(v.total))}</td>
              </tr>
            ))}
            {!recent.length && <tr><td colSpan={5} className="py-6 text-center text-slate-500">No vouchers yet. Start with Settings → company details, then import Marg data or add items.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
