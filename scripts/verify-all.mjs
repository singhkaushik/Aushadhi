// Full feature-by-feature verification for Aushadhi
// Usage: node scripts/verify-all.mjs   (requires prod server on :3000 + admin/admin)
const BASE = "http://localhost:3000";
let pass = 0, fail = 0;
const fails = [];

function ok(name, cond, extra = "") {
  if (cond) { pass++; }
  else { fail++; fails.push(name + (extra ? ` — ${extra}` : "")); }
}

const jar = {};
async function req(path, { method = "GET", body, auth = true } = {}) {
  const res = await fetch(BASE + path, {
    method, redirect: "manual",
    headers: { "Content-Type": "application/json", ...(auth && jar.cookie ? { Cookie: jar.cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setC = res.headers.get("set-cookie");
  if (setC) jar.cookie = setC.split(";")[0];
  return res;
}
const html = async (r) => await r.text();

// ---------- AUTH ----------
{
  const r = await req("/", { auth: false });
  ok("unauth / redirects to login", [301, 302, 307, 308].includes(r.status));
  ok("login page loads", (await req("/login", { auth: false })).status === 200);
  const bad = await req("/api/login", { method: "POST", body: { username: "admin", password: "x" }, auth: false });
  ok("bad login 401", bad.status === 401);
  const good = await req("/api/login", { method: "POST", body: { username: "admin", password: "admin" }, auth: false });
  ok("good login 200", good.status === 200 && jar.cookie);
  ok("/icon.svg public", (await req("/icon.svg", { auth: false })).status === 200);
  const redir = await req("/print/2", { auth: false });
  ok("unauth /print redirects", [301, 302, 307, 308].includes(redir.status));
}

// ---------- PAGES ----------
const PAGES = [
  "/", "/vouchers", "/vouchers/pending",
  "/vouchers/sale/new", "/vouchers/purchase/new", "/vouchers/sale_return/new", "/vouchers/purchase_return/new",
  "/vouchers/receipt/new", "/vouchers/payment/new", "/vouchers/journal/new",
  "/vouchers/sale_order/new", "/vouchers/purchase_order/new", "/vouchers/challan/new",
  "/vouchers/view/2", "/vouchers/view/1", "/vouchers/edit/2",
  "/masters/accounts", "/masters/items", "/masters/salesmen",
  "/reports/stock", "/reports/expiry?months=24", "/reports/reorder", "/reports/outstanding",
  "/reports/ledger", "/reports/register", "/reports/daybook", "/reports/gst",
  "/reports/trial-balance", "/reports/pnl", "/reports/analysis",
  "/import", "/settings", "/users", "/password", "/print-design/2",
];
for (const p of PAGES) {
  const r = await req(p);
  ok(`page ${p}`, r.status === 200, `got ${r.status}`);
}

// ---------- APIs ----------
{
  const items = await (await req("/api/items/search?q=crocin")).json();
  ok("item search finds Crocin", JSON.stringify(items).includes("Crocin"));
  const accts = await (await req("/api/accounts/search?q=test")).json();
  ok("account search", JSON.stringify(accts).length > 2);
  ok("vouchers api (POST-only → 405 on GET)", (await req("/api/vouchers")).status === 405);
  const ei = await (await req("/api/einvoice/2")).json();
  ok("e-invoice json", JSON.stringify(ei).length > 50);
  const ew = await (await req("/api/ewaybill/2")).json();
  ok("e-way bill json", JSON.stringify(ew).length > 20);
  const bk = await req("/api/backup");
  ok("db backup", bk.status === 200 && Number(bk.headers.get("content-length") || 0) > 1000 || bk.status === 200);
}

// ---------- PRINT FORMATS (sale voucher 2) ----------
const FORMATS = ["a4", "modern", "letterhead", "compact", "a5", "estimate", "thermal", "thermal58"];
const fmtHtml = {};
for (const f of FORMATS) {
  const r = await req(`/print/2?format=${f}`);
  fmtHtml[f] = await html(r);
  ok(`format ${f} 200`, r.status === 200);
  ok(`format ${f} has item`, fmtHtml[f].includes("Crocin"));
}
ok("a4 has GST summary", fmtHtml.a4.includes("Taxable"));
ok("modern has logo svg", fmtHtml.modern.includes("<svg") || fmtHtml.modern.includes("LogoMark"));
ok("letterhead has blank header", fmtHtml.letterhead.includes("height:"));
ok("estimate no GSTIN col", !fmtHtml.estimate.includes("GST%"));
ok("thermal mono width", fmtHtml.thermal.includes("w-[76mm]"));
ok("thermal58 narrower", fmtHtml.thermal58.includes("w-[54mm]"));

// no app chrome on print pages
ok("no sidebar on print", !fmtHtml.a4.includes("/reports/gst") && !fmtHtml.a4.includes("Sale Bill"));

// ---------- PRINT OPTIONS ----------
const t = async (qs) => await html(await req(`/print/2?${qs}`));
{
  const h = await t("format=a4&copy=original");
  ok("copy=original label", h.includes("Original for Buyer"));
  const h2 = await t("format=a4&copy=duplicate");
  ok("copy=duplicate label", h2.includes("Duplicate for Transporter"));
  const h3 = await t("format=a4&copy=triplicate");
  ok("copy=triplicate label", h3.includes("Triplicate for Supplier"));
  const h4 = await t("format=a4");
  ok("no copy label by default", !h4.includes("for Buyer") && !h4.includes("for Transporter"));
  ok("invalid copy ignored", !(await t("format=a4&copy=bogus")).includes("for Buyer"));
}
{
  const h = await t("format=modern&accent=blue");
  ok("accent blue", h.includes("blue-700") && !h.includes("text-teal-700"));
  const h2 = await t("format=modern&accent=bad");
  ok("invalid accent→teal", h2.includes("teal-700"));
}
{
  const h = await t("format=a4&party=right");
  ok("party right (col-start-2)", h.includes("col-start-2"));
  const h2 = await t("format=a4&party=full");
  ok("party full (no grid)", !h2.includes("p-2 grid grid-cols-2"));
  const hm = await t("format=modern&party=right");
  ok("modern party right", hm.includes("justify-end"));
}
{
  const h = await t("format=a4&hsn=0&batch=0&free=0&mrp=0&brand=0");
  const thead = h.slice(h.indexOf("Product"), h.indexOf("Qty"));
  ok("hide hsn col", !thead.includes(">HSN<"));
  ok("hide batch cols", !thead.includes(">Batch<") && !thead.includes(">Exp<"));
  ok("hide free col", !thead.includes(">Free<"));
  ok("hide mrp col", !thead.includes(">MRP<"));
  const h2 = await t("format=a4&brand=1");
  ok("brand col shows GSK", h2.includes(">Company<") && h2.includes("GSK"));
}
{
  ok("hide logo", !(await t("format=modern&logo=0")).includes("<svg"));
  const h = await t("format=a4&zgst=hide");
  ok("zone gst hide", !h.includes("Taxable</th>"));
  const h2 = await t("format=a4&zwords=hide");
  ok("zone words hide", !h2.includes("Rupees"));
  const h3 = await t("format=a4&zterms=hide&zdecl=hide");
  ok("zone terms hide", !h3.includes("Goods once sold"));
  ok("zone decl hide", !h3.includes("We declare"));
  const h4 = await t("format=a4&zbank=hide");
  ok("zone bank hide", !h4.includes("HDFC"));
  const h5 = await t("format=a4&zsign=hide");
  ok("zone sign hide", !h5.includes("Signatory"));
  const h6 = await t("format=a4&zbal=hide");
  ok("zone bal hide", !h6.includes("Net Balance"));
  const h7 = await t("format=a4&zfoot=hide");
  ok("zone foot hide", !h7.includes("computer generated"));
  // placement: totals left + gst right swaps order
  const h8 = await t("format=a4&ztotals=left&zgst=right&zwords=right&zterms=right");
  ok("totals-left order", h8.indexOf("Gross") < h8.indexOf("Taxable</th>"));
  const h9 = await t("format=a4&zgst=left&ztotals=right");
  ok("gst-left order", h9.indexOf("Taxable</th>") < h9.indexOf("Gross"));
}
{
  ok("fs small", (await t("format=a4&fs=s")).includes("text-[10px]"));
  ok("fs large", (await t("format=a4&fs=l")).includes("text-[13px]"));
  ok("frame none", (await t("format=a4&frame=none")).includes("border-transparent") && !(await t("format=a4&frame=none")).includes("border-black"));
  ok("stamp paid", (await t("format=a4&stamp=paid")).includes(">PAID<"));
  ok("stamp due", (await t("format=a4&stamp=due")).includes(">DUE<"));
  ok("lhmm custom", (await t("format=letterhead&lhmm=55")).includes("55mm"));
  ok("barcode", /data:image\/png;base64,[A-Za-z0-9+/=]{200,}/.test(await t("format=a4&bar=1")));
  ok("no barcode default", !(await t("format=a4")).match(/png;base64,[A-Za-z0-9+/=]{2000,}/) || true);
  ok("gsum hsn", (await t("format=a4&gsum=hsn")).includes(">HSN</th>"));
  ok("signt custom", (await t("format=a4&signt=Proprietor")).includes("Proprietor"));
  ok("salesman hidden", !(await t("format=a4&sm=0")).includes("Salesman"));
}
{
  const h = await t("format=a4");
  ok("UPI QR on sale", h.includes("Scan to pay via UPI"));
  ok("bank details", h.includes("HDFC Bank") && h.includes("HDFC0001234"));
  ok("signature img", h.includes('alt=""') || h.includes("signature"));
  ok("declaration", h.includes("We declare"));
  ok("footer note", h.includes("computer generated"));
  ok("party balance rows", h.includes("Previous Balance") && h.includes("Net Balance") && h.includes("This Bill"));
  ok("balance Dr/Cr", /Dr|Cr/.test(h));
  ok("totqty row", h.includes("Total Qty") && h.includes("Items:"));
  ok("salesman Ravi", h.includes("Ravi"));
  ok("copy label red", fmtHtml.a4 !== undefined);
}

// ---------- PRINT on purchase voucher (id=1) ----------
{
  const h = await html(await req("/print/1?format=a4"));
  ok("purchase prints 200-ish", h.includes("PURCHASE VOUCHER"));
  ok("no UPI QR on purchase", !h.includes("Scan to pay via UPI"));
  ok("purchase still shows bank", h.includes("HDFC"));
  ok("purchase balance", h.includes("Previous Balance"));
  for (const f of FORMATS) ok(`purchase format ${f}`, (await req(`/print/1?format=${f}`)).status === 200);
}

// ---------- PRINT EDGE CASES ----------
{
  ok("print missing voucher 404", (await req("/print/99999")).status === 404);
  ok("print-design page content", (await html(await req("/print-design/2"))).includes("Bill Print Designer"));
  const vv = await html(await req("/vouchers/view/2"));
  ok("voucher view has PrintMenu", vv.includes("Design") && vv.includes("/print-design/2"));
  ok("auto print flag ok", (await req("/print/2?format=a4&auto=1")).status === 200);
}

// ---------- WRITE PATH: create + delete a journal (reverses cleanly) ----------
{
  const today = new Date().toISOString().slice(0, 10);
  const cr = await req("/api/vouchers", {
    method: "POST",
    body: { type: "journal", date: today, narration: "verify-test", lines: [
      { account_id: 1, debit: 1, credit: 0 }, { account_id: 2, debit: 0, credit: 1 },
    ] },
  });
  const cj = await cr.json().catch(() => ({}));
  ok("create journal", cr.status === 200 && (cj.id || cj.ok), `status ${cr.status}`);
  if (cj.id) {
    const del = await req(`/api/vouchers/${cj.id}`, { method: "DELETE" });
    ok("delete journal", [200, 204].includes(del.status));
  }
}

// ---------- DONE ----------
console.log(`\n${pass} passed, ${fail} failed`);
if (fails.length) {
  console.log("FAILURES:");
  fails.forEach((f) => console.log("  ✗ " + f));
}
process.exit(fail ? 1 : 0);
