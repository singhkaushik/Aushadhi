import { db } from "@/lib/db";
import { saveSalesman } from "../actions";

export default function Salesmen() {
  const rows = db().prepare("SELECT * FROM salesmen ORDER BY name").all() as { id: number; name: string; phone: string | null; active: number }[];
  return (
    <div className="max-w-2xl">
      <h1 className="h1">Salesmen</h1>
      <div className="card p-0">
        {rows.map((r) => (
          <form key={r.id} action={saveSalesman} className="grid grid-cols-[1fr_10rem_4rem_5rem] items-center gap-2 border-b border-slate-100 px-3 py-1.5">
            <input type="hidden" name="id" value={r.id} />
            <input name="name" defaultValue={r.name} className="input" />
            <input name="phone" defaultValue={r.phone ?? ""} placeholder="Phone" className="input" />
            <label className="text-xs"><input type="checkbox" name="active" defaultChecked={!!r.active} /> active</label>
            <button className="btn-sec">Save</button>
          </form>
        ))}
        {!rows.length && <div className="p-4 text-sm text-slate-500">No salesmen yet.</div>}
      </div>
      <form action={saveSalesman} className="card mt-4 flex items-end gap-2">
        <div><label className="label">Name</label><input name="name" required className="input" /></div>
        <div><label className="label">Phone</label><input name="phone" className="input" /></div>
        <button className="btn">Add Salesman</button>
      </form>
    </div>
  );
}
