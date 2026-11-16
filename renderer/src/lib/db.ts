import Database from "better-sqlite3";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { unstable_noStore } from "next/cache";

const g = globalThis as unknown as { __db?: Database.Database };

export function dbPath() {
  return process.env.DB_PATH || path.join(process.cwd(), "data", "pharma.db");
}

export function db(): Database.Database {
  try {
    unstable_noStore();
  } catch {}
  if (!g.__db) {
    const p = dbPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const d = new Database(p);
    d.pragma("journal_mode = WAL");
    d.pragma("foreign_keys = ON");
    migrate(d);
    g.__db = d;
  }
  return g.__db;
}

export function closeDb() {
  if (g.__db) {
    g.__db.close();
    g.__db = undefined;
  }
}

export const GROUPS: Record<string, "asset" | "liability" | "income" | "expense"> = {
  "Sundry Debtors": "asset",
  "Sundry Creditors": "liability",
  "Cash-in-Hand": "asset",
  "Bank Accounts": "asset",
  "Current Assets": "asset",
  "Fixed Assets": "asset",
  "Loans & Advances (Asset)": "asset",
  "Duties & Taxes": "liability",
  "Capital Account": "liability",
  "Loans (Liability)": "liability",
  "Current Liabilities": "liability",
  "Sales Accounts": "income",
  "Direct Incomes": "income",
  "Indirect Incomes": "income",
  "Purchase Accounts": "expense",
  "Direct Expenses": "expense",
  "Indirect Expenses": "expense",
};

const SYSTEM_ACCOUNTS: [string, string, string][] = [
  ["CASH", "Cash", "Cash-in-Hand"],
  ["BANK", "Bank", "Bank Accounts"],
  ["SALES", "Sales", "Sales Accounts"],
  ["SALES_RET", "Sales Return", "Sales Accounts"],
  ["PURCHASE", "Purchase", "Purchase Accounts"],
  ["PURCH_RET", "Purchase Return", "Purchase Accounts"],
  ["OUT_CGST", "Output CGST", "Duties & Taxes"],
  ["OUT_SGST", "Output SGST", "Duties & Taxes"],
  ["OUT_IGST", "Output IGST", "Duties & Taxes"],
  ["IN_CGST", "Input CGST", "Duties & Taxes"],
  ["IN_SGST", "Input SGST", "Duties & Taxes"],
  ["IN_IGST", "Input IGST", "Duties & Taxes"],
  ["ROUND_OFF", "Round Off", "Indirect Expenses"],
  ["STOCK_WO", "Stock Write Off", "Indirect Expenses"],
  ["CAPITAL", "Capital", "Capital Account"],
];

function migrate(d: Database.Database) {
  const v = d.pragma("user_version", { simple: true }) as number;
  if (v < 1) {
    d.exec(`
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE accounts (
        id INTEGER PRIMARY KEY,
        code TEXT UNIQUE,
        name TEXT NOT NULL,
        grp TEXT NOT NULL,
        gstin TEXT, dl_no TEXT, state TEXT, address TEXT, city TEXT, phone TEXT, email TEXT,
        opening REAL NOT NULL DEFAULT 0,
        credit_days INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX accounts_name ON accounts(name COLLATE NOCASE);
      CREATE TABLE items (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        company TEXT, salt TEXT, hsn TEXT,
        gst_rate REAL NOT NULL DEFAULT 12,
        pack TEXT, unit TEXT DEFAULT 'PCS',
        mrp REAL DEFAULT 0, ptr REAL DEFAULT 0, pts REAL DEFAULT 0, purchase_rate REAL DEFAULT 0,
        rack TEXT, schedule TEXT, barcode TEXT,
        min_stock REAL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX items_name ON items(name COLLATE NOCASE);
      CREATE TABLE batches (
        id INTEGER PRIMARY KEY,
        item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        batch_no TEXT NOT NULL,
        expiry TEXT,
        mrp REAL DEFAULT 0, purchase_rate REAL DEFAULT 0, sale_rate REAL DEFAULT 0,
        opening_qty REAL NOT NULL DEFAULT 0,
        qty REAL NOT NULL DEFAULT 0,
        UNIQUE(item_id, batch_no)
      );
      CREATE TABLE vouchers (
        id INTEGER PRIMARY KEY,
        type TEXT NOT NULL,
        number INTEGER NOT NULL,
        date TEXT NOT NULL,
        party_id INTEGER REFERENCES accounts(id),
        cash_account_id INTEGER REFERENCES accounts(id),
        ref_no TEXT, ref_date TEXT, narration TEXT,
        gross REAL DEFAULT 0, discount REAL DEFAULT 0, taxable REAL DEFAULT 0,
        cgst REAL DEFAULT 0, sgst REAL DEFAULT 0, igst REAL DEFAULT 0,
        round_off REAL DEFAULT 0, total REAL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(type, number)
      );
      CREATE INDEX vouchers_date ON vouchers(date);
      CREATE TABLE voucher_items (
        id INTEGER PRIMARY KEY,
        voucher_id INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
        item_id INTEGER NOT NULL REFERENCES items(id),
        batch_id INTEGER REFERENCES batches(id),
        batch_no TEXT, expiry TEXT,
        qty REAL NOT NULL DEFAULT 0, free REAL NOT NULL DEFAULT 0,
        mrp REAL DEFAULT 0, rate REAL DEFAULT 0, disc_pct REAL DEFAULT 0,
        taxable REAL DEFAULT 0, gst_rate REAL DEFAULT 0,
        cgst REAL DEFAULT 0, sgst REAL DEFAULT 0, igst REAL DEFAULT 0,
        amount REAL DEFAULT 0
      );
      CREATE TABLE ledger_entries (
        id INTEGER PRIMARY KEY,
        voucher_id INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
        account_id INTEGER NOT NULL REFERENCES accounts(id),
        date TEXT NOT NULL,
        debit REAL NOT NULL DEFAULT 0,
        credit REAL NOT NULL DEFAULT 0
      );
      CREATE INDEX ledger_account ON ledger_entries(account_id, date);
    `);
    const ins = d.prepare("INSERT INTO accounts (code, name, grp) VALUES (?, ?, ?)");
    for (const a of SYSTEM_ACCOUNTS) ins.run(...a);
    const s = d.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
    s.run("company_name", "My Pharma Agency");
    s.run("state", "Maharashtra");
    d.pragma("user_version = 1");
  }
  if (v < 2) migrateV2(d);
  if (v < 3) {
    d.exec(`
      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY,
        user TEXT,
        action TEXT NOT NULL,
        entity TEXT NOT NULL,
        entity_id INTEGER,
        detail TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX audit_log_time ON audit_log(created_at);
    `);
    d.prepare("INSERT OR IGNORE INTO accounts (code, name, grp) VALUES ('STOCK_WO', 'Stock Write Off', 'Indirect Expenses')").run();
    d.pragma("user_version = 3");
  }
  if (v < 4) {
    d.exec(`CREATE TABLE IF NOT EXISTS voucher_seq (type TEXT NOT NULL, fy INTEGER NOT NULL, next INTEGER NOT NULL, PRIMARY KEY (type, fy))`);
    d.exec(`INSERT OR IGNORE INTO voucher_seq (type, fy, next) SELECT type, fy, MAX(number) + 1 FROM vouchers GROUP BY type, fy`);
    d.pragma("user_version = 4");
  }
  if (v < 5) {
    d.exec(`
      CREATE INDEX IF NOT EXISTS voucher_items_voucher ON voucher_items(voucher_id);
      CREATE INDEX IF NOT EXISTS voucher_items_item ON voucher_items(item_id);
      CREATE INDEX IF NOT EXISTS voucher_items_batch ON voucher_items(batch_id);
      CREATE INDEX IF NOT EXISTS ledger_voucher ON ledger_entries(voucher_id);
    `);
    d.pragma("user_version = 5");
  }
}

export function fyOf(date: string) {
  const [y, m] = date.split("-").map(Number);
  return m >= 4 ? y : y - 1;
}

function migrateV2(d: Database.Database) {
  d.pragma("foreign_keys = OFF");
  d.transaction(() => {
    d.exec(`
      ALTER TABLE accounts ADD COLUMN area TEXT;
      ALTER TABLE accounts ADD COLUMN pincode TEXT;
      ALTER TABLE accounts ADD COLUMN default_disc REAL NOT NULL DEFAULT 0;
      ALTER TABLE accounts ADD COLUMN salesman_id INTEGER;
      ALTER TABLE items ADD COLUMN scheme_qty REAL NOT NULL DEFAULT 0;
      ALTER TABLE items ADD COLUMN scheme_free REAL NOT NULL DEFAULT 0;
      CREATE TABLE salesmen (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, phone TEXT, active INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE users (
        id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'billing', active INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        CHECK (role IN ('admin','billing','viewer'))
      );
      CREATE TABLE vouchers_new (
        id INTEGER PRIMARY KEY,
        type TEXT NOT NULL,
        fy INTEGER NOT NULL,
        number INTEGER NOT NULL,
        date TEXT NOT NULL,
        party_id INTEGER REFERENCES accounts(id),
        cash_account_id INTEGER REFERENCES accounts(id),
        salesman_id INTEGER REFERENCES salesmen(id),
        status TEXT NOT NULL DEFAULT 'open',
        source_id INTEGER,
        ref_no TEXT, ref_date TEXT, narration TEXT,
        gross REAL DEFAULT 0, discount REAL DEFAULT 0, taxable REAL DEFAULT 0,
        cgst REAL DEFAULT 0, sgst REAL DEFAULT 0, igst REAL DEFAULT 0,
        round_off REAL DEFAULT 0, total REAL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(type, fy, number)
      );
      INSERT INTO vouchers_new (id, type, fy, number, date, party_id, cash_account_id, ref_no, ref_date, narration,
        gross, discount, taxable, cgst, sgst, igst, round_off, total, created_at)
      SELECT id, type, CASE WHEN CAST(substr(date, 6, 2) AS INTEGER) >= 4 THEN CAST(substr(date, 1, 4) AS INTEGER)
        ELSE CAST(substr(date, 1, 4) AS INTEGER) - 1 END, number, date, party_id, cash_account_id, ref_no, ref_date, narration,
        gross, discount, taxable, cgst, sgst, igst, round_off, total, created_at FROM vouchers;
      DROP TABLE vouchers;
      ALTER TABLE vouchers_new RENAME TO vouchers;
      CREATE INDEX vouchers_date ON vouchers(date);
    `);
    // First-run account only: created once when the users table is born. Restored
    // backups that already contain users are untouched, and an empty users table on
    // an existing DB does NOT silently re-enable admin/admin (that's a lock-out, not a backdoor).
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync("admin", salt, 64).toString("hex");
    d.prepare("INSERT INTO users (username, password_hash, role) VALUES ('admin', ?, 'admin')").run(`${salt}:${hash}`);
    d.pragma("user_version = 2");
  })();
  d.pragma("foreign_keys = ON");
}

export function sysAcc(code: string): number {
  const r = db().prepare("SELECT id FROM accounts WHERE code = ?").get(code) as { id: number } | undefined;
  if (!r) throw new Error(`System account ${code} missing`);
  return r.id;
}

export function getSettings(): Record<string, string> {
  const rows = db().prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
}
