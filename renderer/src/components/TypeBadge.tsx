import { VOUCHER_LABEL } from "@/lib/format";

const COLORS: Record<string, string> = {
  sale: "bg-teal-100 text-teal-800",
  purchase: "bg-blue-100 text-blue-800",
  sale_return: "bg-orange-100 text-orange-800",
  purchase_return: "bg-purple-100 text-purple-800",
  receipt: "bg-green-100 text-green-800",
  payment: "bg-rose-100 text-rose-800",
  journal: "bg-slate-100 text-slate-700",
  sale_order: "bg-indigo-100 text-indigo-800",
  purchase_order: "bg-cyan-100 text-cyan-800",
  challan: "bg-amber-100 text-amber-800",
  adjustment: "bg-stone-200 text-stone-800",
};

export default function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${COLORS[type] ?? "bg-slate-100 text-slate-600"}`}>
      {VOUCHER_LABEL[type] ?? type}
    </span>
  );
}
