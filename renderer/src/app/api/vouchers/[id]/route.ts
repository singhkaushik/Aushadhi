import { NextRequest, NextResponse } from "next/server";
import { deleteVoucher, saveCashVoucher, saveInvoice, saveAdjustment, INVOICE_TYPES, InvoiceType } from "@/lib/vouchers";
import { guardApi } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { VOUCHER_LABEL, vno } from "@/lib/format";

const CASH_TYPES = ["receipt", "payment", "journal"];

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const g = await guardApi("billing");
    if (g.res) return g.res;
    const id = Number((await params).id);
    const body = await req.json();
    const res =
      body.type === "adjustment"
        ? saveAdjustment(body, id)
        : INVOICE_TYPES.includes(body.type as InvoiceType)
          ? saveInvoice(body, id)
          : CASH_TYPES.includes(body.type)
            ? saveCashVoucher(body, id)
            : (() => { throw new Error("Invalid voucher type"); })();
    audit(g.user!.username, "edit", "voucher", id, `${VOUCHER_LABEL[body.type] ?? body.type} ${vno(body.type, (res as { number?: number }).number ?? (db().prepare("SELECT number AS n FROM vouchers WHERE id = ?").get(id) as { n: number }).n)}`);
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const g = await guardApi("admin");
    if (g.res) return g.res;
    const id = Number((await params).id);
    const v = db().prepare("SELECT type, number, total FROM vouchers WHERE id = ?").get(id) as
      | { type: string; number: number; total: number }
      | undefined;
    deleteVoucher(id);
    audit(g.user!.username, "delete", "voucher", id, v ? `${VOUCHER_LABEL[v.type] ?? v.type} ${vno(v.type, v.number)} ₹${v.total}` : "");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
