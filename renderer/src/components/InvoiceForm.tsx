"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Combobox, { Option } from "./Combobox";
import { enterToNext } from "./useEnterNav";
import { fmtExpiry, money, parseExpiry, r2, today, VOUCHER_LABEL } from "@/lib/format";

type Batch = { id: number; batch_no: string; expiry: string | null; mrp: number; purchase_rate: number; sale_rate: number; qty: number };
export type Row = {
  key: number;
  item_id: number;
  item_name: string;
  pack?: string;
  batches: Batch[];
  batch_no: string;
  expiry: string;
  qty: number | "";
  free: number | "";
  mrp: number | "";
  rate: number | "";
  disc_pct: number | "";
  gst_rate: number;
  sale_rate: number | "";
  scheme_qty?: number;
  scheme_free?: number;
};
export type InvoiceType = "sale" | "purchase" | "sale_return" | "purchase_return" | "sale_order" | "purchase_order" | "challan";
type Party = { id: number; name: string; state?: string | null; gstin?: string | null; default_disc?: number; salesman_id?: number | null };
export type InvoiceInitial = {
  id?: number;
  number?: number;
  date: string;
  party: Party | null;
  cash: boolean;
  salesman_id?: number | null;
  source_id?: number | null;
  ref_no: string;
  ref_date: string;
  narration: string;
  rows: Row[];
};

let keySeq = 1;
const blank = (): Row => ({
  key: keySeq++, item_id: 0, item_name: "", batches: [], batch_no: "", expiry: "", qty: "", free: "", mrp: "",
  rate: "", disc_pct: "", gst_rate: 12, sale_rate: "",
});

export default function InvoiceForm({
  type,
  initial,
  company,
  salesmen = [],
}: {
  type: InvoiceType;
  initial?: InvoiceInitial;
  company: { state: string; gstin: string };
  salesmen?: { id: number; name: string }[];
}) {
  const router = useRouter();
  const isPurchase = type === "purchase";
  const isOrder = type === "sale_order" || type === "purchase_order";
  const isInward = type === "purchase" || type === "purchase_return" || type === "purchase_order";
  const isSaleSide = type === "sale" || type === "sale_order" || type === "challan" || type === "sale_return";
  const [salesman, setSalesman] = useState<number | "">(initial?.salesman_id ?? "");
  const [date, setDate] = useState(initial?.date ?? today());
  const [party, setParty] = useState(initial?.party ?? null);
  const [cash, setCash] = useState(initial?.cash ?? false);
  const [refNo, setRefNo] = useState(initial?.ref_no ?? "");
  const [refDate, setRefDate] = useState(initial?.ref_date ?? "");
  const [narration, setNarration] = useState(initial?.narration ?? "");
  const [rows, setRows] = useState<Row[]>(initial?.rows?.length ? [...initial.rows, blank()] : [blank()]);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const inter = useMemo(() => {
    if (!party) return false;
    if (company.gstin && party.gstin) return company.gstin.slice(0, 2) !== party.gstin.slice(0, 2);
    return !!party.state && !!company.state && party.state.toLowerCase() !== company.state.toLowerCase();
  }, [party, company]);

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => {
      const next = rs.map((r) => (r.key === key ? { ...r, ...patch } : r));
      if (next[next.length - 1].item_id) next.push(blank());
      return next;
    });

  const pickItem = (key: number, o: Option) => {
    const batches = (o.batches as Batch[]) ?? [];
    const usable = type === "sale" || type === "purchase_return" || type === "challan" ? batches.filter((b) => b.qty > 0) : batches;
    const b = isPurchase || isOrder ? undefined : usable[0];
    update(key, {
      item_id: o.id,
      item_name: String(o.name),
      pack: (o.pack as string) ?? "",
      batches: usable,
      gst_rate: Number(o.gst_rate) || 0,
      ...applyBatch(b, o),
      qty: "",
      free: "",
      disc_pct: isSaleSide && party?.default_disc ? party.default_disc : "",
      scheme_qty: Number(o.scheme_qty) || 0,
      scheme_free: Number(o.scheme_free) || 0,
    });
  };

  const applyBatch = (b: Batch | undefined, item?: Record<string, unknown>): Partial<Row> => {
    if (!b) {
      return {
        batch_no: "",
        expiry: "",
        mrp: Number(item?.mrp) || "",
        rate: (isInward ? Number(item?.purchase_rate) : Number(item?.ptr)) || "",
        sale_rate: Number(item?.ptr) || "",
      };
    }
    return {
      batch_no: b.batch_no,
      expiry: fmtExpiry(b.expiry),
      mrp: b.mrp || Number(item?.mrp) || "",
      rate: (isInward ? b.purchase_rate || Number(item?.purchase_rate) : b.sale_rate || Number(item?.ptr)) || "",
      sale_rate: b.sale_rate || "",
    };
  };

  const calc = (r: Row) => {
    const gross = r2(Number(r.qty || 0) * Number(r.rate || 0));
    const taxable = r2(gross - (gross * Number(r.disc_pct || 0)) / 100);
    const tax = r2((taxable * r.gst_rate) / 100);
    return { gross, taxable, tax, amount: r2(taxable + tax) };
  };

  const totals = rows.reduce(
    (a, r) => {
      if (!r.item_id) return a;
      const c = calc(r);
      return { gross: a.gross + c.gross, taxable: a.taxable + c.taxable, tax: a.tax + c.tax, qty: a.qty + Number(r.qty || 0) };
    },
    { gross: 0, taxable: 0, tax: 0, qty: 0 },
  );
  const exact = r2(totals.taxable + totals.tax);
  const net = Math.round(exact);

  const savingRef = useRef(false);
  const save = useCallback(async (print = false) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setErr("");
    setSaving(true);
    const body = {
      type,
      date,
      party_id: party?.id ?? null,
      cash,
      salesman_id: salesman || null,
      source_id: initial?.source_id ?? null,
      ref_no: refNo,
      ref_date: refDate,
      narration,
      lines: rows
        .filter((r) => r.item_id)
        .map((r) => ({
          item_id: r.item_id,
          batch_no: r.batch_no,
          expiry: parseExpiry(r.expiry),
          qty: Number(r.qty || 0),
          free: Number(r.free || 0),
          mrp: Number(r.mrp || 0),
          rate: Number(r.rate || 0),
          disc_pct: Number(r.disc_pct || 0),
          gst_rate: r.gst_rate,
          sale_rate: Number(r.sale_rate || 0),
        })),
    };
    let res: Response;
    try {
      res = await fetch(initial?.id ? `/api/vouchers/${initial.id}` : "/api/vouchers", {
        method: initial?.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
    if (print) window.open(`/print/${data.id}?auto=1`, "_blank");
    router.push(`/vouchers/view/${data.id}?saved=1`);
    router.refresh();
  }, [type, date, party, cash, salesman, refNo, refDate, narration, rows, initial, router]);

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

  const partyGroups = isInward ? "Sundry Creditors,Sundry Debtors" : "Sundry Debtors,Sundry Creditors";
  const cell = "input px-1 py-0.5";

  return (
    <div onKeyDown={enterToNext}>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="h1 mb-0">
          {VOUCHER_LABEL[type]} {initial?.number ? `#${initial.number}` : "(New)"}
        </h1>
        <div className="text-xs text-slate-500">Enter = next field · Ctrl+S = save · {inter ? "IGST (inter-state)" : "CGST + SGST"}</div>
      </div>
      <div className="card mb-3 grid grid-cols-6 gap-3">
        <div>
          <label className="label">Date</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="label">Party {cash && "(optional for cash)"}</label>
          <Combobox
            url={`/api/accounts/search?grp=${encodeURIComponent(partyGroups)}`}
            value={party?.name ?? ""}
            autoFocus
            placeholder="Search party..."
            onSelect={(o) => {
              setParty({ id: o.id, name: String(o.name), state: o.state as string, gstin: o.gstin as string, default_disc: Number(o.default_disc) || 0 });
              if (o.salesman_id) setSalesman(Number(o.salesman_id));
            }}
          />
        </div>
        <div className="flex items-end gap-2 pb-1">
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={cash} onChange={(e) => setCash(e.target.checked)} /> Cash bill
          </label>
        </div>
        {isSaleSide && salesmen.length > 0 && (
          <div>
            <label className="label">Salesman</label>
            <select className="input" value={salesman} onChange={(e) => setSalesman(e.target.value ? Number(e.target.value) : "")}>
              <option value="">--</option>
              {salesmen.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label">{isInward ? "Supplier Bill No" : "Ref / Order No"}</label>
          <input className="input" value={refNo} onChange={(e) => setRefNo(e.target.value)} />
        </div>
        <div>
          <label className="label">{isInward ? "Supplier Bill Date" : "Ref Date"}</label>
          <input type="date" className="input" value={refDate} onChange={(e) => setRefDate(e.target.value)} />
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="tbl">
          <thead>
            <tr>
              <th className="w-8">#</th>
              <th className="min-w-64">Item</th>
              {!isOrder && <th className="w-32">Batch</th>}
              {!isOrder && <th className="w-20">Expiry</th>}
              <th className="w-20 num">Qty</th>
              <th className="w-16 num">Free</th>
              <th className="w-24 num">MRP</th>
              <th className="w-24 num">Rate</th>
              {isPurchase && <th className="w-24 num">Sale Rate</th>}
              <th className="w-16 num">Disc%</th>
              <th className="w-16 num">GST%</th>
              <th className="w-28 num">Amount</th>
              <th className="w-6"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const c = calc(r);
              const selBatch = r.batches.find((b) => b.batch_no === r.batch_no);
              return (
                <tr key={r.key}>
                  <td className="text-slate-400">{idx + 1}</td>
                  <td>
                    <Combobox url="/api/items/search" value={r.item_name} placeholder="Search item..." onSelect={(o) => pickItem(r.key, o)} />
                    {r.item_id > 0 && (r.pack || r.scheme_qty) && (
                      <div className="text-[11px] text-slate-500">
                        {r.pack && `Pack ${r.pack}`} {r.scheme_qty ? `· Scheme ${r.scheme_qty}+${r.scheme_free}` : ""}
                      </div>
                    )}
                  </td>
                  {!isOrder && <td>
                    {isPurchase || r.batches.length === 0 ? (
                      <input className={cell} value={r.batch_no} onChange={(e) => update(r.key, { batch_no: e.target.value })} />
                    ) : (
                      <select
                        className={cell}
                        value={r.batch_no}
                        onChange={(e) => update(r.key, applyBatch(r.batches.find((b) => b.batch_no === e.target.value)))}
                      >
                        {r.batches.map((b) => (
                          <option key={b.id} value={b.batch_no}>
                            {b.batch_no} | {fmtExpiry(b.expiry)} | Q {b.qty}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>}
                  {!isOrder && <td>
                    <input className={cell} placeholder="MM/YY" value={r.expiry} readOnly={!isPurchase && !!selBatch}
                      onChange={(e) => update(r.key, { expiry: e.target.value })} />
                  </td>}
                  <td>
                    <input className={`${cell} num`} type="number" step="any" value={r.qty} onChange={(e) => {
                      const qty = e.target.value === "" ? "" : Number(e.target.value);
                      const patch: Partial<Row> = { qty };
                      if (isSaleSide && type !== "sale_return" && r.scheme_qty && r.scheme_free) {
                        patch.free = Math.floor(Number(qty || 0) / r.scheme_qty) * r.scheme_free || "";
                      }
                      update(r.key, patch);
                    }} />
                    {selBatch && !isPurchase && <div className="text-right text-[10px] text-slate-500">Stk {selBatch.qty}</div>}
                  </td>
                  <td><input className={`${cell} num`} type="number" step="any" value={r.free} onChange={(e) => update(r.key, { free: e.target.value === "" ? "" : Number(e.target.value) })} /></td>
                  <td><input className={`${cell} num`} type="number" step="any" value={r.mrp} onChange={(e) => update(r.key, { mrp: e.target.value === "" ? "" : Number(e.target.value) })} /></td>
                  <td><input className={`${cell} num`} type="number" step="any" value={r.rate} onChange={(e) => update(r.key, { rate: e.target.value === "" ? "" : Number(e.target.value) })} /></td>
                  {isPurchase && (
                    <td><input className={`${cell} num`} type="number" step="any" value={r.sale_rate} onChange={(e) => update(r.key, { sale_rate: e.target.value === "" ? "" : Number(e.target.value) })} /></td>
                  )}
                  <td><input className={`${cell} num`} type="number" step="any" value={r.disc_pct} onChange={(e) => update(r.key, { disc_pct: e.target.value === "" ? "" : Number(e.target.value) })} /></td>
                  <td>
                    <select className={cell} value={r.gst_rate} onChange={(e) => update(r.key, { gst_rate: Number(e.target.value) })}>
                      {[0, 5, 12, 18, 28].map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </td>
                  <td className="num">{r.item_id ? money(c.amount) : ""}</td>
                  <td>
                    {r.item_id > 0 && (
                      <button type="button" className="text-red-500 hover:text-red-700" title="Remove"
                        onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>✕</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <div className="card col-span-2">
          <label className="label">Narration</label>
          <textarea className="input h-16" value={narration} onChange={(e) => setNarration(e.target.value)} />
          {err && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
          <div className="mt-3 flex gap-2">
            <button type="button" data-nav className="btn" disabled={saving} onClick={() => save()}>
              {saving ? "Saving..." : "Save (Ctrl+S)"}
            </button>
            <button type="button" className="btn-sec" disabled={saving} onClick={() => save(true)}>Save & Print</button>
            <button type="button" className="btn-sec" onClick={() => router.back()}>Cancel</button>
          </div>
        </div>
        <div className="card text-sm">
          <div className="flex justify-between"><span>Total Qty</span><span>{totals.qty}</span></div>
          <div className="flex justify-between"><span>Gross</span><span>{money(totals.gross)}</span></div>
          <div className="flex justify-between"><span>Discount</span><span>{money(totals.gross - totals.taxable)}</span></div>
          <div className="flex justify-between"><span>Taxable</span><span>{money(totals.taxable)}</span></div>
          {inter ? (
            <div className="flex justify-between"><span>IGST</span><span>{money(totals.tax)}</span></div>
          ) : (
            <>
              <div className="flex justify-between"><span>CGST</span><span>{money(totals.tax / 2)}</span></div>
              <div className="flex justify-between"><span>SGST</span><span>{money(totals.tax / 2)}</span></div>
            </>
          )}
          <div className="flex justify-between"><span>Round Off</span><span>{money(net - exact)}</span></div>
          <div className="mt-2 flex justify-between border-t pt-2 text-lg font-bold text-teal-800"><span>Net Amount</span><span>₹ {money(net)}</span></div>
        </div>
      </div>
    </div>
  );
}
