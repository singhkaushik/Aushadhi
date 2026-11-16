"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Logo } from "./Logo";

const NAV: { title: string; links: [string, string, string?][] }[] = [
  { title: "", links: [["/", "Dashboard"]] },
  {
    title: "Transactions",
    links: [
      ["/vouchers/sale/new", "Sale Bill", "F2"],
      ["/vouchers/purchase/new", "Purchase Bill", "F3"],
      ["/vouchers/sale_return/new", "Sale Return"],
      ["/vouchers/purchase_return/new", "Purchase Return"],
      ["/vouchers/receipt/new", "Receipt", "F6"],
      ["/vouchers/payment/new", "Payment", "F7"],
      ["/vouchers/journal/new", "Journal"],
      ["/vouchers/sale_order/new", "Sale Order"],
      ["/vouchers/challan/new", "Delivery Challan"],
      ["/vouchers/purchase_order/new", "Purchase Order"],
      ["/vouchers/pending", "Pending Orders / Challans"],
      ["/vouchers", "All Vouchers"],
    ],
  },
  {
    title: "Masters",
    links: [
      ["/masters/accounts", "Parties / Ledgers"],
      ["/masters/items", "Items / Products"],
      ["/masters/salesmen", "Salesmen"],
    ],
  },
  {
    title: "Reports",
    links: [
      ["/reports/stock", "Stock Summary"],
      ["/reports/expiry", "Expiry / Near Expiry"],
      ["/reports/reorder", "Low Stock / Reorder"],
      ["/reports/outstanding", "Outstanding"],
      ["/reports/ledger", "Ledger"],
      ["/reports/analysis", "Sales Analysis"],
      ["/reports/register?type=sale", "Sale Register"],
      ["/reports/register?type=purchase", "Purchase Register"],
      ["/reports/daybook", "Day Book"],
      ["/reports/gst", "GST Summary / HSN"],
      ["/reports/trial-balance", "Trial Balance"],
      ["/reports/pnl", "Profit & Loss / Balance Sheet"],
    ],
  },
  {
    title: "Utilities",
    links: [
      ["/import", "Import Marg Data"],
      ["/settings", "Company & Backup"],
      ["/users", "Users"],
      ["/password", "Change Password"],
    ],
  },
];

const KEYS: Record<string, string> = {
  F2: "/vouchers/sale/new",
  F3: "/vouchers/purchase/new",
  F6: "/vouchers/receipt/new",
  F7: "/vouchers/payment/new",
};

const ADMIN_ONLY = ["/settings", "/import", "/users"];

export default function Sidebar({ company, user }: { company: string; user: { username: string; role: string } }) {
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (KEYS[e.key]) {
        e.preventDefault();
        router.push(KEYS[e.key]);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [router]);
  return (
    <aside className="no-print w-56 shrink-0 bg-slate-900 text-slate-200">
      <div className="border-b border-slate-700 px-4 py-3">
        <Logo size={26} textClass="text-teal-400 uppercase tracking-wide text-xs" />
        <div className="truncate text-sm font-semibold">{company}</div>
        <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
          <span>{user.username} ({user.role})</span>
          <button
            className="text-teal-400 hover:underline"
            onClick={async () => {
              await fetch("/api/logout", { method: "POST" });
              window.location.href = "/login";
            }}
          >
            Logout
          </button>
        </div>
      </div>
      <nav className="space-y-3 p-2 text-sm">
        {NAV.map((g) => (
          <div key={g.title}>
            {g.title && <div className="px-2 pb-1 text-[11px] uppercase tracking-wider text-slate-500">{g.title}</div>}
            {g.links
              .filter(([href]) => user.role === "admin" || !ADMIN_ONLY.includes(href))
              .filter(([href]) => user.role !== "viewer" || !href.endsWith("/new"))
              .map(([href, label, key]) => {
              const active = href === "/" ? path === "/" : path === href.split("?")[0];
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex justify-between rounded px-2 py-1 hover:bg-slate-800 ${active ? "bg-teal-700 text-white" : ""}`}
                >
                  <span>{label}</span>
                  {key && <span className="text-[10px] text-slate-400">{key}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
