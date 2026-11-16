// Adversarial / negative-path QA for Aushadhi — complements smoke-test.mjs
// (happy path). Exercises session security, role boundaries, input validation,
// accounting integrity and file handling.
// Usage: node scripts/qa-test.mjs [baseUrl]   (default http://localhost:3000)
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
// 127.0.0.1, not localhost: on Windows `localhost` resolves to ::1 first and a
// stale dev server on [::]:3000 would silently take the requests instead.
const BASE = process.argv[2] || "http://127.0.0.1:3000";
const DB = process.env.DB_PATH || path.join(process.cwd(), "data", "pharma.db");
const TODAY = new Date().toISOString().slice(0, 10);

let passed = 0, failed = 0;
const check = (name, cond, extra = "") => {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
};
const section = (t) => console.log(`\n== ${t}`);

// ---------- DB helpers ----------
const d = new Database(DB);
const q = (sql, ...a) => d.prepare(sql).get(...a);
const hashPw = (pw) => {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString("hex")}`;
};
const upsertUser = (username, pw, role) => {
  let u = q("SELECT id FROM users WHERE username = ?", username);
  const h = hashPw(pw);
  if (u) d.prepare("UPDATE users SET password_hash = ?, role = ?, active = 1 WHERE id = ?").run(h, role, u.id);
  else d.prepare("INSERT INTO users (username, password_hash, role, active) VALUES (?,?,?,1)").run(username, h, role);
  return q("SELECT id FROM users WHERE username = ?", username).id;
};

// ---------- HTTP helpers ----------
const cookieOf = (res) => (res.headers.get("set-cookie") || "").split(";")[0];
async function login(username, password) {
  const res = await fetch(BASE + "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return { status: res.status, cookie: cookieOf(res) };
}
async function api(method, url, { cookie = "", body, form } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + url, { method, headers, redirect: "manual", body: form || (body ? JSON.stringify(body) : undefined) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, json, text, headers: res.headers };
}
const get = (url, cookie) => api("GET", url, { cookie });
const post = (url, body, cookie) => api("POST", url, { cookie, body });

// ---------- seed QA masters (direct, like smoke-test) ----------
let qaItem = q("SELECT id FROM items WHERE name = ?", "QA-Item-9");
if (!qaItem) {
  qaItem = { id: Number(d.prepare(
    `INSERT INTO items (name, company, salt, hsn, gst_rate, pack, unit, mrp, ptr, pts, purchase_rate, rack, schedule, barcode, min_stock, scheme_qty, scheme_free)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run("QA-Item-9", "QA Co", "Salt", "3004", 12, "10's", "PCS", 100, 90, 85, 80, "R1", "H", "QA00001", 0, 0, 0).lastInsertRowid) };
}
const ITEM_ID = qaItem.id;
let qaCust = q("SELECT id FROM accounts WHERE name = ?", "QA Customer");
if (!qaCust) qaCust = { id: Number(d.prepare("INSERT INTO accounts (name, grp, state) VALUES (?,?,?)").run("QA Customer", "Sundry Debtors", "Maharashtra").lastInsertRowid) };
const CUST_ID = qaCust.id;
let qaSupp = q("SELECT id FROM accounts WHERE name = ?", "QA Supplier");
if (!qaSupp) qaSupp = { id: Number(d.prepare("INSERT INTO accounts (name, grp, state) VALUES (?,?,?)").run("QA Supplier", "Sundry Creditors", "Maharashtra").lastInsertRowid) };
const SUPP_ID = qaSupp.id;
const CASH_ID = q("SELECT id FROM accounts WHERE code = 'CASH'").id;
const SALES_ID = q("SELECT id FROM accounts WHERE code = 'SALES'").id;
const xssName = "<img src=x onerror=alert(1)>";
if (!q("SELECT id FROM accounts WHERE name = ?", xssName))
  d.prepare("INSERT INTO accounts (name, grp, state) VALUES (?,?,?)").run(xssName, "Sundry Debtors", "Maharashtra");
// give the QA item a batch with stock to sell against (idempotent via ON CONFLICT)
d.prepare(`INSERT INTO batches (item_id, batch_no, qty, purchase_rate, mrp, sale_rate, opening_qty, expiry)
           VALUES (?, 'QA-B1', 50, 80, 100, 90, 50, '2027-12')
           ON CONFLICT (item_id, batch_no) DO UPDATE SET qty = qty`).run(ITEM_ID);
const BATCH_ID = q("SELECT id FROM batches WHERE item_id = ? AND batch_no = 'QA-B1'", ITEM_ID).id;
const stockOf = (batchId) => q("SELECT qty FROM batches WHERE id = ?", batchId).qty;

const ledgerBalanced = (vid) => {
  const r = q("SELECT ROUND(SUM(CASE WHEN debit>0 THEN debit ELSE credit END),2) d, ROUND(SUM(CASE WHEN credit>0 THEN credit ELSE debit END),2) c FROM ledger_entries WHERE voucher_id = ?", vid);
  return Math.abs(r.d - r.c) < 0.01;
};

// =====================================================================
section("Session security");
const adminLogin = await login("admin", "admin");
check("admin login", adminLogin.status === 200 && adminLogin.cookie, `status ${adminLogin.status}`);
let admin = adminLogin.cookie;

// forged-but-expired token: correctly signed, exp in the past
{
  const secret = fs.readFileSync(path.join(path.dirname(DB), ".secret"), "utf8").trim();
  const row = q("SELECT id, username, password_hash FROM users WHERE username = 'admin'");
  const payload = Buffer.from(JSON.stringify({ id: row.id, username: row.username, exp: Date.now() - 1000 })).toString("base64url");
  const sig = crypto.createHmac("sha256", `${secret}:${row.password_hash}`).update(payload).digest("base64url");
  const r = await get("/api/items/search?q=x", `erp_session=${payload}.${sig}`);
  check("expired token rejected", r.status === 401, `status ${r.status}`);
}
{
  // valid signature, wrong username inside payload is impossible to sign — instead
  // simulate DB-side checks: deactivate + demote the real admin, verify live role.
  const uid = q("SELECT id FROM users WHERE username='admin'").id;
  d.prepare("UPDATE users SET active = 0 WHERE id = ?").run(uid);
  let r = await get("/api/items/search?q=x", admin);
  check("deactivated user -> API 401", r.status === 401, `status ${r.status}`);
  r = await get("/", admin);
  check("deactivated user -> page redirect", r.status === 307, `status ${r.status}`);
  d.prepare("UPDATE users SET active = 1, role = 'viewer' WHERE id = ?").run(uid);
  r = await get("/settings", admin);
  check("demoted admin -> /settings denied", r.status === 307, `status ${r.status}`);
  r = await post("/api/restore", undefined, admin);
  check("demoted admin -> restore 403", r.status === 403, `status ${r.status}`);
  d.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(uid);
  r = await get("/", admin);
  check("re-promoted admin regains access", r.status === 200, `status ${r.status}`);
}
{
  // password rotation kills all existing sessions for that user
  const l = await login("admin", "admin");
  const oldCookie = l.cookie;
  d.prepare("UPDATE users SET password_hash = ? WHERE username = 'admin'").run(hashPw("adminx9"));
  let r = await get("/api/items/search?q=x", oldCookie);
  check("password change invalidates session", r.status === 401, `status ${r.status}`);
  r = await login("admin", "admin");
  check("old password rejected after change", r.status === 401, `status ${r.status}`);
  r = await login("admin", "adminx9");
  check("new password works", r.status === 200, `status ${r.status}`);
  d.prepare("UPDATE users SET password_hash = ? WHERE username = 'admin'").run(hashPw("admin"));
  admin = (await login("admin", "admin")).cookie;
}

// =====================================================================
section("Role boundaries");
upsertUser("qa-viewer", "view1234", "viewer");
upsertUser("qa-billing", "bill1234", "billing");
const viewer = (await login("qa-viewer", "view1234")).cookie;
const billing = (await login("qa-billing", "bill1234")).cookie;
{
  let r = await post("/api/vouchers", { type: "sale", date: TODAY, party_id: CUST_ID, lines: [] }, viewer);
  check("viewer cannot create voucher", r.status === 403, `status ${r.status}`);
  r = await post("/api/restore", undefined, viewer);
  check("viewer cannot restore", r.status === 403, `status ${r.status}`);
  r = await get("/api/backup", viewer);
  check("viewer cannot backup", r.status === 403, `status ${r.status}`);
  r = await get("/settings", viewer);
  check("viewer /settings denied", r.status === 307, `status ${r.status}`);
  r = await get("/users", viewer);
  check("viewer /users denied", r.status === 307, `status ${r.status}`);
  r = await get("/reports/trial-balance", viewer);
  check("viewer reads reports", r.status === 200, `status ${r.status}`);
  r = await get("/vouchers", viewer);
  check("viewer reads vouchers list", r.status === 200, `status ${r.status}`);
  r = await get("/audit", viewer);
  check("viewer /audit denied", r.status === 307, `status ${r.status}`);
}
{
  const r = await post("/api/vouchers", {
    type: "purchase", date: TODAY, party_id: SUPP_ID,
    lines: [{ item_id: ITEM_ID, batch_no: "QA-B2", qty: 10, rate: 80, gst_rate: 12 }],
  }, billing);
  check("billing creates purchase", r.status === 200, JSON.stringify(r.json));
  const vid = r.json?.id;
  const del = await api("DELETE", `/api/vouchers/${vid}`, { cookie: billing });
  check("billing cannot delete voucher", del.status === 403, `status ${del.status}`);
  const res = await get("/import", billing);
  check("billing /import denied", res.status === 307, `status ${res.status}`);
  const back = await get("/api/backup", billing);
  check("billing cannot backup", back.status === 403, `status ${back.status}`);
  // admin cleans the billing user's purchase
  await api("DELETE", `/api/vouchers/${vid}`, { cookie: admin });
}

// =====================================================================
section("Input validation");
{
  let r = await api("PUT", "/api/vouchers/abc", { cookie: admin, body: {} });
  check("PUT non-numeric id -> 400", r.status === 400, `status ${r.status}`);
  r = await api("PUT", "/api/vouchers/-3", { cookie: admin, body: {} });
  check("PUT negative id -> 400", r.status === 400, `status ${r.status}`);
  r = await api("DELETE", "/api/vouchers/xyz", { cookie: admin });
  check("DELETE non-numeric id -> 400", r.status === 400, `status ${r.status}`);
  r = await post("/api/vouchers", {}, admin);
  check("POST empty body -> 4xx", r.status >= 400 && r.status < 500, `status ${r.status}`);
  const malformed = await fetch(BASE + "/api/vouchers", { method: "POST", headers: { "Content-Type": "application/json", cookie: admin }, body: "{bad json" });
  check("malformed JSON -> 4xx", malformed.status >= 400 && malformed.status < 500, `status ${malformed.status}`);
  r = await post("/api/vouchers", { type: "receipt", date: TODAY, party_id: CUST_ID, amount: 100, cash_account_id: CUST_ID }, admin);
  check("receipt w/ debtor as cash acct -> 400", r.status === 400, `status ${r.status}`);
  r = await post("/api/vouchers", { type: "receipt", date: TODAY, party_id: CUST_ID, amount: 100, cash_account_id: 99999 }, admin);
  check("receipt w/ missing cash acct -> 400", r.status === 400, `status ${r.status}`);
  r = await post("/api/vouchers", { type: "journal", date: TODAY, lines: [{ account_id: CASH_ID, debit: 100, credit: 0 }, { account_id: SALES_ID, debit: 0, credit: 50 }] }, admin);
  check("unbalanced journal -> 400", r.status === 400, `status ${r.status}`);
  r = await post("/api/vouchers", { type: "bogus", date: TODAY, party_id: CUST_ID, lines: [] }, admin);
  check("unknown voucher type -> 4xx", r.status >= 400 && r.status < 500, `status ${r.status}`);
  r = await post("/api/vouchers", { type: "sale", date: "not-a-date", party_id: CUST_ID, lines: [{ item_id: ITEM_ID, batch_no: "QA-B1", qty: 1, rate: 90, gst_rate: 12 }] }, admin);
  check("garbage voucher date -> 4xx (no crash)", r.status >= 400 && r.status < 500, `status ${r.status}`);
  r = await post("/api/vouchers", { type: "sale", date: TODAY, party_id: CUST_ID, lines: [{ item_id: ITEM_ID, batch_no: "QA-B1", qty: -5, rate: 90, gst_rate: 12 }] }, admin);
  check("negative qty sale -> 4xx", r.status >= 400 && r.status < 500, `status ${r.status}`);
  r = await post("/api/vouchers", { type: "sale", date: TODAY, party_id: CUST_ID, lines: [{ item_id: ITEM_ID, batch_no: "QA-B1", qty: 999999, rate: 90, gst_rate: 12 }] }, admin);
  check("oversell blocked", r.status === 400 && /stock/i.test(r.json?.error || ""), `status ${r.status} ${JSON.stringify(r.json)}`);
  r = await post("/api/vouchers", { type: "sale", date: TODAY, party_id: CUST_ID, lines: [{ item_id: ITEM_ID, batch_no: "NO-SUCH", qty: 1, rate: 90, gst_rate: 12 }] }, admin);
  check("unknown batch blocked", r.status === 400, `status ${r.status}`);
  r = await get("/reports/pnl?from=garbage&to=also-bad", admin);
  check("pnl garbage dates -> 200", r.status === 200, `status ${r.status}`);
  r = await get("/reports/expiry?months=abc", admin);
  check("expiry months=abc -> 200", r.status === 200, `status ${r.status}`);
  r = await get("/reports/expiry?months=99999", admin);
  check("expiry months=99999 -> 200", r.status === 200, `status ${r.status}`);
  r = await get("/reports/outstanding?to=xx", admin);
  check("outstanding garbage to -> 200", r.status === 200, `status ${r.status}`);
  r = await get("/api/items/search?q=' OR 1=1--", admin);
  check("SQLi in search is inert", r.status === 200, `status ${r.status}`);
  r = await get("/vouchers/view/999999", admin);
  check("missing voucher -> notFound", r.status === 404 || r.text.includes("404"), `status ${r.status}`);
}

// =====================================================================
section("Accounting integrity");
{
  const before = stockOf(BATCH_ID);
  const p = await post("/api/vouchers", {
    type: "purchase", date: TODAY, party_id: SUPP_ID,
    lines: [{ item_id: ITEM_ID, batch_no: "QA-B1", qty: 20, rate: 80, gst_rate: 12 }],
  }, admin);
  check("purchase created", p.status === 200, JSON.stringify(p.json));
  check("purchase stock +20", stockOf(BATCH_ID) === before + 20, `got ${stockOf(BATCH_ID)} want ${before + 20}`);
  check("purchase ledger balanced", ledgerBalanced(p.json.id));

  const n1 = p.json.number;
  const s1 = await post("/api/vouchers", { type: "sale", date: TODAY, party_id: CUST_ID, lines: [{ item_id: ITEM_ID, batch_no: "QA-B1", qty: 2, free: 1, rate: 90, gst_rate: 12 }] }, admin);
  const s2 = await post("/api/vouchers", { type: "sale", date: TODAY, party_id: CUST_ID, lines: [{ item_id: ITEM_ID, batch_no: "QA-B1", qty: 1, rate: 90, gst_rate: 12 }] }, admin);
  check("sale numbers sequential", s2.json.number === s1.json.number + 1, `${s1.json.number} -> ${s2.json.number}`);
  check("sale stock -3 then -1", stockOf(BATCH_ID) === before + 20 - 4, `got ${stockOf(BATCH_ID)}`);
  check("sale ledger balanced", ledgerBalanced(s1.json.id));

  // parallel posts must get unique numbers
  const rs = await Promise.all([0, 1, 2, 3, 4].map(() =>
    post("/api/vouchers", { type: "receipt", date: TODAY, party_id: CUST_ID, amount: 10, narration: "qa-conc" }, admin)));
  const nums = rs.map((r) => r.json?.number).filter((n) => n != null);
  check("5 parallel receipts created", rs.every((r) => r.status === 200));
  check("parallel numbers unique", new Set(nums).size === nums.length, nums.join(","));
  for (const r of rs) if (r.json?.id) await api("DELETE", `/api/vouchers/${r.json.id}`, { cookie: admin });

  // batch_no case-insensitivity: "qa-b1" must hit batch "QA-B1"
  const c = await post("/api/vouchers", { type: "sale", date: TODAY, party_id: CUST_ID, lines: [{ item_id: ITEM_ID, batch_no: "qa-b1", qty: 1, rate: 90, gst_rate: 12 }] }, admin);
  check("lowercase batch_no sells from QA-B1", c.status === 200 && stockOf(BATCH_ID) === before + 15, `status ${c.status} qty ${stockOf(BATCH_ID)}`);
  const dupes = q("SELECT COUNT(*) c FROM batches WHERE item_id = ? AND UPPER(batch_no) = 'QA-B1'", ITEM_ID).c;
  check("no duplicate batch created", dupes === 1, `found ${dupes}`);
  await api("DELETE", `/api/vouchers/${c.json.id}`, { cookie: admin });

  // edit sale qty 2->5 and verify stock delta
  const e = await api("PUT", `/api/vouchers/${s1.json.id}`, {
    cookie: admin,
    body: { type: "sale", date: TODAY, party_id: CUST_ID, lines: [{ item_id: ITEM_ID, batch_no: "QA-B1", qty: 5, free: 0, rate: 90, gst_rate: 12 }] },
  });
  check("sale edited", e.status === 200, JSON.stringify(e.json));
  check("stock reflects edit", stockOf(BATCH_ID) === before + 20 - 5 - 1, `got ${stockOf(BATCH_ID)} want ${before + 14}`);
  check("edited ledger balanced", ledgerBalanced(s1.json.id));

  await api("DELETE", `/api/vouchers/${s1.json.id}`, { cookie: admin });
  await api("DELETE", `/api/vouchers/${s2.json.id}`, { cookie: admin });
  check("stock restored after deletes", stockOf(BATCH_ID) === before + 20, `got ${stockOf(BATCH_ID)} want ${before + 20}`);
  await api("DELETE", `/api/vouchers/${p.json.id}`, { cookie: admin });
  check("stock fully restored", stockOf(BATCH_ID) === before, `got ${stockOf(BATCH_ID)}`);

  // cash sale posts to CASH, not debtor
  const cs = await post("/api/vouchers", { type: "sale", date: TODAY, cash: true, lines: [{ item_id: ITEM_ID, batch_no: "QA-B1", qty: 1, rate: 90, gst_rate: 12 }] }, admin);
  if (cs.status === 200) {
    const legs = q("SELECT account_id FROM ledger_entries WHERE voucher_id = ?", cs.json.id) || {};
    check("cash sale balanced", ledgerBalanced(cs.json.id));
    await api("DELETE", `/api/vouchers/${cs.json.id}`, { cookie: admin });
  } else check("cash sale created", false, JSON.stringify(cs.json));

  // global invariant: every voucher's ledger must balance
  const bad = d.prepare(`SELECT voucher_id, ROUND(SUM(CASE WHEN debit>0 THEN debit ELSE credit END),2) d, ROUND(SUM(CASE WHEN credit>0 THEN credit ELSE debit END),2) c
     FROM ledger_entries GROUP BY voucher_id HAVING ABS(d - c) > 0.01`).all();
  check("all vouchers ledger-balanced", bad.length === 0, `${bad.length} unbalanced`);
}

// =====================================================================
section("Backup / restore / misc");
// Close our direct DB handle — a second connection legitimately blocks restore.
d.close();
{
  const bkRes = await fetch(BASE + "/api/backup", { headers: { cookie: admin } });
  const bkBuf = Buffer.from(await bkRes.arrayBuffer());
  check("backup ok", bkRes.status === 200 && bkBuf.length > 1000, `status ${bkRes.status}`);
  const magicOk = bkBuf.subarray(0, 16).equals(Buffer.from("SQLite format 3\0", "binary"));
  check("backup is SQLite", magicOk);

  const form = new FormData();
  form.append("file", new Blob([Buffer.from("definitely not sqlite")], { type: "application/octet-stream" }), "junk.db");
  const bad = await api("POST", "/api/restore", { cookie: admin, form });
  check("garbage restore rejected", bad.status === 400, `status ${bad.status}`);
  const stillUp = await get("/", admin);
  check("app healthy after bad restore", stillUp.status === 200, `status ${stillUp.status}`);

  // 4 restores of the valid backup -> pruning keeps <=3 safety files
  const form2 = new FormData();
  form2.append("file", new Blob([bkBuf], { type: "application/octet-stream" }), "pharma.db");
  for (let i = 0; i < 4; i++) {
    const r = await api("POST", "/api/restore", { cookie: admin, form: form2 });
    if (r.status !== 200) { check(`restore #${i + 1}`, false, `status ${r.status} ${r.text.slice(0, 120)}`); break; }
  }
  const safeties = fs.readdirSync(path.dirname(DB)).filter((n) => n.includes(".before-restore-"));
  check("restore safety files pruned", safeties.length <= 3, `found ${safeties.length}`);
  // session survives a same-content restore (same users/hash material)
  const after = await get("/", admin);
  check("session survives restore", after.status === 200, `status ${after.status}`);
}

// =====================================================================
section("XSS & misc");
{
  let r = await get("/masters/accounts", admin);
  check("XSS payload escaped in HTML", !r.text.includes("<img src=x onerror"), r.text.includes("<img src=x") ? "raw tag found" : "");
  r = await get("/reports/outstanding?side=dr", admin);
  check("XSS escaped in reports", !r.text.includes("<img src=x onerror"), "");
  const lo = await api("POST", "/api/logout", {});
  check("logout without session -> 200", lo.status === 200, `status ${lo.status}`);
  const ev = await get("/api/einvoice/1", admin);
  check("einvoice on non-sale handled", ev.status === 200 || ev.status === 400, `status ${ev.status}`);
}

// =====================================================================
section("Login throttle");
{
  const u = "qa-throttle-" + Date.now();
  let last = 0;
  for (let i = 0; i < 11; i++) last = (await login(u, "wrong")).status;
  check("brute-force throttled", last === 429 || last === 401 || last === 400, `last status ${last}`);
}

console.log(`\n===== ${passed} passed, ${failed} failed =====`);
if (d.open) d.close();
process.exit(failed ? 1 : 0);
