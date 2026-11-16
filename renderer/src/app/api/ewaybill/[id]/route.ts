import { NextRequest, NextResponse } from "next/server";
import { eWayBillJson } from "@/lib/gstJson";
import { guardApi } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const g = await guardApi("viewer");
    if (g.res) return g.res;
    const id = Number((await params).id);
    const q = req.nextUrl.searchParams;
    const json = eWayBillJson(id, { vehicle: q.get("vehicle") || "", distance: Number(q.get("distance") || 0), transporter: q.get("transporter") || "" });
    return new Response(JSON.stringify(json, null, 2), {
      headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="ewaybill-${json.billLists[0].docNo}.json"` },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
