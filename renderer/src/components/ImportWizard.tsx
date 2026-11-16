"use client";
import { useState } from "react";
import * as XLSX from "xlsx";
import { FIELDS, ImportType, detectHeaderRow, guessMapping } from "@/lib/importFields";

const TYPES: { key: ImportType; label: string; hint: string }[] = [
  { key: "parties", label: "Parties / Ledgers", hint: "Marg: Masters → Ledger/Party list → export to Excel. Include opening/closing balance for outstanding." },
  { key: "items", label: "Items / Products", hint: "Marg: Masters → Item/Product list → export to Excel (name, company, pack, HSN, GST, MRP, rates)." },
  { key: "stock", label: "Opening Stock (batch-wise)", hint: "Marg: Reports → Stock → Batch-wise stock → export. Items are created automatically if missing." },
];

export default function ImportWizard() {
  const [type, setType] = useState<ImportType>("parties");
  const [sheetRows, setSheetRows] = useState<unknown[][]>([]);
  const [headerRow, setHeaderRow] = useState(0);
  const [map, setMap] = useState<Record<string, number>>({});
  const [defaultGroup, setDefaultGroup] = useState("Sundry Debtors");
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const headers = (sheetRows[headerRow] || []).map((h, i) => String(h ?? "").trim() || `Column ${i + 1}`);
  const dataRows = sheetRows.slice(headerRow + 1).filter((r) => r.some((c) => String(c ?? "").trim() !== ""));

  const load = async (file: File, t = type) => {
    setFileName(file.name);
    setResult("");
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "" });
    const h = detectHeaderRow(t, rows);
    setSheetRows(rows);
    setHeaderRow(h);
    setMap(guessMapping(t, (rows[h] || []).map((c) => String(c ?? ""))));
  };

  const mapped = () =>
    dataRows.map((r) => Object.fromEntries(Object.entries(map).filter(([, i]) => i >= 0).map(([k, i]) => [k, r[i]])));

  const run = async () => {
    const missing = FIELDS[type].filter((f) => f.required && !(map[f.key] >= 0));
    if (missing.length) return setResult(`Map required field(s): ${missing.map((f) => f.label).join(", ")}`);
    setBusy(true);
    const rows = mapped();
    let created = 0, updated = 0, skipped = 0;
    for (let i = 0; i < rows.length; i += 1000) {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, rows: rows.slice(i, i + 1000), defaultGroup }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBusy(false);
        return setResult(`Error: ${data.errors?.join(", ")}`);
      }
      created += data.created; updated += data.updated; skipped += data.skipped;
    }
    setBusy(false);
    setResult(`Done. Created ${created}, updated ${updated}, skipped ${skipped} (blank names).`);
  };

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button key={t.key} className={type === t.key ? "btn" : "btn-sec"}
              onClick={() => { setType(t.key); setMap(sheetRows.length ? guessMapping(t.key, headers) : {}); setResult(""); }}>
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-slate-600">{TYPES.find((t) => t.key === type)?.hint}</p>
        <div className="flex flex-wrap items-center gap-3">
          <input type="file" accept=".xls,.xlsx,.csv,.txt" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} className="text-sm" />
          {fileName && <span className="text-sm text-slate-500">{fileName}: {dataRows.length} rows</span>}
        </div>
      </div>

      {sheetRows.length > 0 && (
        <div className="card space-y-3">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="label">Header row (auto-detected)</label>
              <input type="number" min={1} className="input w-24" value={headerRow + 1}
                onChange={(e) => {
                  const h = Math.max(0, Number(e.target.value) - 1);
                  setHeaderRow(h);
                  setMap(guessMapping(type, (sheetRows[h] || []).map((c) => String(c ?? ""))));
                }} />
            </div>
            {type === "parties" && (
              <div>
                <label className="label">Default group (when not in file)</label>
                <select className="input" value={defaultGroup} onChange={(e) => setDefaultGroup(e.target.value)}>
                  <option>Sundry Debtors</option><option>Sundry Creditors</option>
                </select>
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {FIELDS[type].map((f) => (
              <div key={f.key}>
                <label className="label">{f.label}{f.required && " *"}</label>
                <select className="input" value={map[f.key] ?? -1} onChange={(e) => setMap({ ...map, [f.key]: Number(e.target.value) })}>
                  <option value={-1}>— skip —</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <div className="label">Preview (first 8 rows after mapping)</div>
            <table className="tbl">
              <thead><tr>{FIELDS[type].filter((f) => map[f.key] >= 0).map((f) => <th key={f.key}>{f.label}</th>)}</tr></thead>
              <tbody>
                {mapped().slice(0, 8).map((r, i) => (
                  <tr key={i}>{FIELDS[type].filter((f) => map[f.key] >= 0).map((f) => <td key={f.key}>{String(r[f.key] ?? "")}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3">
            <button className="btn" disabled={busy} onClick={run}>{busy ? "Importing..." : `Import ${dataRows.length} rows`}</button>
            {result && <span className={`text-sm ${result.startsWith("Done") ? "text-green-700" : "text-red-700"}`}>{result}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
