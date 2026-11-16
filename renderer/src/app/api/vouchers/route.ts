import { NextRequest, NextResponse } from "next/server";
import { saveCashVoucher, saveInvoice, INVOICE_TYPES, InvoiceType } from "@/lib/vouchers";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = INVOICE_TYPES.includes(body.type as InvoiceType) ? saveInvoice(body) : saveCashVoucher(body);
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
