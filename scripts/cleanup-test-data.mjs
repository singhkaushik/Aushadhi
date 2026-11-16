// Removes duplicate test vouchers created by repeated smoke-test runs,
// keeping the earliest purchase + sale for the test parties.
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const BASE = "http://localhost:3000";
const DB = process.env.DB_PATH || path.join(process.cwd(), "data", "pharma.db");

const d = new Database(DB);
const sup = d.prepare("SELECT id FROM accounts WHERE name = 'Test Supplier'").get()?.id;
const cus = d.prepare("SELECT id FROM accounts WHERE name = 'Test Customer'").get()?.id;
if (!sup || !cus) { console.log("no test parties found"); process.exit(0); }

const keep = new Set([
  d.prepare("SELECT id FROM vouchers WHERE type='purchase' AND party_id=? ORDER BY id LIMIT 1").get(sup)?.id,
  d.prepare("SELECT id FROM vouchers WHERE type='sale' AND party_id=? ORDER BY id LIMIT 1").get(cus)?.id,
]);
const vids = d.prepare(
  `SELECT DISTINCT v.id FROM vouchers v
   LEFT JOIN ledger_entries le ON le.voucher_id = v.id
   WHERE v.party_id IN (?,?) OR le.account_id IN (?,?)
   ORDER BY v.id DESC`,
).all(sup, cus, sup, cus).map((r) => r.id);
d.close();

const login = await fetch(`${BASE}/api/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "admin", password: "admin" }),
});
const cookie = (login.headers.get("set-cookie") || "").split(";")[0];

for (const id of vids) {
  if (keep.has(id)) { console.log(`keep voucher #${id}`); continue; }
  const r = await fetch(`${BASE}/api/vouchers/${id}`, { method: "DELETE", headers: { cookie } });
  console.log(`delete voucher #${id}: ${r.status} ${r.status === 200 ? "" : await r.text()}`);
}
console.log("done");
