"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Combobox, { Option } from "./Combobox";
import { money, parseExpiry, r2, today } from "@/lib/format";

type Batch = { id: number; batch_no: string; expiry: string | null; mrp: number; purchase_rate: number; qty: number };
type Row = {
  key: number;
  item_id: number;
  item_name: string;
  batches: Batch[];
  batch_no: string;
  expiry: string;
  dir: 1 | -1;
  qty: string;
  rate: string;
};
let keySeq = 1;
const blank = (): Row => ({ key: keySeq++, item_id: 0, item_name: "", batches: [], batch_no: "", expiry: "", dir: -1, qty: "", rate: "" });

export type AdjustmentInitial = {
  id?: number;
  date: string;
  ref_no?: string | null;
  narration?: string | null;
  lines: { item_id: number; item_name: string; batch_no: string; expiry: string | null; qty: number; rate: number }[];
};

export default function AdjustmentForm({ initial }: { initial?: AdjustmentInitial }) {
  const router = useRouter();
  const [date, setDate] = useState(initial?.date || today());
  const [refNo, setRefNo] = useState(initial?.ref_no || "");
  const [narration, setNarration] = useState(initial?.narration || "");
  const [rows, setRows] = useState<Row[]>(
    initial?.lines.length
      ? initial.lines.map((l) => ({
          ...blank(),
          item_id: l.item_id,
          item_name: l.item_name,
          batch_no: l.batch_no,
          expiry: l.expiry ? l.expiry.slice(2, 7).split("-").reverse().join("/") : "",
          dir: l.qty < 0 ? -1 : 1,
          qty: String(Math.abs(l.qty)),
          rate: String(l.rate),
        }))
      : [blank()],
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => {
      const next = rs.map((r) => (r.key === key ? { ...r, ...patch } : r));
      if (next[next.length - 1]?.item_id) next.push(blank());
      return next;
    });

  const pickItem = (key: number, o: Option) => {
    const batches = (o.batches as Batch[]) ?? [];
    const b = batches[0];
    update(key, {
      item_id: o.id,
      item_name: String(o.name),
      batches,
      batch_no: b?.batch_no ?? "",
      expiry: b?.expiry ? b.expiry.slice(2, 7).split("-").reverse().join("/") : "",
      rate: String(b?.purchase_rate || o.purchase_rate || ""),
      qty: "",
    });
  };

  const pickBatch = (key: number, batchNo: string) => {
    const row = rows.find((r) => r.key === key);
    const b = row?.batches.find((x) => x.batch_no.toLowerCase() === batchNo.trim().toLowerCase());
    update(key, {
      batch_no: batchNo,
      ...(b ? { expiry: b.expiry ? b.expiry.slice(2, 7).split("-").reverse().join("/") : "", rate: String(b.purchase_rate || "") } : {}),
    });
  };

  const savingRef = useRef(false);
  const save = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setErr("");
    setSaving(true);
    let res: Response;
    try {
      res = await fetch(initial?.id ? `/api/vouchers/${initial.id}` : "/api/vouchers", {
        method: initial?.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "adjustment",
          date,
          ref_no: refNo,
          narration,
          lines: rows
            .filter((r) => r.item_id && Number(r.qty))
            .map((r) => ({
              item_id: r.item_id,
              batch_no: r.batch_no,
              expiry: parseExpiry(r.expiry),
              delta: r.dir * Number(r.qty),
              rate: Number(r.rate) || undefined,
            })),
        }),
      });
    } catch {
      savingRef.current = false;
      setSaving(false);
      return setErr("Network error — please try again");
    }
    const data = await res.json();
    setSaving(false);
    savingRef.current = false;
    if (!res.ok) return setErr(data.error || "Save failed");
    router.push(`/vouchers/view/${data.id}?saved=1`);
    router.refresh();
  }, [date, refNo, narration, rows, initial, router]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [save]);

  const total = rows.reduce((a, r) => a + (r.item_id ? r2(Number(r.qty || 0) * Number(r.rate || 0)) : 0), 0);

  return (
    <div className="max-w-5xl">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="h1 mb-0">Stock Adjustment / Write-off {initial?.id ? "(Edit)" : "(New)"}</h1>
        <div className="text-xs text-slate-500">Ctrl+S = save · Remove = damaged/expired/write-off, Add = stock found</div>
      </div>
      <div className="card mb-3 grid grid-cols-4 gap-3">
        <div><label className="label">Date</label><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><label className="label">Ref No</label><input className="input" value={refNo} onChange={(e) => setRefNo(e.target.value)} /></div>
        <div className="col-span-2"><label className="label">Reason / Narration</label><input className="input" value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="e.g. Expired stock destroyed" /></div>
      </div>
      <div className="card mb-3 p-0">
        <table className="tbl">
          <thead><tr><th className="w-1/3">Item</th><th>Batch</th><th>Exp</th><th>Action</th><th className="num">Qty</th><th className="num">Value Rate</th><th className="num">Value</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td><Combobox url="/api/items/search" value={r.item_name} placeholder="Search item..." onSelect={(o) => pickItem(r.key, o)} /></td>
                <td>
                  <input className="input w-24 px-1 py-0.5" value={r.batch_no} list={`b-${r.key}`} onChange={(e) => pickBatch(r.key, e.target.value)} />
                  <datalist id={`b-${r.key}`}>{r.batches.map((b) => <option key={b.id} value={b.batch_no}>{`qty ${b.qty}`}</option>)}</datalist>
                </td>
                <td><input className="input w-16 px-1 py-0.5" placeholder="MM/YY" value={r.expiry} onChange={(e) => update(r.key, { expiry: e.target.value })} /></td>
                <td>
                  <select className="input px-1 py-0.5" value={r.dir} onChange={(e) => update(r.key, { dir: Number(e.target.value) as 1 | -1 })}>
                    <option value={-1}>Remove</option>
                    <option value={1}>Add</option>
                  </select>
                </td>
                <td><input className="input num w-16 px-1 py-0.5" value={r.qty} onChange={(e) => update(r.key, { qty: e.target.value })} /></td>
                <td><input className="input num w-20 px-1 py-0.5" value={r.rate} onChange={(e) => update(r.key, { rate: e.target.value })} /></td>
                <td className="num">{r.item_id ? money(r2(Number(r.qty || 0) * Number(r.rate || 0))) : ""}</td>
                <td>{rows.length > 1 && r.item_id !== 0 && <button type="button" className="text-red-500" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>×</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {err && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      <div className="flex items-center gap-3">
        <button type="button" className="btn" disabled={saving} onClick={() => save()}>{saving ? "Saving..." : "Save (Ctrl+S)"}</button>
        <button type="button" className="btn-sec" onClick={() => router.back()}>Cancel</button>
        <span className="text-sm text-slate-600">Adjustment value: <b>₹ {money(r2(total))}</b></span>
      </div>
    </div>
  );
}
