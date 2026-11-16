import { NextRequest, NextResponse } from "next/server";
import { eInvoiceJson } from "@/lib/gstJson";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id);
    const json = eInvoiceJson(id);
    return new Response(JSON.stringify([json], null, 2), {
      headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="einvoice-${json.DocDtls.No}.json"` },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
