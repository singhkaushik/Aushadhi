"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DEFAULT_PREFS, loadPrefs, loadPresets, prefsQuery, savePrefs, savePresets, type PrintPrefs } from "@/lib/print-prefs";

const FORMATS: [string, string][] = [
  ["a4", "A4 — Classic GST"],
  ["modern", "A4 — Modern"],
  ["letterhead", "A4 — Letterhead"],
  ["compact", "A4 — Compact"],
  ["a5", "A5"],
  ["estimate", "Estimate / Cash Bill"],
  ["thermal", "Thermal 80mm"],
  ["thermal58", "Thermal 58mm"],
];

const COPIES: [string, string][] = [
  ["original", "Original for Buyer"],
  ["duplicate", "Duplicate for Transporter"],
  ["triplicate", "Triplicate for Supplier"],
];

const ACCENTS: [string, string][] = [["teal", "Teal"], ["blue", "Blue"], ["indigo", "Indigo"], ["slate", "Grey"]];

const TOGGLES: [keyof PrintPrefs, string][] = [
  ["logo", "Show logo (Modern)"],
  ["hsn", "HSN column"],
  ["batch", "Batch & Expiry columns"],
  ["free", "Free qty column"],
  ["mrp", "MRP column"],
  ["brand", "Company / brand column"],
  ["sm", "Salesman name"],
  ["bar", "Bill barcode"],
];

const SECTIONS: [keyof PrintPrefs, string, boolean][] = [
  ["zgst", "GST rate summary", true],
  ["zwords", "Amount in words", true],
  ["zterms", "Terms & conditions", true],
  ["zdecl", "Declaration", true],
  ["zbank", "Bank details & UPI QR", true],
  ["ztotals", "Totals box", false],
  ["zbal", "Party balance", true],
  ["zsign", "Signatory block", true],
  ["zfoot", "Footer note", true],
];

const CLASSIC_FAMILY = ["a4", "letterhead", "compact"];

export default function PrintDesigner({ id }: { id: number }) {
  const [prefs, setPrefs] = useState<PrintPrefs>(DEFAULT_PREFS);
  const [presets, setPresets] = useState<Record<string, PrintPrefs>>({});
  const [pname, setPname] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setPrefs(loadPrefs());
    setPresets(loadPresets());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) savePrefs(prefs);
  }, [prefs, loaded]);

  const set = <K extends keyof PrintPrefs>(k: K, v: PrintPrefs[K]) => setPrefs((p) => ({ ...p, [k]: v }));
  const qs = prefsQuery(prefs);
  const isA4 = ["a4", "modern", "letterhead", "compact"].includes(prefs.format);
  const isClassic = CLASSIC_FAMILY.includes(prefs.format);

  const savePreset = () => {
    const name = pname.trim();
    if (!name) return;
    const next = { ...presets, [name]: prefs };
    setPresets(next); savePresets(next); setPname("");
  };
  const delPreset = (name: string) => {
    const next = { ...presets };
    delete next[name];
    setPresets(next); savePresets(next);
  };

  return (
    <div className="flex h-screen bg-slate-100">
      <div className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-sm font-bold">Bill Print Designer</h1>
          <Link href={`/vouchers/view/${id}`} className="text-xs text-teal-700 hover:underline">← Back</Link>
        </div>

        <label className="label">Saved designs</label>
        <div className="mb-2 space-y-1">
          {Object.keys(presets).length === 0 && <div className="text-xs text-slate-400">No saved designs yet</div>}
          {Object.keys(presets).map((n) => (
            <div key={n} className="flex items-center justify-between gap-1 rounded border border-slate-200 px-2 py-1 text-sm">
              <button className="flex-1 text-left hover:text-teal-700" onClick={() => setPrefs({ ...DEFAULT_PREFS, ...presets[n] })}>{n}</button>
              <button className="text-slate-400 hover:text-red-500" title="Delete" onClick={() => delPreset(n)}>×</button>
            </div>
          ))}
        </div>
        <div className="mb-4 flex gap-1">
          <input className="input" placeholder="Design name…" value={pname} onChange={(e) => setPname(e.target.value)} onKeyDown={(e) => e.key === "Enter" && savePreset()} />
          <button className="btn-sec" onClick={savePreset}>Save</button>
        </div>

        <label className="label">Bill design</label>
        <select className="input mb-4" value={prefs.format} onChange={(e) => set("format", e.target.value)}>
          {FORMATS.map(([f, l]) => <option key={f} value={f}>{l}</option>)}
        </select>

        <label className={`mb-1 flex items-center gap-2 text-sm ${!isA4 ? "opacity-40" : ""}`}>
          <input type="checkbox" className="h-4 w-4 accent-teal-700" checked={prefs.copy !== ""} disabled={!isA4}
            onChange={(e) => set("copy", e.target.checked ? "original" : "")} />
          Show copy label
        </label>
        <select className="input mb-4" value={prefs.copy || "original"} onChange={(e) => set("copy", e.target.value)} disabled={!isA4 || prefs.copy === ""}>
          {COPIES.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
        </select>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <div>
            <label className="label">Font size</label>
            <select className="input" value={prefs.fs} onChange={(e) => set("fs", e.target.value)} disabled={!isA4}>
              <option value="s">Small</option><option value="m">Medium</option><option value="l">Large</option>
            </select>
          </div>
          <div>
            <label className="label">Border</label>
            <select className="input" value={prefs.frame} onChange={(e) => set("frame", e.target.value)} disabled={!isClassic}>
              <option value="box">Boxed</option><option value="none">None</option>
            </select>
          </div>
          <div>
            <label className="label">Stamp</label>
            <select className="input" value={prefs.stamp} onChange={(e) => set("stamp", e.target.value)} disabled={!isA4}>
              <option value="">None</option><option value="paid">PAID</option><option value="due">DUE</option>
            </select>
          </div>
          {prefs.format === "letterhead" && (
            <div>
              <label className="label">Top margin (mm)</label>
              <input type="number" className="input" min={0} max={80} value={prefs.lhmm} onChange={(e) => set("lhmm", Number(e.target.value))} />
            </div>
          )}
          <div>
            <label className="label">GST summary by</label>
            <select className="input" value={prefs.gsum} onChange={(e) => set("gsum", e.target.value)} disabled={!isA4}>
              <option value="rate">GST rate</option><option value="hsn">HSN-wise</option>
            </select>
          </div>
          <div>
            <label className="label">Signatory title</label>
            <input className="input" placeholder="Authorised Signatory" value={prefs.signt} onChange={(e) => set("signt", e.target.value)} disabled={!isA4} />
          </div>
        </div>

        <label className="label">Accent colour (Modern)</label>
        <div className="mb-4 flex gap-2">
          {ACCENTS.map(([a, l]) => (
            <button key={a} title={l} onClick={() => set("accent", a)}
              className={`h-7 w-7 rounded-full border-2 ${prefs.accent === a ? "border-slate-800" : "border-transparent"}`}
              style={{ backgroundColor: { teal: "#0f766e", blue: "#1d4ed8", indigo: "#4338ca", slate: "#334155" }[a] }} />
          ))}
        </div>

        <label className="label">Buyer / customer box</label>
        <select className="input mb-4" value={prefs.party} onChange={(e) => set("party", e.target.value)} disabled={!isA4}>
          <option value="left">Left half</option><option value="right">Right half</option><option value="full">Full width</option>
        </select>

        <label className="label">Bottom section placement</label>
        <div className="mb-4 space-y-1.5">
          {SECTIONS.map(([k, l, canHide]) => (
            <div key={k} className={`flex items-center justify-between gap-2 ${!isA4 ? "opacity-40" : ""}`}>
              <span className="text-sm">{l}</span>
              <select className="input w-24 py-0.5 text-xs" value={prefs[k] as string} disabled={!isA4}
                onChange={(e) => set(k, e.target.value as PrintPrefs[typeof k])}>
                <option value="left">Left</option>
                <option value="right">Right</option>
                {canHide && <option value="hide">Hide</option>}
              </select>
            </div>
          ))}
        </div>

        <label className="label">Show on bill</label>
        <div className="space-y-2">
          {TOGGLES.map(([k, l]) => (
            <label key={k} className={`flex items-center gap-2 text-sm ${!isA4 ? "opacity-40" : ""}`}>
              <input type="checkbox" checked={prefs[k] as boolean} disabled={!isA4} onChange={(e) => set(k, e.target.checked as PrintPrefs[typeof k])} className="h-4 w-4 accent-teal-700" />
              {l}
            </label>
          ))}
        </div>
        {!isA4 && <p className="mt-2 text-xs text-slate-400">Options apply to A4 designs only.</p>}

        <div className="mt-auto pt-6">
          <button className="btn w-full" onClick={() => window.open(`/print/${id}?auto=1&${qs}`, "_blank")}>Print this bill</button>
          <p className="mt-2 text-center text-xs text-slate-400">Choices auto-save as your default</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-slate-200 p-4">
        <iframe key={qs} src={`/print/${id}?${qs}`} className="mx-auto h-full min-h-[1050px] w-full max-w-[210mm] rounded bg-white shadow" title="Bill preview" />
      </div>
    </div>
  );
}
