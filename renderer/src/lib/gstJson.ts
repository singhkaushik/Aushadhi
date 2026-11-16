import { db, getSettings } from "./db";
import { STATE_CODES, fmtExpiry, r2, vno } from "./format";

const dmy = (s: string) => {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
};
const stateCode = (state?: string | null, gstin?: string | null) => (gstin && gstin.length >= 2 ? gstin.slice(0, 2) : STATE_CODES[state || ""] || "");

function load(id: number) {
  const d = db();
  const v = d.prepare("SELECT * FROM vouchers WHERE id = ?").get(id) as Record<string, string | number> | undefined;
  if (!v) throw new Error("Voucher not found");
  if (v.type !== "sale") throw new Error("Only sale invoices are supported");
  const p = (v.party_id ? d.prepare("SELECT * FROM accounts WHERE id = ?").get(v.party_id) : {}) as Record<string, string>;
  const lines = d.prepare("SELECT vi.*, i.name, i.hsn, i.unit FROM voucher_items vi JOIN items i ON i.id = vi.item_id WHERE voucher_id = ? ORDER BY vi.id").all(id) as Record<string, string | number>[];
  return { v, p, lines, s: getSettings() };
}

/** NIC e-invoice schema (v1.1) payload for upload via the IRP / GSP offline tool. Verify on the portal before filing. */
export function eInvoiceJson(id: number) {
  const { v, p, lines, s } = load(id);
  const sellerSt = stateCode(s.state, s.gstin);
  const buyerSt = stateCode(p.state, p.gstin);
  return {
    Version: "1.1",
    TranDtls: { TaxSch: "GST", SupTyp: p.gstin ? "B2B" : "B2C", RegRev: "N", IgstOnIntra: "N" },
    DocDtls: { Typ: "INV", No: vno("sale", Number(v.number)), Dt: dmy(String(v.date)) },
    SellerDtls: { Gstin: s.gstin, LglNm: s.company_name, Addr1: (s.address || "").slice(0, 100), Loc: s.city || "", Pin: Number(s.pincode) || 0, Stcd: sellerSt, Ph: s.phone || undefined, Em: s.email || undefined },
    BuyerDtls: { Gstin: p.gstin || "URP", LglNm: p.name || "Cash Sale", Pos: buyerSt || sellerSt, Addr1: (p.address || p.city || "").slice(0, 100), Loc: p.city || "", Pin: Number(p.pincode) || 0, Stcd: buyerSt || sellerSt, Ph: p.phone || undefined },
    ItemList: lines.map((l, i) => {
      const gross = r2(Number(l.qty) * Number(l.rate));
      return {
        SlNo: String(i + 1), PrdDesc: l.name, IsServc: "N", HsnCd: l.hsn || "", Qty: Number(l.qty), FreeQty: Number(l.free), Unit: l.unit || "NOS",
        UnitPrice: Number(l.rate), TotAmt: gross, Discount: r2(gross - Number(l.taxable)), AssAmt: Number(l.taxable), GstRt: Number(l.gst_rate),
        IgstAmt: Number(l.igst), CgstAmt: Number(l.cgst), SgstAmt: Number(l.sgst), TotItemVal: Number(l.amount),
        BchDtls: { Nm: String(l.batch_no || ""), ExpDt: l.expiry ? `01/${fmtExpiry(String(l.expiry)).replace(/\/(\d{2})$/, "/20$1")}` : undefined },
      };
    }),
    ValDtls: { AssVal: Number(v.taxable), CgstVal: Number(v.cgst), SgstVal: Number(v.sgst), IgstVal: Number(v.igst), RndOffAmt: Number(v.round_off), TotInvVal: Number(v.total) },
  };
}

/** E-way bill bulk-upload JSON (offline utility format). Verify on the portal before filing. */
export function eWayBillJson(id: number, opts: { vehicle?: string; distance?: number; transporter?: string }) {
  const { v, p, lines, s } = load(id);
  const fromSt = Number(stateCode(s.state, s.gstin)) || 0;
  const toSt = Number(stateCode(p.state, p.gstin)) || 0;
  return {
    version: "1.0.0621",
    billLists: [
      {
        userGstin: s.gstin, supplyType: "O", subSupplyType: 1, docType: "INV", docNo: vno("sale", Number(v.number)), docDate: dmy(String(v.date)),
        transType: 1, fromGstin: s.gstin, fromTrdName: s.company_name, fromAddr1: s.address || "", fromAddr2: "", fromPlace: s.city || "",
        fromPincode: Number(s.pincode) || 0, fromStateCode: fromSt, actualFromStateCode: fromSt,
        toGstin: p.gstin || "URP", toTrdName: p.name || "Cash", toAddr1: p.address || "", toAddr2: "", toPlace: p.city || "",
        toPincode: Number(p.pincode) || 0, toStateCode: toSt, actualToStateCode: toSt,
        totalValue: Number(v.taxable), cgstValue: Number(v.cgst), sgstValue: Number(v.sgst), igstValue: Number(v.igst), cessValue: 0,
        TotNonAdvolVal: 0, OthValue: Number(v.round_off), totInvValue: Number(v.total),
        transMode: 1, transDistance: Math.max(0, Math.min(9999, Number(opts.distance) || 0)), transporterName: opts.transporter || "", transporterId: "",
        transDocNo: "", transDocDate: "", vehicleNo: (opts.vehicle || "").replace(/\s/g, "").toUpperCase(), vehicleType: "R",
        mainHsnCode: Number(lines[0]?.hsn) || 0,
        itemList: lines.map((l, i) => {
          const rate = Number(l.gst_rate);
          const inter = Number(l.igst) > 0;
          return {
            itemNo: i + 1, productName: l.name, productDesc: l.name, hsnCode: Number(l.hsn) || 0, quantity: Number(l.qty) + Number(l.free),
            qtyUnit: "NOS", taxableAmount: Number(l.taxable), sgstRate: inter ? 0 : rate / 2, cgstRate: inter ? 0 : rate / 2,
            igstRate: inter ? rate : 0, cessRate: 0, cessNonAdvol: 0,
          };
        }),
      },
    ],
  };
}
