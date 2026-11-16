import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { fmtExpiry, money } from "@/lib/format";
import { saveItem, deleteItem, saveOpeningBatch, deleteBatch } from "../../actions";
import { currentUser } from "@/lib/auth";

export default async function ItemForm({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  const isNew = id === "new";
  const rec = isNew ? { gst_rate: 12, unit: "PCS" } : db().prepare("SELECT * FROM items WHERE id = ?").get(Number(id));
  if (!isNew && !rec) notFound();
  const i = rec as Record<string, string | number | null>;
  const readOnly = user?.role === "viewer";
  const batches = isNew ? [] : (db().prepare("SELECT * FROM batches WHERE item_id = ? ORDER BY expiry").all(Number(id)) as Record<string, string | number>[]);
  const F = ({ name, label, type = "text", className = "" }: { name: string; label: string; type?: string; className?: string }) => (
    <div className={className}>
      <label className="label">{label}</label>
      <input name={name} type={type} step="any" defaultValue={(i[name] as string) ?? ""} className="input" />
    </div>
  );
  return (
    <div className="max-w-5xl">
      <h1 className="h1">{isNew ? "New Item" : `Item: ${i.name}`}</h1>
      <form action={saveItem} className="card grid grid-cols-4 gap-3">
        <input type="hidden" name="id" value={isNew ? "" : id} />
        <div className="col-span-2">
          <label className="label">Name *</label>
          <input name="name" required autoFocus defaultValue={(i.name as string) ?? ""} className="input" />
        </div>
        <F name="company" label="Company / Manufacturer" />
        <F name="salt" label="Salt / Composition" />
        <F name="pack" label="Packing (e.g. 10x10)" />
        <F name="unit" label="Unit" />
        <F name="hsn" label="HSN Code" />
        <div>
          <label className="label">GST %</label>
          <select name="gst_rate" defaultValue={String(i.gst_rate ?? 12)} className="input">
            {[0, 5, 12, 18, 28].map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <F name="mrp" label="MRP" type="number" />
        <F name="ptr" label="PTR (Sale Rate)" type="number" />
        <F name="pts" label="PTS" type="number" />
        <F name="purchase_rate" label="Purchase Rate" type="number" />
        <F name="rack" label="Rack / Location" />
        <F name="schedule" label="Schedule (H, H1, X...)" />
        <F name="barcode" label="Barcode" />
        <F name="min_stock" label="Min Stock (reorder)" type="number" />
        <F name="scheme_qty" label="Scheme: on Qty (e.g. 10)" type="number" />
        <F name="scheme_free" label="Scheme: Free (e.g. 1)" type="number" />
        <div className="col-span-4 flex gap-2 pt-2">
          {!readOnly && <button className="btn">Save</button>}
          <Link href="/masters/items" className="btn-sec">{readOnly ? "Back" : "Cancel"}</Link>
        </div>
      </form>
      {!isNew && !readOnly && (
        <>
          <h2 className="mt-6 mb-2 font-semibold text-slate-700">Batches &amp; Opening Stock</h2>
          <div className="card p-0">
            <table className="tbl">
              <thead><tr><th>Batch</th><th>Expiry</th><th className="num">MRP</th><th className="num">Pur. Rate</th><th className="num">Sale Rate</th><th className="num">Opening</th><th className="num">Current</th><th></th></tr></thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td>{b.batch_no}</td><td>{fmtExpiry(b.expiry as string)}</td><td className="num">{money(Number(b.mrp))}</td>
                    <td className="num">{money(Number(b.purchase_rate))}</td><td className="num">{money(Number(b.sale_rate))}</td>
                    <td className="num">{b.opening_qty}</td><td className="num font-medium">{b.qty}</td>
                    <td>
                      {user?.role === "admin" && <form action={deleteBatch}>
                        <input type="hidden" name="batch_id" value={b.id} /><input type="hidden" name="item_id" value={id} />
                        <button className="text-xs text-red-600 hover:underline">delete</button>
                      </form>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <form action={saveOpeningBatch} className="grid grid-cols-7 gap-2 border-t border-slate-200 p-3">
              <input type="hidden" name="item_id" value={id} />
              <input name="batch_no" placeholder="Batch No" className="input" required />
              <input name="expiry" placeholder="Expiry MM/YY" className="input" />
              <input name="mrp" placeholder="MRP" type="number" step="any" defaultValue={(i.mrp as number) || ""} className="input" />
              <input name="purchase_rate" placeholder="Pur. Rate" type="number" step="any" defaultValue={(i.purchase_rate as number) || ""} className="input" />
              <input name="sale_rate" placeholder="Sale Rate" type="number" step="any" defaultValue={(i.ptr as number) || ""} className="input" />
              <input name="opening_qty" placeholder="Opening Qty" type="number" step="any" className="input" />
              <button className="btn">Add / Update Batch</button>
            </form>
          </div>
          {user?.role === "admin" && (
            <form action={deleteItem} className="mt-4">
              <input type="hidden" name="id" value={id} />
              <button className="btn-danger">Delete Item</button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
