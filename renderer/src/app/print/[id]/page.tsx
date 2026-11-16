import { notFound } from "next/navigation";
import QRCode from "qrcode";
import bwipjs from "bwip-js/node";
import { db, getSettings } from "@/lib/db";
import { amountInWords, fmtDate, fmtExpiry, money, r2, VOUCHER_LABEL, vno } from "@/lib/format";
import PrintButton from "@/components/PrintButton";
import { LogoMark } from "@/components/Logo";

const TITLES: Record<string, string> = {
  sale: "TAX INVOICE", sale_return: "CREDIT NOTE", purchase_return: "DEBIT NOTE", purchase: "PURCHASE VOUCHER",
  sale_order: "SALE ORDER", purchase_order: "PURCHASE ORDER", challan: "DELIVERY CHALLAN",
};

const COPY_LABEL: Record<string, string> = {
  original: "Original for Buyer", duplicate: "Duplicate for Transporter", triplicate: "Triplicate for Supplier",
};

const ACCENTS: Record<string, { text: string; bg: string; border: string }> = {
  teal:   { text: "text-teal-700",   bg: "bg-teal-700",   border: "border-teal-600" },
  blue:   { text: "text-blue-700",   bg: "bg-blue-700",   border: "border-blue-600" },
  indigo: { text: "text-indigo-700", bg: "bg-indigo-700", border: "border-indigo-600" },
  slate:  { text: "text-slate-700",  bg: "bg-slate-700",  border: "border-slate-600" },
};

const SEC_ORDER = ["gst", "words", "terms", "decl", "bank", "totals", "bal", "sign", "foot"];

export default async function PrintInvoice({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const id = Number((await params).id);
  const q = await searchParams;
  const { auto, format = "a4" } = q;
  const on = (k: string) => q[k] !== "0";
  const zone = (k: string, def: string) => (["left", "right", "hide"].includes(q[k] ?? "") ? q[k]! : def);
  const opt = {
    copy: COPY_LABEL[q.copy ?? ""] ? q.copy! : "",
    logo: on("logo"), hsn: on("hsn"), batch: on("batch"), free: on("free"), mrp: on("mrp"),
    brand: q.brand === "1", sm: on("sm"), bar: q.bar === "1",
    gsum: q.gsum === "hsn" ? "hsn" : "rate",
    signt: (q.signt ?? "").slice(0, 40),
    accent: ACCENTS[q.accent ?? ""] ? q.accent! : "teal",
    party: q.party === "right" ? "right" : q.party === "full" ? "full" : "left",
    fs: ["s", "l"].includes(q.fs ?? "") ? q.fs! : "m",
    frame: q.frame === "none" ? "none" : "box",
    stamp: q.stamp === "paid" ? "PAID" : q.stamp === "due" ? "DUE" : "",
    lhmm: Math.min(80, Math.max(0, Number(q.lhmm) || 40)),
    z: {
      gst: zone("zgst", q.gst === "0" ? "hide" : "left"),
      words: zone("zwords", q.words === "0" ? "hide" : "left"),
      terms: zone("zterms", q.terms === "0" ? "hide" : "left"),
      decl: zone("zdecl", "left"),
      bank: zone("zbank", "left"),
      sign: zone("zsign", q.sign === "0" ? "hide" : "right"),
      totals: q.ztotals === "left" ? "left" : "right",
      bal: zone("zbal", "right"),
      foot: zone("zfoot", "left"),
    } as Record<string, string>,
  };
  const acc = ACCENTS[opt.accent];
  const bd = opt.frame === "none" ? "border-transparent" : "border-black";
  const fsCls = opt.fs === "s" ? "text-[10px]" : opt.fs === "l" ? "text-[13px]" : "text-[12px]";
  const d = db();
  const s = getSettings();
  const v = d.prepare("SELECT * FROM vouchers WHERE id = ?").get(id) as Record<string, string | number> | undefined;
  if (!v) notFound();
  const p = (v.party_id ? d.prepare("SELECT * FROM accounts WHERE id = ?").get(v.party_id) : null) as Record<string, string> | null;
  const lines = d.prepare("SELECT vi.*, i.name, i.pack, i.hsn, i.company FROM voucher_items vi JOIN items i ON i.id = vi.item_id WHERE voucher_id = ? ORDER BY vi.id").all(id) as Record<string, string | number>[];
  const byRate = new Map<number, { taxable: number; cgst: number; sgst: number; igst: number }>();
  for (const l of lines) {
    const k = Number(l.gst_rate);
    const e = byRate.get(k) ?? { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    e.taxable += Number(l.taxable); e.cgst += Number(l.cgst); e.sgst += Number(l.sgst); e.igst += Number(l.igst);
    byRate.set(k, e);
  }
  const title = TITLES[v.type as string] ?? "VOUCHER";
  const hasBank = !!(s.bank_name || s.bank_ac || s.bank_ifsc);
  const upiQr = s.upi_id && v.type === "sale"
    ? await QRCode.toDataURL(`upi://pay?pa=${s.upi_id}&pn=${encodeURIComponent(s.company_name)}&am=${Number(v.total).toFixed(2)}&cu=INR`, { margin: 0, width: 110 })
    : "";
  const sman = opt.sm && v.salesman_id
    ? (d.prepare("SELECT name FROM salesmen WHERE id = ?").get(v.salesman_id) as { name: string } | undefined)?.name
    : "";
  // HSN-wise GST summary
  const byHsn = new Map<string, { taxable: number; cgst: number; sgst: number; igst: number }>();
  for (const l of lines) {
    const k = (l.hsn as string) || "-";
    const e = byHsn.get(k) ?? { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    e.taxable += Number(l.taxable); e.cgst += Number(l.cgst); e.sgst += Number(l.sgst); e.igst += Number(l.igst);
    byHsn.set(k, e);
  }
  const gstRows: [string, { taxable: number; cgst: number; sgst: number; igst: number }][] =
    opt.gsum === "hsn" ? [...byHsn.entries()] : [...byRate.entries()].map(([r, e]) => [`${r}%`, e]);
  // Party balance: ledger position before & after this bill
  const BAL_TYPES = ["sale", "purchase", "sale_return", "purchase_return"];
  let prevBal: number | null = null, closeBal = 0;
  if (p && BAL_TYPES.includes(v.type as string)) {
    closeBal = Number((d.prepare("SELECT COALESCE(SUM(debit - credit), 0) AS b FROM ledger_entries WHERE account_id = ?").get(v.party_id) as { b: number }).b);
    const own = Number((d.prepare("SELECT COALESCE(SUM(debit - credit), 0) AS b FROM ledger_entries WHERE voucher_id = ? AND account_id = ?").get(id, v.party_id) as { b: number }).b);
    prevBal = closeBal - own;
  }
  const balTxt = (b: number) => `${money(Math.abs(b))} ${b >= 0 ? "Dr" : "Cr"}`;
  const totQty = lines.reduce((a, l) => a + Number(l.qty) + Number(l.free), 0);
  const barcode = opt.bar
    ? `data:image/png;base64,${(await bwipjs.toBuffer({ bcid: "code128", text: vno(v.type as string, v.number as number), scale: 2, height: 9, includetext: false })).toString("base64")}`
    : "";
  const Stamp = opt.stamp ? (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden">
      <span className={`-rotate-45 select-none text-7xl font-black tracking-widest ${opt.stamp === "PAID" ? "text-green-600/20" : "text-red-500/20"}`}>{opt.stamp}</span>
    </div>
  ) : null;

  // ---------- Thermal receipt (80mm / 58mm) ----------
  if (format === "thermal" || format === "thermal58") {
    const mm = format === "thermal58" ? 58 : 80;
    return (
      <div className={`mx-auto ${mm === 58 ? "w-[54mm] text-[9px]" : "w-[76mm] text-[11px]"} bg-white p-2 font-mono leading-tight text-black`}>
        <style>{`@media print { @page { size: ${mm}mm auto; margin: 2mm; } }`}</style>
        <div className="no-print mb-2"><PrintButton auto={!!auto} /></div>
        <div className="text-center">
          <div className="text-[13px] font-bold">{s.company_name}</div>
          <div>{s.address}</div>
          {s.phone && <div>Ph: {s.phone}</div>}
          {s.gstin && <div>GSTIN: {s.gstin}</div>}
          {s.dl_no && <div>DL: {s.dl_no}</div>}
          <div className="mt-1 font-bold">{title}</div>
        </div>
        <div className="mt-1 flex justify-between border-t border-dashed border-black pt-1">
          <span>No: {vno(v.type as string, v.number as number)}</span><span>{fmtDate(v.date as string)}</span>
        </div>
        <div>{p ? p.name : "Cash"}{p?.gstin ? ` (${p.gstin})` : ""}</div>
        <div className="mt-1 border-t border-dashed border-black pt-1">
          {lines.map((l) => (
            <div key={l.id} className="mb-1">
              <div className="font-semibold">{l.name}</div>
              <div className="flex justify-between">
                <span>{l.batch_no} {fmtExpiry(l.expiry as string)} {Number(l.qty)}{Number(l.free) ? `+${l.free}` : ""} x {money(Number(l.rate))}</span>
                <span>{money(Number(l.amount))}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-dashed border-black pt-1">
          <div className="flex justify-between"><span>Taxable</span><span>{money(Number(v.taxable))}</span></div>
          {Number(v.igst) ? <div className="flex justify-between"><span>IGST</span><span>{money(Number(v.igst))}</span></div> : (
            <><div className="flex justify-between"><span>CGST</span><span>{money(Number(v.cgst))}</span></div>
            <div className="flex justify-between"><span>SGST</span><span>{money(Number(v.sgst))}</span></div></>
          )}
          <div className="flex justify-between"><span>Round Off</span><span>{money(Number(v.round_off))}</span></div>
          <div className="flex justify-between border-t border-black text-[13px] font-bold"><span>NET</span><span>{money(Number(v.total))}</span></div>
        </div>
        <div className="mt-2 text-center">Thank you! Get well soon.</div>
      </div>
    );
  }

  // ---------- Estimate / Cash Bill (no GST columns — for unregistered sale) ----------
  if (format === "estimate") {
    return (
      <div className="mx-auto w-[140mm] bg-white p-4 text-[12px] text-black">
        <style>{`@media print { @page { size: A5; margin: 8mm; } }`}</style>
        <div className="no-print mb-2"><PrintButton auto={!!auto} /></div>
        <div className="border-b-2 border-black pb-2 text-center">
          <div className="text-xl font-bold">{s.company_name}</div>
          <div>{s.address}</div>
          {s.phone && <div>Ph: {s.phone}</div>}
          <div className="mt-1 font-bold">{v.type === "sale" ? "CASH / ESTIMATE BILL" : title}</div>
        </div>
        <div className="flex justify-between border-b border-black py-1">
          <span>No: <b>{vno(v.type as string, v.number as number)}</b></span>
          <span>Date: <b>{fmtDate(v.date as string)}</b></span>
        </div>
        <div className="border-b border-black py-1">
          To: <b>{p ? p.name : "Cash"}</b>{p?.phone ? ` | Ph: ${p.phone}` : ""}
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-black text-left">
              <th className="py-0.5">#</th><th>Item</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.id}>
                <td className="py-0.5">{i + 1}</td>
                <td>{l.name} <span className="text-gray-500">{l.batch_no} {fmtExpiry(l.expiry as string)}</span></td>
                <td className="text-right">{l.qty}{Number(l.free) ? `+${l.free}` : ""}</td>
                <td className="text-right">{money(Number(l.rate))}</td>
                <td className="text-right">{money(Number(l.amount))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-1 border-t border-black pt-1">
          {Number(v.discount) ? <div className="flex justify-between"><span>Discount</span><span>{money(Number(v.discount))}</span></div> : null}
          <div className="flex justify-between"><span>Round Off</span><span>{money(Number(v.round_off))}</span></div>
          <div className="flex justify-between border-t border-black pt-0.5 text-base font-bold"><span>NET TOTAL</span><span>₹ {money(Number(v.total))}</span></div>
        </div>
        <div className="mt-1 text-[11px]">{amountInWords(Number(v.total))}</div>
        <div className="mt-3 flex items-end justify-between">
          <div className="text-[10px] text-gray-600">E&OE. {s.invoice_terms || "Goods once sold will not be taken back."}</div>
          <div className="text-right">For {s.company_name}<br /><br />Signature</div>
        </div>
      </div>
    );
  }

  // ---------- Modern GST invoice ----------
  if (format === "modern") {
    return (
      <div className={`relative mx-auto max-w-[210mm] bg-white p-8 ${fsCls} text-slate-800`}>
        <style>{`@media print { @page { size: A4; margin: 12mm; } }`}</style>
        <div className="no-print mb-3"><PrintButton auto={!!auto} /></div>
        {Stamp}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            {opt.logo && <LogoMark size={52} />}
            <div>
              <div className={`text-2xl font-bold ${acc.text}`}>{s.company_name}</div>
              <div className="text-slate-500">{s.address}</div>
              <div className="text-slate-500">Ph: {s.phone} {s.email && `| ${s.email}`}</div>
              <div>GSTIN: <b>{s.gstin}</b> | DL: {s.dl_no}</div>
            </div>
          </div>
          <div className="text-right">
            <div className={`text-xl font-bold uppercase tracking-widest ${acc.text}`}>{title}</div>
            {opt.copy && <div className="text-[10px] font-bold uppercase tracking-wider text-red-600">{COPY_LABEL[opt.copy]}</div>}
            <div className="mt-1">No: <b>{vno(v.type as string, v.number as number)}</b></div>
            <div>Date: <b>{fmtDate(v.date as string)}</b></div>
            {v.ref_no && <div>Ref: {v.ref_no}</div>}
            {sman && <div>Salesman: {sman}</div>}
            {barcode && <img src={barcode} alt="barcode" className="ml-auto mt-1 h-8" />}
          </div>
        </div>
        <div className={`mt-4 border-t-4 ${acc.border} pt-3 ${opt.party === "right" ? "flex justify-end text-right" : ""}`}>
          <div className={opt.party === "full" ? "w-full" : "w-64"}>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Billed {v.type?.toString().startsWith("sale") ? "to" : "from"}</div>
            {p ? (
              <>
                <div className="font-bold">{p.name}</div>
                <div className="text-slate-500">{p.address} {p.city}</div>
                <div className="text-slate-500">GSTIN: {p.gstin || "Unregistered"} | State: {p.state} {p.dl_no && `| DL: ${p.dl_no}`}</div>
              </>
            ) : <div className="font-bold">Cash</div>}
          </div>
        </div>
        <table className="mt-4 w-full border-collapse">
          <thead>
            <tr className={`${acc.bg} text-left text-white`}>
              {["#", "Product", "Pack", opt.brand && "Company", opt.hsn && "HSN", opt.batch && "Batch", opt.batch && "Exp", "Qty", opt.free && "Free", opt.mrp && "MRP", "Rate", "Disc%", "GST%", "Amount"].filter(Boolean).map((h) => (
                <th key={h as string} className="px-1.5 py-1 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.id} className={`${i % 2 ? "bg-slate-50" : ""} border-b border-slate-200 align-top`}>
                <td className="px-1.5 py-1">{i + 1}</td>
                <td className="px-1.5 py-1">{l.name}</td>
                <td className="px-1.5 py-1">{l.pack}</td>
                {opt.brand && <td className="px-1.5 py-1">{l.company}</td>}
                {opt.hsn && <td className="px-1.5 py-1">{l.hsn}</td>}
                {opt.batch && <td className="px-1.5 py-1">{l.batch_no}</td>}
                {opt.batch && <td className="px-1.5 py-1">{fmtExpiry(l.expiry as string)}</td>}
                <td className="px-1.5 py-1 text-right">{l.qty}</td>
                {opt.free && <td className="px-1.5 py-1 text-right">{Number(l.free) || ""}</td>}
                {opt.mrp && <td className="px-1.5 py-1 text-right">{money(Number(l.mrp))}</td>}
                <td className="px-1.5 py-1 text-right">{money(Number(l.rate))}</td>
                <td className="px-1.5 py-1 text-right">{Number(l.disc_pct) || ""}</td>
                <td className="px-1.5 py-1 text-right">{l.gst_rate}</td>
                <td className="px-1.5 py-1 text-right font-medium">{money(Number(l.taxable))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-1 text-right text-[10px] text-slate-500">Items: {lines.length} | Total Qty: {totQty}</div>
        {(() => {
          const secs: Record<string, React.ReactNode> = {
            gst: (
              <table className="text-[11px]">
                <thead><tr className="border-b border-slate-300 text-left text-slate-500"><th className="pr-3">{opt.gsum === "hsn" ? "HSN" : "GST%"}</th><th className="pr-3 text-right">Taxable</th><th className="pr-3 text-right">CGST</th><th className="pr-3 text-right">SGST</th><th className="text-right">IGST</th></tr></thead>
                <tbody>
                  {gstRows.map(([rate, e]) => (
                    <tr key={rate}><td className="pr-3">{rate}</td><td className="pr-3 text-right">{money(e.taxable)}</td><td className="pr-3 text-right">{money(e.cgst)}</td><td className="pr-3 text-right">{money(e.sgst)}</td><td className="text-right">{money(e.igst)}</td></tr>
                  ))}
                </tbody>
              </table>
            ),
            words: <div className="font-semibold italic text-slate-600">{amountInWords(Number(v.total))}</div>,
            terms: <div className="max-w-sm text-[10px] text-slate-400">{s.invoice_terms || "Goods once sold will not be taken back. Subject to local jurisdiction."}</div>,
            decl: s.declaration ? <div className="max-w-sm text-[10px] italic text-slate-500">{s.declaration}</div> : null,
            bank: (hasBank || upiQr) ? (
              <div className="flex items-center gap-3 text-left">
                {upiQr && <img src={upiQr} alt="UPI QR" className="h-20 w-20" />}
                <div className="text-[10px] text-slate-500">
                  {upiQr && <div className="font-semibold text-slate-600">Scan to pay via UPI</div>}
                  {hasBank && <div>Bank: {s.bank_name} {s.bank_ac && `| A/C: ${s.bank_ac}`} {s.bank_ifsc && `| IFSC: ${s.bank_ifsc}`}</div>}
                </div>
              </div>
            ) : null,
            totals: (
              <div className="w-64 rounded-lg bg-slate-50 p-3">
                <div className="flex justify-between"><span className="text-slate-500">Gross</span><span>{money(Number(v.gross))}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Discount</span><span>{money(Number(v.discount))}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Taxable</span><span>{money(Number(v.taxable))}</span></div>
                {Number(v.igst) ? <div className="flex justify-between"><span className="text-slate-500">IGST</span><span>{money(Number(v.igst))}</span></div> : (
                  <>
                    <div className="flex justify-between"><span className="text-slate-500">CGST</span><span>{money(Number(v.cgst))}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">SGST</span><span>{money(Number(v.sgst))}</span></div>
                  </>
                )}
                <div className="flex justify-between"><span className="text-slate-500">Round Off</span><span>{money(r2(Number(v.round_off)))}</span></div>
                <div className={`mt-2 flex justify-between rounded ${acc.bg} px-2 py-1 text-base font-bold text-white`}><span>Net</span><span>₹ {money(Number(v.total))}</span></div>
              </div>
            ),
            bal: prevBal !== null ? (
              <div>
                <div className="flex justify-between"><span className="text-slate-500">Previous Balance</span><span>{balTxt(prevBal)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">This Bill</span><span>{money(Number(v.total))}</span></div>
                <div className="flex justify-between font-bold"><span>Net Balance</span><span>{balTxt(closeBal)}</span></div>
              </div>
            ) : null,
            sign: (
              <div className="pt-2 text-right text-slate-500">
                <div>For {s.company_name}</div>
                {s.signature ? <img src={s.signature} alt="" className="ml-auto h-10" /> : <div className="h-10" />}
                <div>{opt.signt || "Authorised Signatory"}</div>
              </div>
            ),
            foot: s.footer_note ? <div className="text-center text-[10px] italic text-slate-400">{s.footer_note}</div> : null,
          };
          const leftS = SEC_ORDER.filter((k) => opt.z[k] === "left" && secs[k]);
          const rightS = SEC_ORDER.filter((k) => opt.z[k] === "right" && secs[k]);
          return (
            <div className="mt-4 flex justify-between gap-6">
              <div className="flex-1 space-y-3">{leftS.map((k) => <div key={k}>{secs[k]}</div>)}</div>
              <div className="w-64 space-y-3">{rightS.map((k) => <div key={k}>{secs[k]}</div>)}</div>
            </div>
          );
        })()}
      </div>
    );
  }

  // ---------- A4 / A5 / Letterhead / Compact GST invoice ----------
  const a5 = format === "a5";
  const compact = format === "compact";
  const letterhead = format === "letterhead";
  const dense = a5 || compact;
  return (
    <div className={`relative mx-auto bg-white text-black ${dense ? `${a5 ? "w-[144mm]" : "max-w-[210mm]"} p-3 text-[9px]` : `max-w-[210mm] p-6 ${fsCls}`}`}>
      <style>{`@media print { @page { size: ${a5 ? "A5" : "A4"}; margin: ${a5 ? "5mm" : compact ? "8mm" : letterhead ? "8mm" : "10mm"}; } }`}</style>
      <div className="no-print mb-3 flex gap-2"><PrintButton auto={!!auto} /></div>
      {Stamp}
      <div className={``}>
        <div className={``}>
          {letterhead ? (
            <div className={``}><div style={{ height: `${opt.lhmm}mm` }} /></div>
          ) : (
          <div className={``}>
            <div className={`${dense ? "text-sm" : "text-lg"} font-bold`}>{s.company_name}</div>
            <div>{s.address}</div>
            <div>Ph: {s.phone} {s.email && `| ${s.email}`}</div>
            <div>GSTIN: <b>{s.gstin}</b> | State: {s.state}</div>
            <div>DL No: {s.dl_no}</div>
          </div>
          )}
          <div className="p-2">
            <div className={`text-center ${dense ? "text-xs" : "text-base"} font-bold`}>{title}</div>
            {opt.copy && <div className="text-center text-[9px] font-bold uppercase text-red-600">{COPY_LABEL[opt.copy]}</div>}
            <div>No: <b>{vno(v.type as string, v.number as number)}</b></div>
            <div>Date: <b>{fmtDate(v.date as string)}</b></div>
            {v.ref_no && <div>Ref: {v.ref_no}</div>}
            {sman && <div>Salesman: {sman}</div>}
            {barcode && <img src={barcode} alt="barcode" className="mt-1 h-6" />}
          </div>
        </div>
        <div className={`border-b ${bd} p-2 ${opt.party === "full" ? "" : "grid grid-cols-2"}`}>
          <div className={opt.party === "right" ? "col-start-2" : ""}>
            <div className={`${dense ? "text-[8px]" : "text-[11px]"} text-gray-600`}>{VOUCHER_LABEL[v.type as string]} {v.type?.toString().startsWith("sale") ? "to" : "from"}:</div>
            {p ? (
              <>
                <div className="font-bold">{p.name}</div>
                <div>{p.address} {p.city}</div>
                <div>GSTIN: {p.gstin || "Unregistered"} | State: {p.state} {p.dl_no && `| DL: ${p.dl_no}`} {p.phone && `| Ph: ${p.phone}`}</div>
              </>
            ) : <div className="font-bold">Cash</div>}
          </div>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr className={``}>
              {["#", "Product", "Pack", opt.brand && "Company", opt.hsn && "HSN", opt.batch && "Batch", opt.batch && "Exp", "Qty", opt.free && "Free", opt.mrp && "MRP", "Rate", "Disc%", "GST%", "Amount"].filter(Boolean).map((h) => (
                <th key={h as string} className={``}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.id} className="align-top">
                <td className={``}>{i + 1}</td>
                <td className={``}>{l.name}</td>
                <td className={``}>{l.pack}</td>
                {opt.brand && <td className={``}>{l.company}</td>}
                {opt.hsn && <td className={``}>{l.hsn}</td>}
                {opt.batch && <td className={``}>{l.batch_no}</td>}
                {opt.batch && <td className={``}>{fmtExpiry(l.expiry as string)}</td>}
                <td className={``}>{l.qty}</td>
                {opt.free && <td className={``}>{Number(l.free) || ""}</td>}
                {opt.mrp && <td className={``}>{money(Number(l.mrp))}</td>}
                <td className={``}>{money(Number(l.rate))}</td>
                <td className={``}>{Number(l.disc_pct) || ""}</td>
                <td className={``}>{l.gst_rate}</td>
                <td className="px-1 text-right">{money(Number(l.taxable))}</td>
              </tr>
            ))}
            <tr><td colSpan={13 + (opt.brand ? 1 : 0) - (opt.hsn ? 0 : 1) - (opt.batch ? 0 : 2) - (opt.free ? 0 : 1) - (opt.mrp ? 0 : 1)} className={dense ? "h-6" : "h-16"}></td></tr>
            <tr><td colSpan={13 + (opt.brand ? 1 : 0) - (opt.hsn ? 0 : 1) - (opt.batch ? 0 : 2) - (opt.free ? 0 : 1) - (opt.mrp ? 0 : 1)} className={`border-t ${bd} px-1 text-right font-semibold`}>Items: {lines.length} | Total Qty: {totQty}</td></tr>
          </tbody>
        </table>
        {(() => {
          const secs: Record<string, React.ReactNode> = {
            gst: (
              <table className={`w-full ${dense ? "text-[8px]" : "text-[11px]"}`}>
                <thead><tr className="text-left"><th>{opt.gsum === "hsn" ? "HSN" : "GST%"}</th><th className="text-right">Taxable</th><th className="text-right">CGST</th><th className="text-right">SGST</th><th className="text-right">IGST</th></tr></thead>
                <tbody>
                  {gstRows.map(([rate, e]) => (
                    <tr key={rate}><td>{rate}</td><td className="text-right">{money(e.taxable)}</td><td className="text-right">{money(e.cgst)}</td><td className="text-right">{money(e.sgst)}</td><td className="text-right">{money(e.igst)}</td></tr>
                  ))}
                </tbody>
              </table>
            ),
            words: <div className="font-semibold">{amountInWords(Number(v.total))}</div>,
            terms: <div className={`${dense ? "text-[7px]" : "text-[10px]"} text-gray-600`}>{s.invoice_terms || "Goods once sold will not be taken back. Subject to local jurisdiction."}</div>,
            decl: s.declaration ? <div className={`${dense ? "text-[7px]" : "text-[10px]"} italic text-gray-600`}>{s.declaration}</div> : null,
            bank: (hasBank || upiQr) ? (
              <div className="flex items-center gap-3 text-left">
                {upiQr && <img src={upiQr} alt="UPI QR" className={dense ? "h-14 w-14" : "h-20 w-20"} />}
                <div className={dense ? "text-[7px] text-gray-600" : "text-[10px] text-gray-600"}>
                  {upiQr && <div className="font-semibold">Scan to pay via UPI</div>}
                  {hasBank && <div>Bank: {s.bank_name} {s.bank_ac && `| A/C: ${s.bank_ac}`} {s.bank_ifsc && `| IFSC: ${s.bank_ifsc}`}</div>}
                </div>
              </div>
            ) : null,
            totals: (
              <div>
                <div className="flex justify-between"><span>Gross</span><span>{money(Number(v.gross))}</span></div>
                <div className="flex justify-between"><span>Discount</span><span>{money(Number(v.discount))}</span></div>
                <div className="flex justify-between"><span>Taxable</span><span>{money(Number(v.taxable))}</span></div>
                {Number(v.igst) ? <div className="flex justify-between"><span>IGST</span><span>{money(Number(v.igst))}</span></div> : (
                  <>
                    <div className="flex justify-between"><span>CGST</span><span>{money(Number(v.cgst))}</span></div>
                    <div className="flex justify-between"><span>SGST</span><span>{money(Number(v.sgst))}</span></div>
                  </>
                )}
                <div className="flex justify-between"><span>Round Off</span><span>{money(r2(Number(v.round_off)))}</span></div>
                <div className={`mt-1 flex justify-between border-t ${bd} pt-1 ${dense ? "text-xs" : "text-base"} font-bold`}><span>Net</span><span>₹ {money(Number(v.total))}</span></div>
              </div>
            ),
            bal: prevBal !== null ? (
              <div>
                <div className="flex justify-between"><span>Previous Balance</span><span>{balTxt(prevBal)}</span></div>
                <div className="flex justify-between"><span>This Bill</span><span>{money(Number(v.total))}</span></div>
                <div className="flex justify-between font-bold"><span>Net Balance</span><span>{balTxt(closeBal)}</span></div>
              </div>
            ) : null,
            sign: (
              <div className={`${dense ? "pt-2" : "pt-4"} text-right`}>
                <div>For {s.company_name}</div>
                {s.signature ? <img src={s.signature} alt="" className={`ml-auto ${dense ? "h-8" : "h-10"}`} /> : <div className={dense ? "h-8" : "h-10"} />}
                <div>{opt.signt || "Authorised Signatory"}</div>
              </div>
            ),
            foot: s.footer_note ? <div className={`text-center italic text-gray-500 ${dense ? "text-[7px]" : "text-[10px]"}`}>{s.footer_note}</div> : null,
          };
          const leftS = SEC_ORDER.filter((k) => opt.z[k] === "left" && secs[k]);
          const rightS = SEC_ORDER.filter((k) => opt.z[k] === "right" && secs[k]);
          const twoCol = leftS.length > 0 && rightS.length > 0;
          return (
            <div className={`grid border-t ${bd} ${twoCol ? "grid-cols-2" : ""}`}>
              {leftS.length > 0 && <div className={`space-y-2 p-2 ${twoCol ? `border-r ${bd}` : ""}`}>{leftS.map((k) => <div key={k}>{secs[k]}</div>)}</div>}
              {rightS.length > 0 && <div className="space-y-2 p-2">{rightS.map((k) => <div key={k}>{secs[k]}</div>)}</div>}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
