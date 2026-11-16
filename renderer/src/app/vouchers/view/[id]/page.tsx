import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { fmtDate, fmtExpiry, money, VOUCHER_LABEL, vno } from "@/lib/format";
import TypeBadge from "@/components/TypeBadge";
import DeleteVoucherButton from "@/components/DeleteVoucherButton";
import PrintMenu from "@/components/PrintMenu";
import { CONVERTS_TO } from "@/lib/vouchers";
import { currentUser } from "@/lib/auth";

export default async function ViewVoucher({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const id = Number((await params).id);
  const { saved } = await searchParams;
  const user = await currentUser();
  const canWrite = user?.role === "admin" || user?.role === "billing";
  const canDelete = user?.role === "admin";
  const d = db();
  const v = d.prepare("SELECT v.*, a.name AS party FROM vouchers v LEFT JOIN accounts a ON a.id = v.party_id WHERE v.id = ?").get(id) as Record<string, string | number> | undefined;
  if (!v) notFound();
  const lines = d.prepare("SELECT vi.*, i.name FROM voucher_items vi JOIN items i ON i.id = vi.item_id WHERE voucher_id = ? ORDER BY vi.id").all(id) as Record<string, string | number>[];
  const les = d.prepare("SELECT l.*, a.name FROM ledger_entries l JOIN accounts a ON a.id = l.account_id WHERE voucher_id = ? ORDER BY l.debit DESC").all(id) as Record<string, string | number>[];
  const isInvoice = lines.length > 0;
  const convertTo = v.status === "open" ? CONVERTS_TO[v.type as string] : undefined;
  const src = v.source_id ? (d.prepare("SELECT id, type, number FROM vouchers WHERE id = ?").get(v.source_id) as Record<string, string | number> | undefined) : undefined;
  const bill = d.prepare("SELECT id, type, number FROM vouchers WHERE source_id = ?").get(id) as Record<string, string | number> | undefined;
  return (
    <div className="max-w-5xl">
      {saved && <div className="mb-3 rounded bg-green-50 px-3 py-2 text-sm text-green-800">Saved successfully.</div>}
      <div className="mb-3 flex items-center justify-between">
        <h1 className="h1 mb-0 flex items-center gap-2"><TypeBadge type={v.type as string} /> <span>{vno(v.type as string, v.number as number)}</span></h1>
        <div className="flex gap-2">
          {canWrite && convertTo && <Link href={`/vouchers/${convertTo}/new?from=${id}`} className="btn">Convert to {VOUCHER_LABEL[convertTo]}</Link>}
          {isInvoice && v.type !== "adjustment" && <PrintMenu id={id} />}
          {["receipt","payment","journal"].includes(v.type as string) && <a href={`/print/${id}?auto=1`} target="_blank" className="btn-sec">Print Slip</a>}
          {canWrite && <Link href={`/vouchers/edit/${id}`} className="btn-sec">Edit</Link>}
          {canWrite && <Link href={`/vouchers/${v.type}/new`} className="btn-sec">New {VOUCHER_LABEL[v.type as string]}</Link>}
          {canDelete && <DeleteVoucherButton id={id} />}
        </div>
      </div>
      {(src || bill || v.status === "converted") && (
        <div className="mb-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {src && <>Created from <Link className="underline" href={`/vouchers/view/${src.id}`}>{VOUCHER_LABEL[src.type as string]} {vno(src.type as string, src.number as number)}</Link>. </>}
          {bill && <>Converted to <Link className="underline" href={`/vouchers/view/${bill.id}`}>{VOUCHER_LABEL[bill.type as string]} {vno(bill.type as string, bill.number as number)}</Link>.</>}
        </div>
      )}
      <div className="card mb-3 grid grid-cols-4 gap-3 text-sm">
        <div><div className="label">Date</div>{fmtDate(v.date as string)}</div>
        <div><div className="label">Party</div>{v.party || (v.cash_account_id ? "Cash" : "—")}</div>
        <div><div className="label">Ref</div>{v.ref_no} {v.ref_date ? `(${fmtDate(v.ref_date as string)})` : ""}</div>
        <div><div className="label">Amount</div><span className="font-semibold">₹ {money(Number(v.total))}</span></div>
        {v.narration && <div className="col-span-4"><div className="label">Narration</div>{v.narration}</div>}
      </div>
      {isInvoice && (
        <div className="card mb-3 p-0">
          <table className="tbl">
            <thead><tr><th>Item</th><th>Batch</th><th>Exp</th><th className="num">Qty</th><th className="num">Free</th><th className="num">MRP</th><th className="num">Rate</th><th className="num">Disc%</th><th className="num">Taxable</th><th className="num">GST%</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.name}</td><td>{l.batch_no}</td><td>{fmtExpiry(l.expiry as string)}</td><td className="num">{l.qty}</td><td className="num">{l.free}</td>
                  <td className="num">{money(Number(l.mrp))}</td><td className="num">{money(Number(l.rate))}</td><td className="num">{l.disc_pct}</td>
                  <td className="num">{money(Number(l.taxable))}</td><td className="num">{l.gst_rate}</td><td className="num">{money(Number(l.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {v.type === "sale" && (
        <div className="card mb-3 flex flex-wrap items-end gap-2 text-sm">
          <a href={`/api/einvoice/${id}`} className="btn-sec">Download e-Invoice JSON</a>
          <form action={`/api/ewaybill/${id}`} method="get" className="flex flex-wrap items-end gap-2">
            <div><label className="label">Vehicle No</label><input name="vehicle" className="input w-32" /></div>
            <div><label className="label">Distance (km)</label><input name="distance" type="number" className="input w-24" /></div>
            <div><label className="label">Transporter</label><input name="transporter" className="input w-40" /></div>
            <button className="btn-sec">Download e-Way Bill JSON</button>
          </form>
        </div>
      )}
      {les.length > 0 && <h2 className="mb-1 text-sm font-semibold text-slate-600">Accounting Entries</h2>}
      <div className="card max-w-xl p-0">
        <table className="tbl">
          <thead><tr><th>Account</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
          <tbody>
            {les.map((l) => (
              <tr key={l.id}><td><Link href={`/reports/ledger?account=${l.account_id}`} className="hover:underline">{l.name}</Link></td><td className="num">{Number(l.debit) ? money(Number(l.debit)) : ""}</td><td className="num">{Number(l.credit) ? money(Number(l.credit)) : ""}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
