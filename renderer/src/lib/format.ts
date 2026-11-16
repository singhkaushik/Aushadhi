export const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export const money = (n: number) =>
  (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

/** Strict YYYY-MM-DD validation (rejects impossible dates like 2025-13-45). */
export const isISODate = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

export const fmtDate = (s?: string | null) => {
  if (!s) return "";
  const [y, m, d] = s.slice(0, 10).split("-");
  return d ? `${d}-${m}-${y}` : s;
};

/** Expiry is stored as YYYY-MM; shown as MM/YY. */
export const fmtExpiry = (s?: string | null) => {
  if (!s) return "";
  const [y, m] = s.split("-");
  return m ? `${m}/${y.slice(2)}` : s;
};

export function parseExpiry(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    if (v > 20000 && v < 80000) {
      const d = new Date(Math.round((v - 25569) * 86400000));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    }
    return null;
  }
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}`;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  m = s.match(/^(?:\d{1,2}[-/.])?(\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) {
    const y = m[2].length === 2 ? `20${m[2]}` : m[2];
    const mon = Number(m[1]);
    if (mon >= 1 && mon <= 12) return `${y}-${String(mon).padStart(2, "0")}`;
  }
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  m = s.toLowerCase().match(/^([a-z]{3})[a-z]*[-/ .']*(\d{2}|\d{4})$/);
  if (m && months.includes(m[1])) {
    const y = m[2].length === 2 ? `20${m[2]}` : m[2];
    return `${y}-${String(months.indexOf(m[1]) + 1).padStart(2, "0")}`;
  }
  return null;
}

const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number) {
  return n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]} ${ones[n % 10]}`.trim();
}

function threeDigits(n: number) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ones[h]} Hundred` : "", rest ? twoDigits(rest) : ""].filter(Boolean).join(" ");
}

export function amountInWords(amount: number) {
  let n = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - n) * 100);
  if (n === 0 && paise === 0) return "Rupees Zero Only";
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  let s = `Rupees ${parts.join(" ") || "Zero"}`;
  if (paise) s += ` and ${twoDigits(paise)} Paise`;
  return `${s} Only`;
}

export const VOUCHER_LABEL: Record<string, string> = {
  sale: "Sale",
  purchase: "Purchase",
  sale_return: "Sale Return",
  purchase_return: "Purchase Return",
  receipt: "Receipt",
  payment: "Payment",
  journal: "Journal",
  sale_order: "Sale Order",
  purchase_order: "Purchase Order",
  challan: "Delivery Challan",
  adjustment: "Stock Adjustment",
};

export const VOUCHER_PREFIX: Record<string, string> = {
  sale: "S",
  purchase: "P",
  sale_return: "SR",
  purchase_return: "PR",
  receipt: "RC",
  payment: "PY",
  journal: "JV",
  sale_order: "SO",
  purchase_order: "PO",
  challan: "DC",
  adjustment: "ADJ",
};

export const STATE_CODES: Record<string, string> = {
  "Jammu and Kashmir": "01", "Himachal Pradesh": "02", Punjab: "03", Chandigarh: "04", Uttarakhand: "05", Haryana: "06",
  Delhi: "07", Rajasthan: "08", "Uttar Pradesh": "09", Bihar: "10", Sikkim: "11", "Arunachal Pradesh": "12", Nagaland: "13",
  Manipur: "14", Mizoram: "15", Tripura: "16", Meghalaya: "17", Assam: "18", "West Bengal": "19", Jharkhand: "20",
  Odisha: "21", Chhattisgarh: "22", "Madhya Pradesh": "23", Gujarat: "24", "Dadra and Nagar Haveli and Daman and Diu": "26",
  Maharashtra: "27", Karnataka: "29", Goa: "30", Lakshadweep: "31", Kerala: "32", "Tamil Nadu": "33", Puducherry: "34",
  "Andaman and Nicobar Islands": "35", Telangana: "36", "Andhra Pradesh": "37", Ladakh: "38",
};

export const vno = (type: string, n: number) => `${VOUCHER_PREFIX[type] ?? ""}-${n}`;

export const STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
  "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra",
  "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim",
  "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
];
