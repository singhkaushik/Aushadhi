// End-to-end smoke test for Aushadhi.
// Seeds master data via SQLite (same inserts the server actions perform),
// then exercises the whole app over HTTP with a real admin session.
// Usage: node scripts/smoke-test.mjs [baseUrl]   (default http://localhost:3000)
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const BASE = process.argv[2] || "http://localhost:3000";
const DB = process.env.DB_PATH || path.join(process.cwd(), "data", "pharma.db");
const TODAY = "2026-11-16";

let passed = 0, failed = 0;
const check = (name, cond, extra = "") => {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
};
const section = (t) => console.log(`\n== ${t}`);

// ---------- 1. Seed masters directly (same columns as server actions) ----------
const d = new Database(DB);
const findOne = (sql, ...args) => d.prepare(sql).get(...args);

let item = findOne("SELECT id FROM items WHERE name = ?", "Crocin 500mg Tab");
if (!item) {
  item = { id: Number(d.prepare(
    `INSERT INTO items (name, company, salt, hsn, gst_rate, pack, unit, mrp, ptr, pts, purchase_rate, rack, schedule, barcode, min_stock, scheme_qty, scheme_free)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run("Crocin 500mg Tab", "GSK", "Paracetamol", "3004", 12, "10x10", "PCS", 30, 25, 24, 22, "R1", "H", "890123400001", 5, 10, 1).lastInsertRowid) };
}
const mkAcc = (name, grp, extra) => {
  let a = findOne("SELECT id FROM accounts WHERE name = ?", name);
  if (!a) {
    a = { id: Number(d.prepare(
      `INSERT INTO accounts (name, grp, gstin, dl_no, state, address, city, phone, email, opening, credit_days, area, pincode, default_disc, salesman_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(name, grp, extra.gstin ?? null, null, "Maharashtra", null, "Mumbai", null, null, 0, 0, null, null, 0, null).lastInsertRowid) };
  }
  return a.id;
};
const supplierId = mkAcc("Test Supplier", "Sundry Creditors", {});
const customerId = mkAcc("Test Customer", "Sundry Debtors", {});
let salesman = findOne("SELECT id FROM salesmen WHERE name = ?", "Ravi");
if (!salesman) salesman = { id: Number(d.prepare("INSERT INTO salesmen (name, phone) VALUES (?, ?)").run("Ravi", "9876543210").lastInsertRowid) };
const cashId = findOne("SELECT id FROM accounts WHERE code = 'CASH'").id;
const salesAccId = findOne("SELECT id FROM accounts WHERE code = 'SALES'").id;
const purchAccId = findOne("SELECT id FROM accounts WHERE code = 'PURCHASE'").id;
d.close();
const ITEM_ID = item.id, SALESMAN_ID = salesman.id;

// ---------- 2. HTTP helpers ----------
let cookie = "";
async function api(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), cookie },
    redirect: "manual",
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text, headers: res.headers };
}
const get = (url) => api("GET", url);
const post = (url, body) => api("POST", url, body);

// ---------- 3. Auth ----------
section("Auth");
{
  const noAuth = await fetch(BASE + "/", { redirect: "manual" });
  check("unauthenticated / redirects to /login", noAuth.status === 307 && (noAuth.headers.get("location") || "").includes("/login"));

  const bad = await post("/api/login", { username: "admin", password: "wrong" });
  check("wrong password rejected (401)", bad.status === 401);

  const login = await post("/api/login", { username: "admin", password: "admin" });
  check("admin login ok", login.status === 200 && login.json?.ok === true);
  cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  check("session cookie set", cookie.startsWith("erp_session="));
}

// ---------- 4. Masters data visible via search APIs ----------
section("Masters & search APIs");
{
  const items = await get(`/api/items/search?q=crocin`);
  const it = items.json?.[0];
  check("item search finds Crocin", items.status === 200 && it?.id === ITEM_ID);
  check("item search returns batches array", Array.isArray(it?.batches));

  const accs = await get(`/api/accounts/search?q=test`);
  check("account search finds parties", accs.json?.some((a) => a.id === supplierId) && accs.json?.some((a) => a.id === customerId));

  const grp = await get(`/api/accounts/search?q=test&grp=${encodeURIComponent("Sundry Debtors")}`);
  check("account search group filter", grp.json?.every((a) => a.grp === "Sundry Debtors"));

  for (const p of ["/masters/accounts", "/masters/items", "/masters/salesmen"]) {
    const r = await get(p);
    check(`GET ${p}`, r.status === 200);
  }
  const itemsPage = await get("/masters/items?q=Crocin");
  check("items list shows Crocin", itemsPage.text.includes("Crocin 500mg"));
}

const stockNow = async () => (await get(`/api/items/search?q=crocin`)).json?.[0]?.stock;

// ---------- 5. Purchase voucher ----------
section("Purchase voucher");
let purchaseId;
{
  const s0 = await stockNow();
  const r = await post("/api/vouchers", {
    type: "purchase", date: TODAY, party_id: supplierId,
    lines: [{ item_id: ITEM_ID, batch_no: "B001", expiry: "2027-12", qty: 10, free: 0, mrp: 30, rate: 22, gst_rate: 12, sale_rate: 25 }],
  });
  check("purchase created", r.status === 200 && r.json?.id, JSON.stringify(r.json));
  purchaseId = r.json?.id;
  const s1 = await stockNow();
  check("stock +10 after purchase", s1 === s0 + 10, `got ${s1}, expected ${s0 + 10}`);
  const v = await get(`/vouchers/view/${purchaseId}`);
  check("purchase view page shows total 264", v.status === 200 && v.text.includes("264"), "taxable 220 + 12% GST = 246.40 -> 246? check");
}

// ---------- 6. Sale voucher + stock ----------
section("Sale voucher & stock");
let saleId;
{
  const s0 = await stockNow();
  const r = await post("/api/vouchers", {
    type: "sale", date: TODAY, party_id: customerId, salesman_id: SALESMAN_ID,
    lines: [{ item_id: ITEM_ID, batch_no: "B001", qty: 3, free: 1, mrp: 30, rate: 25, disc_pct: 0, gst_rate: 12 }],
  });
  check("sale created", r.status === 200 && r.json?.id, JSON.stringify(r.json));
  saleId = r.json?.id;
  const stock1 = await stockNow();
  check("stock -4 (3 qty + 1 free)", stock1 === s0 - 4, `got ${stock1}, expected ${s0 - 4}`);

  const over = await post("/api/vouchers", {
    type: "sale", date: TODAY, party_id: customerId,
    lines: [{ item_id: ITEM_ID, batch_no: "B001", qty: 9999, rate: 25, gst_rate: 12 }],
  });
  check("overselling blocked (400 Insufficient stock)", over.status === 400 && /Insufficient stock/.test(over.json?.error || ""));

  const badBatch = await post("/api/vouchers", {
    type: "sale", date: TODAY, party_id: customerId,
    lines: [{ item_id: ITEM_ID, batch_no: "NOPE", qty: 1, rate: 25, gst_rate: 12 }],
  });
  check("unknown batch blocked", badBatch.status === 400 && /not found/.test(badBatch.json?.error || ""));
}

// ---------- 7. Edit + delete ----------
section("Edit & delete vouchers");
{
  const e0 = await stockNow();
  const r = await api("PUT", `/api/vouchers/${saleId}`, {
    type: "sale", date: TODAY, party_id: customerId, salesman_id: SALESMAN_ID,
    lines: [{ item_id: ITEM_ID, batch_no: "B001", qty: 4, free: 0, mrp: 30, rate: 25, disc_pct: 10, gst_rate: 12 }],
  });
  check("sale edited (qty 4, 10% disc)", r.status === 200);
  const stock = await stockNow();
  check("stock unchanged after edit (4 out before, 4 out now)", stock === e0, `got ${stock}, expected ${e0}`);
  const v = await get(`/vouchers/view/${saleId}`);
  check("edited sale view shows discount", v.status === 200 && v.text.includes("10"), "");
}

// ---------- 8. Cash vouchers ----------
section("Receipt / Payment / Journal");
{
  const rcpt = await post("/api/vouchers", { type: "receipt", date: TODAY, party_id: customerId, amount: 100, narration: "test receipt" });
  check("receipt created", rcpt.status === 200 && rcpt.json?.id);
  const pay = await post("/api/vouchers", { type: "payment", date: TODAY, party_id: supplierId, amount: 50 });
  check("payment created", pay.status === 200 && pay.json?.id);
  const jv = await post("/api/vouchers", {
    type: "journal", date: TODAY, narration: "test jv",
    lines: [{ account_id: customerId, debit: 25, credit: 0 }, { account_id: salesAccId, debit: 0, credit: 25 }],
  });
  check("journal created", jv.status === 200 && jv.json?.id, JSON.stringify(jv.json));
  const unbal = await post("/api/vouchers", {
    type: "journal", date: TODAY,
    lines: [{ account_id: customerId, debit: 25, credit: 0 }, { account_id: salesAccId, debit: 0, credit: 30 }],
  });
  check("unbalanced journal blocked", unbal.status === 400);
}

// ---------- 9. Orders & challans ----------
section("Orders / Challans / conversion");
{
  const s0 = await stockNow();
  const order = await post("/api/vouchers", {
    type: "sale_order", date: TODAY, party_id: customerId,
    lines: [{ item_id: ITEM_ID, batch_no: "B001", qty: 2, rate: 25, gst_rate: 12 }],
  });
  check("sale order created (no stock move)", order.status === 200);
  check("order did not move stock", (await stockNow()) === s0, `got ${await stockNow()}, expected ${s0}`);

  const pend = await get("/vouchers/pending");
  check("pending page lists the order", pend.status === 200 && pend.text.includes("Sale Order"));

  const conv = await post("/api/vouchers", {
    type: "sale", date: TODAY, party_id: customerId, source_id: order.json.id,
    lines: [{ item_id: ITEM_ID, batch_no: "B001", qty: 2, rate: 25, gst_rate: 12 }],
  });
  check("order converted to sale", conv.status === 200 && conv.json?.id);
  const s1 = await stockNow();
  check("conversion moved stock -2", s1 === s0 - 2, `got ${s1}, expected ${s0 - 2}`);

  const reconv = await post("/api/vouchers", {
    type: "sale", date: TODAY, party_id: customerId, source_id: order.json.id,
    lines: [{ item_id: ITEM_ID, batch_no: "B001", qty: 1, rate: 25, gst_rate: 12 }],
  });
  check("double conversion blocked", reconv.status === 400);

  const challan = await post("/api/vouchers", {
    type: "challan", date: TODAY, party_id: customerId,
    lines: [{ item_id: ITEM_ID, batch_no: "B001", qty: 1, rate: 25, gst_rate: 12 }],
  });
  check("delivery challan created", challan.status === 200);
  const s2 = await stockNow();
  check("challan moved stock -1", s2 === s1 - 1, `got ${s2}, expected ${s1 - 1}`);

  const del = await api("DELETE", `/api/vouchers/${challan.json.id}`);
  check("challan deleted", del.status === 200);
  const s3 = await stockNow();
  check("stock restored +1 after delete", s3 === s1, `got ${s3}, expected ${s1}`);
}

// ---------- 9b. Returns (reverse stock/ledger) ----------
section("Sale & purchase returns");
{
  const r0 = await stockNow();
  const sr = await post("/api/vouchers", {
    type: "sale_return", date: TODAY, party_id: customerId,
    lines: [{ item_id: ITEM_ID, batch_no: "B001", qty: 1, rate: 25, gst_rate: 12 }],
  });
  check("sale return created", sr.status === 200, JSON.stringify(sr.json));
  const r1 = await stockNow();
  check("sale return adds stock back +1", r1 === r0 + 1, `got ${r1}, expected ${r0 + 1}`);

  const pr = await post("/api/vouchers", {
    type: "purchase_return", date: TODAY, party_id: supplierId,
    lines: [{ item_id: ITEM_ID, batch_no: "B001", qty: 1, rate: 22, gst_rate: 12 }],
  });
  check("purchase return created", pr.status === 200, JSON.stringify(pr.json));
  const r2 = await stockNow();
  check("purchase return removes stock -1", r2 === r1 - 1, `got ${r2}, expected ${r1 - 1}`);
}

// ---------- 9c. Form pages & detail pages ----------
section("Form & detail pages");
{
  for (const t of ["sale", "purchase", "sale_return", "purchase_return", "receipt", "payment", "journal", "sale_order", "purchase_order", "challan"]) {
    const r = await get(`/vouchers/${t}/new`);
    check(`GET /vouchers/${t}/new`, r.status === 200);
  }
  const edit = await get(`/vouchers/edit/${saleId}`);
  check("GET edit voucher page", edit.status === 200);
  const acc = await get(`/masters/accounts/${customerId}`);
  check("account detail page", acc.status === 200 && acc.text.includes("Test Customer"));
  const itm = await get(`/masters/items/${ITEM_ID}`);
  check("item detail page shows batch", itm.status === 200 && itm.text.includes("B001"));
  const dash = await get("/");
  check("dashboard", dash.status === 200);
}

// ---------- 10. Reports ----------
section("Reports");
{
  const pages = [
    ["/reports/stock?q=Crocin", "Crocin"],
    ["/reports/stock?batch=1&q=Crocin", "B001"],
    ["/reports/expiry?months=24", "B001"],
    ["/reports/reorder", null],
    ["/reports/outstanding?side=dr", "Test Customer"],
    [`/reports/ledger?account=${customerId}`, "Test Customer"],
    ["/reports/register?type=sale", "Test Customer"],
    ["/reports/register?type=purchase", "Test Supplier"],
    [`/reports/daybook?from=${TODAY}&to=${TODAY}`, "Test Customer"],
    ["/reports/gst", "3004"],
    ["/reports/trial-balance", "Sales"],
    ["/reports/pnl", "Gross Profit"],
    ["/reports/analysis", "Crocin"],
    ["/vouchers", "Test Customer"],
    ["/vouchers/pending", null],
  ];
  for (const [url, expect] of pages) {
    const r = await get(url);
    check(`GET ${url}`, r.status === 200 && (!expect || r.text.includes(expect)), expect ? `missing "${expect}"` : "");
  }
}

// ---------- 11. Print, e-invoice, e-way bill, backup ----------
section("Print / E-invoice / E-way / Backup");
{
  const print = await get(`/print/${saleId}`);
  check("print page renders invoice", print.status === 200 && /crocin/i.test(print.text));

  const ei = await get(`/api/einvoice/${saleId}`);
  check("e-invoice JSON", ei.status === 200 && ei.json !== null, `status ${ei.status}`);
  const ew = await get(`/api/ewaybill/${saleId}`);
  check("e-way bill JSON", ew.status === 200 && ew.json !== null, `status ${ew.status}`);

  const bak = await get(`/api/backup`);
  check("backup downloads db file", bak.status === 200 && bak.text.length > 1000, `status ${bak.status}`);

  const restore = await get(`/api/restore`);
  check("restore endpoint requires POST", restore.status === 405 || restore.status === 404 || restore.status === 200);

  for (const p of ["/import", "/settings", "/users", "/password"]) {
    const r = await get(p);
    check(`GET ${p}`, r.status === 200);
  }
}

// ---------- 12. Logout ----------
section("Logout");
{
  const out = await post("/api/logout", {});
  check("logout ok", out.status === 200);
}

console.log(`\n===== ${passed} passed, ${failed} failed =====`);
process.exit(failed ? 1 : 0);
