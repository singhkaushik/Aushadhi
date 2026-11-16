import { notFound } from "next/navigation";
import InvoiceForm from "@/components/InvoiceForm";
import CashForm from "@/components/CashForm";
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
  if (t === "receipt" || t === "payment" || t === "journal")
    return <CashForm type={t} initial={loadCash(id)} cashAccounts={cashAccounts()} />;
  notFound();
}
