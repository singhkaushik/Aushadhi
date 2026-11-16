"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, GROUPS } from "@/lib/db";
import { parseExpiry } from "@/lib/format";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";

const str = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v || null;
};
const num = (f: FormData, k: string) => Number(f.get(k) || 0) || 0;

export async function saveAccount(f: FormData) {
  const u = await requireRole("billing");
  const id = Number(f.get("id") || 0);
  const opening = num(f, "opening") * (f.get("opening_side") === "Cr" ? -1 : 1);
  const vals = [
    str(f, "name"), str(f, "grp"), str(f, "gstin")?.toUpperCase() ?? null, str(f, "dl_no"), str(f, "state"),
    str(f, "address"), str(f, "city"), str(f, "phone"), str(f, "email"), opening, num(f, "credit_days"),
    str(f, "area"), str(f, "pincode"), num(f, "default_disc"), Number(f.get("salesman_id")) || null,
  ];
  if (!vals[0] || !vals[1]) throw new Error("Name and group are required");
  if (!Object.keys(GROUPS).includes(String(vals[1]))) throw new Error("Invalid account group");
  if (Number.isNaN(opening) || !Number.isFinite(opening)) throw new Error("Invalid opening balance");
  if (id) {
    db().prepare(
      `UPDATE accounts SET name=?, grp=?, gstin=?, dl_no=?, state=?, address=?, city=?, phone=?, email=?, opening=?, credit_days=?,
       area=?, pincode=?, default_disc=?, salesman_id=? WHERE id=?`,
    ).run(...vals, id);
    audit(u.username, "edit", "account", id, String(vals[0]));
  } else {
    const rid = Number(db().prepare(
      `INSERT INTO accounts (name, grp, gstin, dl_no, state, address, city, phone, email, opening, credit_days, area, pincode, default_disc, salesman_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(...vals).lastInsertRowid);
    audit(u.username, "create", "account", rid, String(vals[0]));
  }
  revalidatePath("/masters/accounts");
  redirect("/masters/accounts");
}

export async function deleteAccount(f: FormData) {
  const u = await requireRole("admin");
  const id = Number(f.get("id"));
  const nm = (db().prepare("SELECT name FROM accounts WHERE id = ?").get(id) as { name: string } | undefined)?.name || "";
  const used = db().prepare("SELECT COUNT(*) c FROM ledger_entries WHERE account_id = ?").get(id) as { c: number };
  const sys = db().prepare("SELECT code FROM accounts WHERE id = ?").get(id) as { code: string | null };
  let detail = nm;
  if (used.c > 0 || sys?.code) {
    db().prepare("UPDATE accounts SET active = 0 WHERE id = ? AND code IS NULL").run(id);
    detail = `${nm} (deactivated — has transactions)`;
  } else {
    db().prepare("DELETE FROM accounts WHERE id = ?").run(id);
  }
  audit(u.username, "delete", "account", id, detail);
  redirect("/masters/accounts");
}

export async function saveItem(f: FormData) {
  const u = await requireRole("billing");
  const id = Number(f.get("id") || 0);
  const vals = [
    str(f, "name"), str(f, "company"), str(f, "salt"), str(f, "hsn"), num(f, "gst_rate"), str(f, "pack"),
    str(f, "unit"), num(f, "mrp"), num(f, "ptr"), num(f, "pts"), num(f, "purchase_rate"), str(f, "rack"),
    str(f, "schedule"), str(f, "barcode"), num(f, "min_stock"), num(f, "scheme_qty"), num(f, "scheme_free"),
  ];
  if (!vals[0]) throw new Error("Name is required");
  if (num(f, "gst_rate") < 0 || num(f, "gst_rate") > 100) throw new Error("Invalid GST rate");
  let itemId = id;
  if (id) {
    db().prepare(
      `UPDATE items SET name=?, company=?, salt=?, hsn=?, gst_rate=?, pack=?, unit=?, mrp=?, ptr=?, pts=?, purchase_rate=?,
       rack=?, schedule=?, barcode=?, min_stock=?, scheme_qty=?, scheme_free=? WHERE id=?`,
    ).run(...vals, id);
  } else {
    itemId = Number(
      db().prepare(
        `INSERT INTO items (name, company, salt, hsn, gst_rate, pack, unit, mrp, ptr, pts, purchase_rate, rack, schedule, barcode, min_stock,
         scheme_qty, scheme_free) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(...vals).lastInsertRowid,
    );
  }
  audit(u.username, id ? "edit" : "create", "item", itemId, String(vals[0]));
  revalidatePath("/masters/items");
  redirect(id ? "/masters/items" : `/masters/items/${itemId}`);
}

export async function deleteItem(f: FormData) {
  const u = await requireRole("admin");
  const id = Number(f.get("id"));
  const nm = (db().prepare("SELECT name FROM items WHERE id = ?").get(id) as { name: string } | undefined)?.name || "";
  const used = db().prepare("SELECT COUNT(*) c FROM voucher_items WHERE item_id = ?").get(id) as { c: number };
  if (used.c > 0) db().prepare("UPDATE items SET active = 0 WHERE id = ?").run(id);
  else db().prepare("DELETE FROM items WHERE id = ?").run(id);
  audit(u.username, "delete", "item", id, nm);
  redirect("/masters/items");
}

/** Opening stock batch: qty set here is the opening quantity; transactions adjust current qty on top. */
export async function saveOpeningBatch(f: FormData) {
  await requireRole("billing");
  const itemId = Number(f.get("item_id"));
  const batchId = Number(f.get("batch_id") || 0);
  const batchNo = str(f, "batch_no") || "NA";
  const expiry = parseExpiry(str(f, "expiry"));
  const opening = num(f, "opening_qty");
  const d = db();
  if (!d.prepare("SELECT id FROM items WHERE id = ?").get(itemId)) throw new Error("Item not found");
  if (batchId) {
    const b = d.prepare("SELECT opening_qty FROM batches WHERE id = ? AND item_id = ?").get(batchId, itemId) as
      | { opening_qty: number }
      | undefined;
    if (!b) throw new Error("Batch not found for this item");
    d.prepare(
      "UPDATE batches SET batch_no=?, expiry=?, mrp=?, purchase_rate=?, sale_rate=?, opening_qty=?, qty = qty + ? WHERE id=?",
    ).run(batchNo, expiry, num(f, "mrp"), num(f, "purchase_rate"), num(f, "sale_rate"), opening, opening - b.opening_qty, batchId);
  } else {
    d.prepare(
      `INSERT INTO batches (item_id, batch_no, expiry, mrp, purchase_rate, sale_rate, opening_qty, qty) VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(item_id, batch_no) DO UPDATE SET expiry=excluded.expiry, mrp=excluded.mrp, purchase_rate=excluded.purchase_rate,
       sale_rate=excluded.sale_rate, qty = qty - opening_qty + excluded.opening_qty, opening_qty=excluded.opening_qty`,
    ).run(itemId, batchNo, expiry, num(f, "mrp"), num(f, "purchase_rate"), num(f, "sale_rate"), opening, opening);
  }
  revalidatePath(`/masters/items/${itemId}`);
}

export async function deleteBatch(f: FormData) {
  const u = await requireRole("admin");
  const id = Number(f.get("batch_id"));
  const itemId = Number(f.get("item_id"));
  const b = db().prepare("SELECT id FROM batches WHERE id = ? AND item_id = ?").get(id, itemId);
  if (!b) throw new Error("Batch not found for this item");
  const used = db().prepare("SELECT COUNT(*) c FROM voucher_items WHERE batch_id = ?").get(id) as { c: number };
  if (used.c === 0) { db().prepare("DELETE FROM batches WHERE id = ?").run(id); audit(u.username, "delete", "batch", id); }
  revalidatePath(`/masters/items/${itemId}`);
}

export async function saveSettings(f: FormData) {
  const u = await requireRole("admin");
  const up = db().prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  for (const [k, v] of f.entries()) {
    if (typeof v === "string" && /^[a-z0-9_]{1,40}$/.test(k) && !k.startsWith("$")) up.run(k, v.trim().slice(0, 2000));
  }
  const sig = f.get("signature");
  if (sig instanceof File && sig.size > 0) {
    if (sig.size > 300_000) throw new Error("Signature image too large — keep it under 300KB");
    const buf = Buffer.from(await sig.arrayBuffer());
    up.run("signature", `data:${sig.type};base64,${buf.toString("base64")}`);
  }
  audit(u.username, "edit", "settings", null, "Company settings");
  revalidatePath("/", "layout");
  redirect("/settings?saved=1");
}

export async function saveSalesman(f: FormData) {
  const u = await requireRole("billing");
  const id = Number(f.get("id") || 0);
  const name = str(f, "name");
  if (!name) throw new Error("Name is required");
  if (id) db().prepare("UPDATE salesmen SET name = ?, phone = ?, active = ? WHERE id = ?").run(name, str(f, "phone"), f.get("active") ? 1 : 0, id);
  else db().prepare("INSERT INTO salesmen (name, phone) VALUES (?, ?)").run(name, str(f, "phone"));
  audit(u.username, id ? "edit" : "create", "salesman", id || null, name);
  revalidatePath("/masters/salesmen");
}
