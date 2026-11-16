import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

const ACTION_COLORS: Record<string, string> = {
  create: "bg-green-100 text-green-800",
  edit: "bg-blue-100 text-blue-800",
  delete: "bg-red-100 text-red-800",
};

export default async function AuditLog({ searchParams }: { searchParams: Promise<{ action?: string; entity?: string; q?: string }> }) {
  await requireRole("admin");
  const sp = await searchParams;
  const action = sp.action || "";
  const entity = sp.entity || "";
  const q = sp.q || "";
  const rows = db()
    .prepare(
      `SELECT * FROM audit_log
       WHERE (? = '' OR action = ?) AND (? = '' OR entity = ?)
         AND (IFNULL(user,'') LIKE ? OR IFNULL(detail,'') LIKE ?)
       ORDER BY id DESC LIMIT 500`,
    )
    .all(action, action, entity, entity, `%${q}%`, `%${q}%`) as Record<string, string | number>[];
  const entities = (db().prepare("SELECT DISTINCT entity FROM audit_log ORDER BY entity").all() as { entity: string }[]).map((r) => r.entity);
  return (
    <div>
      <h1 className="h1">Activity Log</h1>
      <form className="mb-3 flex flex-wrap items-end gap-2">
        <div>
          <label className="label">Action</label>
          <select name="action" defaultValue={action} className="input">
            <option value="">All</option>
            <option value="create">Create</option>
            <option value="edit">Edit</option>
            <option value="delete">Delete</option>
          </select>
        </div>
        <div>
          <label className="label">Entity</label>
          <select name="entity" defaultValue={entity} className="input">
            <option value="">All</option>
            {entities.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div><label className="label">User / Detail</label><input name="q" defaultValue={q} className="input" /></div>
        <button className="btn-sec">Show</button>
      </form>
      <div className="card p-0">
        <table className="tbl">
          <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>Ref</th><th>Detail</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap text-slate-500">{String(r.created_at).replace("T", " ").slice(0, 19)}</td>
                <td>{r.user}</td>
                <td><span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${ACTION_COLORS[r.action as string] ?? "bg-slate-100"}`}>{r.action}</span></td>
                <td>{r.entity}</td>
                <td className="num">{r.entity_id ?? ""}</td>
                <td>{r.detail}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="py-6 text-center text-slate-500">No activity recorded yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
