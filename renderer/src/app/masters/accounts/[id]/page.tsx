import Link from "next/link";
import { db, GROUPS } from "@/lib/db";
import { STATES } from "@/lib/format";
import { saveAccount, deleteAccount } from "../../actions";

export default async function AccountForm({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ grp?: string }> }) {
  const { id } = await params;
  const { grp } = await searchParams;
  const a = (id === "new" ? {} : db().prepare("SELECT * FROM accounts WHERE id = ?").get(Number(id)) ?? {}) as Record<string, string | number | null>;
  const opening = Number(a.opening || 0);
  const salesmen = db().prepare("SELECT id, name FROM salesmen WHERE active = 1 ORDER BY name").all() as { id: number; name: string }[];
  const F = ({ name, label, type = "text", className = "" }: { name: string; label: string; type?: string; className?: string }) => (
    <div className={className}>
      <label className="label">{label}</label>
      <input name={name} type={type} step="any" defaultValue={(a[name] as string) ?? ""} className="input" />
    </div>
  );
  return (
    <div className="max-w-3xl">
      <h1 className="h1">{id === "new" ? "New Ledger" : `Edit Ledger: ${a.name}`}</h1>
      <form action={saveAccount} className="card grid grid-cols-2 gap-3">
        <input type="hidden" name="id" value={id === "new" ? "" : id} />
        <div className="col-span-2">
          <label className="label">Name *</label>
          <input name="name" required autoFocus defaultValue={(a.name as string) ?? ""} className="input" />
        </div>
        <div>
          <label className="label">Group *</label>
          <select name="grp" defaultValue={(a.grp as string) ?? grp ?? "Sundry Debtors"} className="input">
            {Object.keys(GROUPS).map((g) => <option key={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <label className="label">State</label>
          <select name="state" defaultValue={(a.state as string) ?? ""} className="input">
            <option value="">--</option>
            {STATES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <F name="gstin" label="GSTIN" />
        <F name="dl_no" label="Drug Licence No(s)" />
        <F name="address" label="Address" className="col-span-2" />
        <F name="city" label="City" />
        <F name="pincode" label="Pincode" />
        <F name="area" label="Area / Route" />
        <F name="default_disc" label="Default Discount %" type="number" />
        <div>
          <label className="label">Salesman</label>
          <select name="salesman_id" defaultValue={String(a.salesman_id ?? "")} className="input">
            <option value="">--</option>
            {salesmen.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <F name="phone" label="Phone" />
        <F name="email" label="Email" />
        <F name="credit_days" label="Credit Days" type="number" />
        <div>
          <label className="label">Opening Balance</label>
          <div className="flex gap-1">
            <input name="opening" type="number" step="any" defaultValue={Math.abs(opening) || ""} className="input" />
            <select name="opening_side" defaultValue={opening < 0 ? "Cr" : "Dr"} className="input w-20"><option>Dr</option><option>Cr</option></select>
          </div>
        </div>
        <div className="col-span-2 flex gap-2 pt-2">
          <button className="btn">Save</button>
          <Link href="/masters/accounts" className="btn-sec">Cancel</Link>
        </div>
      </form>
      {id !== "new" && !a.code && (
        <form action={deleteAccount} className="mt-3">
          <input type="hidden" name="id" value={id} />
          <button className="btn-danger">Delete</button>
        </form>
      )}
    </div>
  );
}
