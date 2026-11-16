export type ImportType = "parties" | "items" | "stock";

export const FIELDS: Record<ImportType, { key: string; label: string; required?: boolean; syn: string[] }[]> = {
  parties: [
    { key: "name", label: "Party Name", required: true, syn: ["name", "partyname", "ledgername", "accountname", "customername", "suppliername", "party", "particulars", "ledger"] },
    { key: "grp", label: "Group / Type", syn: ["group", "accountgroup", "under", "groupname", "type", "partytype"] },
    { key: "address", label: "Address", syn: ["address", "address1", "addr", "add1"] },
    { key: "city", label: "City / Station", syn: ["city", "station", "town", "area", "place"] },
    { key: "state", label: "State", syn: ["state", "statename"] },
    { key: "phone", label: "Phone / Mobile", syn: ["phone", "mobile", "mobileno", "phoneno", "contact", "contactno", "mob", "ph"] },
    { key: "email", label: "Email", syn: ["email", "emailid", "mail"] },
    { key: "gstin", label: "GSTIN", syn: ["gstin", "gstno", "gstnumber", "gstinno", "gstinuin"] },
    { key: "dl_no", label: "Drug Licence No", syn: ["dlno", "dl", "druglicence", "druglicense", "dlnumber", "dlno1", "dl1", "licenceno", "licno"] },
    { key: "opening", label: "Opening / Closing Balance", syn: ["opening", "openingbalance", "opbal", "openingbal", "balance", "closingbalance", "closingbal", "clbal", "bal", "amount", "outstanding"] },
    { key: "opening_side", label: "Dr / Cr", syn: ["drcr", "dr/cr", "side", "balancetype"] },
    { key: "credit_days", label: "Credit Days", syn: ["creditdays", "crdays", "days", "creditperiod"] },
  ],
  items: [
    { key: "name", label: "Product Name", required: true, syn: ["name", "productname", "itemname", "product", "item", "description", "itemdescription", "medicine"] },
    { key: "company", label: "Company / Mfr", syn: ["company", "companyname", "mfg", "mfr", "manufacturer", "mfgname", "comp", "mfgby"] },
    { key: "salt", label: "Salt / Composition", syn: ["salt", "composition", "generic", "genericname", "contents", "saltname"] },
    { key: "pack", label: "Packing", syn: ["pack", "packing", "packsize", "unitpack", "pk"] },
    { key: "unit", label: "Unit", syn: ["unit", "uom"] },
    { key: "hsn", label: "HSN", syn: ["hsn", "hsncode", "hsnsac", "hsnno"] },
    { key: "gst_rate", label: "GST %", syn: ["gst", "gstrate", "gstper", "tax", "taxrate", "igst", "igstper", "taxper", "gstpercent"] },
    { key: "mrp", label: "MRP", syn: ["mrp", "mrprate"] },
    { key: "ptr", label: "PTR / Sale Rate", syn: ["ptr", "salerate", "rate", "srate", "sellingrate", "salesrate", "rate1"] },
    { key: "pts", label: "PTS", syn: ["pts"] },
    { key: "purchase_rate", label: "Purchase Rate", syn: ["purchaserate", "prate", "costrate", "cost", "purrate", "purchaseprice", "purchase"] },
    { key: "rack", label: "Rack", syn: ["rack", "location", "shelf", "rackno"] },
    { key: "schedule", label: "Schedule", syn: ["schedule", "sch", "drugschedule"] },
    { key: "barcode", label: "Barcode", syn: ["barcode", "ean", "code"] },
    { key: "min_stock", label: "Min Stock", syn: ["minstock", "minimum", "reorder", "reorderlevel", "minqty"] },
  ],
  stock: [
    { key: "name", label: "Product Name", required: true, syn: ["name", "productname", "itemname", "product", "item", "description", "itemdescription"] },
    { key: "company", label: "Company / Mfr", syn: ["company", "companyname", "mfg", "mfr", "manufacturer", "mfgname", "comp"] },
    { key: "pack", label: "Packing", syn: ["pack", "packing", "packsize"] },
    { key: "hsn", label: "HSN", syn: ["hsn", "hsncode", "hsnsac"] },
    { key: "gst_rate", label: "GST %", syn: ["gst", "gstrate", "gstper", "tax", "taxrate", "igst"] },
    { key: "batch_no", label: "Batch No", syn: ["batch", "batchno", "batchnumber", "bno"] },
    { key: "expiry", label: "Expiry", syn: ["expiry", "exp", "expirydate", "expdate", "expiry date"] },
    { key: "qty", label: "Qty (closing stock)", required: true, syn: ["qty", "quantity", "stock", "closingstock", "clqty", "balqty", "closing", "closingqty", "currentstock", "balance"] },
    { key: "mrp", label: "MRP", syn: ["mrp"] },
    { key: "purchase_rate", label: "Purchase Rate", syn: ["purchaserate", "prate", "costrate", "cost", "purrate"] },
    { key: "sale_rate", label: "Sale Rate / PTR", syn: ["ptr", "salerate", "rate", "srate", "sellingrate"] },
  ],
};

export const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function guessMapping(type: ImportType, headers: string[]) {
  const nh = headers.map(norm);
  const map: Record<string, number> = {};
  const used = new Set<number>();
  for (const f of FIELDS[type]) {
    let idx = nh.findIndex((h, i) => !used.has(i) && f.syn.map(norm).includes(h));
    if (idx < 0) idx = nh.findIndex((h, i) => !used.has(i) && h && f.syn.some((s) => norm(s).length > 2 && h.includes(norm(s))));
    if (idx >= 0) {
      map[f.key] = idx;
      used.add(idx);
    }
  }
  return map;
}

/** Marg exports often have title lines above the real header; pick the row that matches the most known headers. */
export function detectHeaderRow(type: ImportType, rows: unknown[][]) {
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const score = Object.keys(guessMapping(type, (rows[i] || []).map((c) => String(c ?? "")))).length;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best;
}
