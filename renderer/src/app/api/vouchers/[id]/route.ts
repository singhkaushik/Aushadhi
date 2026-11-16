import { NextRequest, NextResponse } from "next/server";
import { deleteVoucher, saveCashVoucher, saveInvoice, INVOICE_TYPES, InvoiceType } from "@/lib/vouchers";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id);
    const body = await req.json();
    const res = INVOICE_TYPES.includes(body.type as InvoiceType) ? saveInvoice(body, id) : saveCashVoucher(body, id);
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    deleteVoucher(Number((await params).id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
