import Link from "next/link";
import { db, GROUPS } from "@/lib/db";
import { money } from "@/lib/format";
import { currentUser } from "@/lib/auth";

export default async function Accounts({ searchParams }: { searchParams: Promise<{ q?: string; grp?: string }> }) {
  const { q = "", grp = "" } = await searchParams;
  const user = await currentUser();
  const rows = db()
    .prepare(
      `SELECT a.*, a.opening + COALESCE((SELECT SUM(debit - credit) FROM ledger_entries l WHERE l.account_id = a.id), 0) AS bal
       FROM accounts a WHERE a.active = 1 AND (a.name LIKE ? OR IFNULL(a.gstin,'') LIKE ? OR IFNULL(a.city,'') LIKE ?)
       ${grp ? "AND a.grp = ?" : ""} ORDER BY a.name LIMIT 500`,
    )
    .all(`%${q}%`, `%${q}%`, `%${q}%`, ...(grp ? [grp] : [])) as Record<string, string | number>[];
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="h1 mb-0">Parties / Ledgers</h1>
        {user?.role !== "viewer" && <Link href="/masters/accounts/new" className="btn">+ New Ledger</Link>}
      </div>
      <form className="mb-3 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Search name / GSTIN / city" className="input max-w-xs" />
        <select name="grp" defaultValue={grp} className="input max-w-xs">
          <option value="">All groups</option>
          {Object.keys(GROUPS).map((g) => <option key={g}>{g}</option>)}
        </select>
        <button className="btn-sec">Filter</button>
      </form>
      <div className="card p-0">
        <table className="tbl">
          <thead><tr><th>Name</th><th>Group</th><th>City</th><th>GSTIN</th><th>DL No</th><th>Phone</th><th className="num">Balance</th></tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td><Link className="text-teal-700 hover:underline" href={`/masters/accounts/${a.id}`}>{a.name}</Link></td>
                <td>{a.grp}</td><td>{a.city}</td><td>{a.gstin}</td><td>{a.dl_no}</td><td>{a.phone}</td>
                <td className="num"><Link href={`/reports/ledger?account=${a.id}`} className="hover:underline">{money(Math.abs(Number(a.bal)))} {Number(a.bal) >= 0 ? "Dr" : "Cr"}</Link></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="py-6 text-center text-slate-500">No ledgers found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
