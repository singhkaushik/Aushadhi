"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Combobox from "./Combobox";
import { enterToNext } from "./useEnterNav";
import { money, r2, today, VOUCHER_LABEL } from "@/lib/format";

type JLine = { key: number; account_id: number; name: string; debit: number | ""; credit: number | "" };
export type CashInitial = {
  id?: number;
  number?: number;
  date: string;
  party: { id: number; name: string } | null;
  cash_account_id: number | null;
  amount: number | "";
  ref_no: string;
  narration: string;
  lines: JLine[];
};

let k = 1;
const jl = (): JLine => ({ key: k++, account_id: 0, name: "", debit: "", credit: "" });

export default function CashForm({
  type,
  cashAccounts,
  initial,
}: {
  type: "receipt" | "payment" | "journal";
  cashAccounts: { id: number; name: string }[];
  initial?: CashInitial;
}) {
  const router = useRouter();
  const [date, setDate] = useState(initial?.date ?? today());
  const [party, setParty] = useState(initial?.party ?? null);
  const [cashAcc, setCashAcc] = useState<number>(initial?.cash_account_id ?? cashAccounts[0]?.id);
  const [amount, setAmount] = useState<number | "">(initial?.amount ?? "");
  const [refNo, setRefNo] = useState(initial?.ref_no ?? "");
  const [narration, setNarration] = useState(initial?.narration ?? "");
  const [lines, setLines] = useState<JLine[]>(initial?.lines?.length ? initial.lines : [jl(), jl()]);
  const [err, setErr] = useState("");

  const dr = r2(lines.reduce((a, l) => a + Number(l.debit || 0), 0));
  const cr = r2(lines.reduce((a, l) => a + Number(l.credit || 0), 0));
  const upd = (key: number, p: Partial<JLine>) =>
    setLines((ls) => {
      const n = ls.map((l) => (l.key === key ? { ...l, ...p } : l));
      if (n[n.length - 1].account_id) n.push(jl());
      return n;
    });

  const save = async () => {
    setErr("");
    const body =
      type === "journal"
        ? { type, date, narration, ref_no: refNo, lines: lines.filter((l) => l.account_id).map((l) => ({ account_id: l.account_id, debit: Number(l.debit || 0), credit: Number(l.credit || 0) })) }
        : { type, date, narration, ref_no: refNo, party_id: party?.id, cash_account_id: cashAcc, amount: Number(amount || 0) };
    const res = await fetch(initial?.id ? `/api/vouchers/${initial.id}` : "/api/vouchers", {
      method: initial?.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return setErr(data.error || "Save failed");
    router.push(`/vouchers/view/${data.id}?saved=1`);
    router.refresh();
  };

  return (
    <div className="max-w-3xl" onKeyDown={enterToNext}>
      <h1 className="h1">{VOUCHER_LABEL[type]} {initial?.number ? `#${initial.number}` : "(New)"}</h1>
      <div className="card space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Ref / Cheque No</label>
            <input className="input" value={refNo} onChange={(e) => setRefNo(e.target.value)} />
          </div>
        </div>
        {type !== "journal" ? (
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="label">{type === "receipt" ? "Received From" : "Paid To"}</label>
              <Combobox url="/api/accounts/search" value={party?.name ?? ""} autoFocus placeholder="Search ledger..."
                onSelect={(o) => setParty({ id: o.id, name: String(o.name) })} />
            </div>
            <div>
              <label className="label">{type === "receipt" ? "Deposit To" : "Paid From"}</label>
              <select className="input" value={cashAcc} onChange={(e) => setCashAcc(Number(e.target.value))}>
                {cashAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Amount</label>
              <input type="number" step="any" className="input" value={amount} onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))} />
            </div>
          </div>
        ) : (
          <table className="tbl">
            <thead><tr><th>Account</th><th className="w-32 num">Debit</th><th className="w-32 num">Credit</th></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.key}>
                  <td><Combobox url="/api/accounts/search" value={l.name} onSelect={(o) => upd(l.key, { account_id: o.id, name: String(o.name) })} /></td>
                  <td><input type="number" step="any" className="input num" value={l.debit} onChange={(e) => upd(l.key, { debit: e.target.value === "" ? "" : Number(e.target.value) })} /></td>
                  <td><input type="number" step="any" className="input num" value={l.credit} onChange={(e) => upd(l.key, { credit: e.target.value === "" ? "" : Number(e.target.value) })} /></td>
                </tr>
              ))}
              <tr className="font-semibold"><td className="text-right">Total</td><td className="num">{money(dr)}</td><td className={`num ${dr !== cr ? "text-red-600" : ""}`}>{money(cr)}</td></tr>
            </tbody>
          </table>
        )}
        <div>
          <label className="label">Narration</label>
          <textarea className="input h-16" value={narration} onChange={(e) => setNarration(e.target.value)} />
        </div>
        {err && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
        <div className="flex gap-2">
          <button type="button" data-nav className="btn" onClick={save}>Save</button>
          <button type="button" className="btn-sec" onClick={() => router.back()}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
