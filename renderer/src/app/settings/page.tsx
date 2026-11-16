import { getSettings, dbPath } from "@/lib/db";
import { STATES } from "@/lib/format";
import { saveSettings } from "../masters/actions";
import RestoreForm from "@/components/RestoreForm";

export default async function Settings({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const s = getSettings();
  const F = ({ name, label, className = "" }: { name: string; label: string; className?: string }) => (
    <div className={className}><label className="label">{label}</label><input name={name} defaultValue={s[name] ?? ""} className="input" /></div>
  );
  return (
    <div className="max-w-3xl">
      <h1 className="h1">Company Settings</h1>
      {saved && <div className="mb-3 rounded bg-green-50 px-3 py-2 text-sm text-green-800">Saved.</div>}
      <form action={saveSettings} className="card grid grid-cols-2 gap-3">
        <F name="company_name" label="Company Name" className="col-span-2" />
        <F name="address" label="Address" className="col-span-2" />
        <F name="phone" label="Phone" />
        <F name="email" label="Email" />
        <F name="gstin" label="GSTIN" />
        <F name="dl_no" label="Drug Licence No(s)" />
        <F name="city" label="City" />
        <F name="pincode" label="Pincode" />
        <div>
          <label className="label">State</label>
          <select name="state" defaultValue={s.state ?? ""} className="input">{STATES.map((x) => <option key={x}>{x}</option>)}</select>
        </div>
        <div>
          <label className="label">App Theme</label>
          <select name="theme" defaultValue={s.theme ?? "teal"} className="input">
            {[["teal", "Teal (default)"], ["blue", "Blue"], ["indigo", "Indigo"], ["emerald", "Emerald"], ["violet", "Violet"], ["rose", "Rose"]].map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <F name="invoice_terms" label="Invoice Terms (footer)" className="col-span-2" />
        <F name="declaration" label="Declaration (optional, prints on bill)" className="col-span-2" />
        <F name="footer_note" label="Footer note (e.g. Computer generated bill)" className="col-span-2" />
        <F name="upi_id" label="UPI ID (for payment QR on bills)" />
        <F name="bank_name" label="Bank Name" />
        <F name="bank_ac" label="Bank A/C No" />
        <F name="bank_ifsc" label="Bank IFSC" />
        <div className="col-span-2">
          <label className="label">Signature image (prints on bills — small PNG, transparent bg best)</label>
          {s.signature && <img src={s.signature} alt="Signature" className="mb-1 h-12 rounded border border-slate-200 bg-white p-1" />}
          <input type="file" name="signature" accept="image/png,image/jpeg" className="input" />
        </div>
        <div className="col-span-2"><button className="btn">Save</button></div>
      </form>
      <h2 className="h1 mt-8">Backup &amp; Restore</h2>
      <div className="card space-y-4 text-sm">
        <div>Data file: <code className="rounded bg-slate-100 px-1">{dbPath()}</code></div>
        <div><a href="/api/backup" className="btn">Download Backup</a></div>
        <div><div className="label">Restore from backup file</div><RestoreForm /></div>
      </div>
    </div>
  );
}
