import { notFound } from "next/navigation";
import InvoiceForm from "@/components/InvoiceForm";
import CashForm from "@/components/CashForm";
import { cashAccounts, companyInfo, loadForConversion, salesmenList } from "@/lib/voucherLoad";
import { INVOICE_TYPES, InvoiceType } from "@/lib/vouchers";

export default async function NewVoucher({ params, searchParams }: { params: Promise<{ type: string }>; searchParams: Promise<{ from?: string }> }) {
  const { type } = await params;
  const { from } = await searchParams;
  if (INVOICE_TYPES.includes(type as InvoiceType)) {
    const initial = from ? loadForConversion(Number(from), type) : undefined;
    return <InvoiceForm key={`${type}-${from ?? ""}`} type={type as InvoiceType} initial={initial} company={companyInfo()} salesmen={salesmenList()} />;
  }
  if (type === "receipt" || type === "payment" || type === "journal")
    return <CashForm key={type} type={type} cashAccounts={cashAccounts()} />;
  notFound();
}
