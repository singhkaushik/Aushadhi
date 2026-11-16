import { notFound } from "next/navigation";
import InvoiceForm from "@/components/InvoiceForm";
import CashForm from "@/components/CashForm";
import AdjustmentForm, { AdjustmentInitial } from "@/components/AdjustmentForm";
import { db } from "@/lib/db";
import { cashAccounts, companyInfo, loadCash, loadInvoice, salesmenList } from "@/lib/voucherLoad";
import { INVOICE_TYPES, InvoiceType } from "@/lib/vouchers";

export default async function EditVoucher({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const v = db().prepare("SELECT type FROM vouchers WHERE id = ?").get(id) as { type: string } | undefined;
  if (!v) notFound();
  const t = v.type;
  if (INVOICE_TYPES.includes(t as InvoiceType))
    return <InvoiceForm type={t as InvoiceType} initial={loadInvoice(id)} company={companyInfo()} salesmen={salesmenList()} />;
  if (t === "adjustment") {
    const v2 = db().prepare("SELECT date, ref_no, narration FROM vouchers WHERE id = ?").get(id) as { date: string; ref_no: string | null; narration: string | null };
    const lines = db().prepare(`SELECT vi.item_id, i.name AS item_name, vi.batch_no, vi.expiry, vi.qty, vi.rate
      FROM voucher_items vi JOIN items i ON i.id = vi.item_id WHERE vi.voucher_id = ?`).all(id) as AdjustmentInitial["lines"];
    return <AdjustmentForm initial={{ id, date: v2.date, ref_no: v2.ref_no, narration: v2.narration, lines }} />;
  }
  if (t === "receipt" || t === "payment" || t === "journal")
    return <CashForm type={t} initial={loadCash(id)} cashAccounts={cashAccounts()} />;
  notFound();
}
