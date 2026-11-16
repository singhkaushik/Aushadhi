import { NextRequest, NextResponse } from "next/server";
import { saveCashVoucher, saveInvoice, saveAdjustment, INVOICE_TYPES, InvoiceType } from "@/lib/vouchers";
import { guardApi } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { VOUCHER_LABEL, vno } from "@/lib/format";
import { db } from "@/lib/db";

const CASH_TYPES = ["receipt", "payment", "journal"];

export async function POST(req: NextRequest) {
  try {
    const g = await guardApi("billing");
    if (g.res) return g.res;
    const body = await req.json();
    const res =
      body.type === "adjustment"
        ? saveAdjustment(body)
        : INVOICE_TYPES.includes(body.type as InvoiceType)
          ? saveInvoice(body)
          : CASH_TYPES.includes(body.type)
            ? saveCashVoucher(body)
            : (() => { throw new Error("Invalid voucher type"); })();
    audit(g.user!.username, "create", "voucher", res.id, `${VOUCHER_LABEL[body.type] ?? body.type} ${vno(body.type, (res as { number?: number }).number ?? (db().prepare("SELECT number AS n FROM vouchers WHERE id = ?").get(res.id) as { n: number }).n)}`);
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
