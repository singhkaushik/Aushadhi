"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Logo } from "./Logo";
import { Icon } from "./icons";

type NavLink = [string, string] | [string, string, string] | [string, string, string | undefined, keyof typeof Icon];
const NAV: { title: string; links: NavLink[] }[] = [
  { title: "", links: [["/", "Dashboard", undefined, "home"]] },
  {
    title: "Transactions",
    links: [
      ["/vouchers/sale/new", "Sale Bill", "F2", "file"],
      ["/vouchers/purchase/new", "Purchase Bill", "F3", "purchase"],
      ["/vouchers/sale_return/new", "Sale Return", undefined, "undo"],
      ["/vouchers/purchase_return/new", "Purchase Return", undefined, "undo"],
      ["/vouchers/receipt/new", "Receipt", "F6", "receivable"],
      ["/vouchers/payment/new", "Payment", "F7", "payable"],
      ["/vouchers/journal/new", "Journal", undefined, "book"],
      ["/vouchers/sale_order/new", "Sale Order", undefined, "clipboard"],
      ["/vouchers/challan/new", "Delivery Challan", undefined, "truck"],
      ["/vouchers/purchase_order/new", "Purchase Order", undefined, "clipboard"],
      ["/vouchers/pending", "Pending Orders / Challans", undefined, "expiry"],
      ["/vouchers/adjustment/new", "Stock Adjustment", undefined, "scale"],
      ["/vouchers", "All Vouchers", undefined, "list"],
    ],
  },
  {
    title: "Masters",
    links: [
      ["/masters/accounts", "Parties / Ledgers", undefined, "users"],
      ["/masters/items", "Items / Products", undefined, "box"],
      ["/masters/salesmen", "Salesmen", undefined, "shield"],
    ],
  },
  {
    title: "Reports",
    links: [
      ["/reports/stock", "Stock Summary", undefined, "box"],
      ["/reports/expiry", "Expiry / Near Expiry", undefined, "expiry"],
      ["/reports/reorder", "Low Stock / Reorder", undefined, "alert"],
      ["/reports/outstanding", "Outstanding", undefined, "cash"],
      ["/reports/ledger", "Ledger", undefined, "book"],
      ["/reports/analysis", "Sales Analysis", undefined, "chart"],
      ["/reports/register?type=sale", "Sale Register", undefined, "file"],
      ["/reports/register?type=purchase", "Purchase Register", undefined, "file"],
      ["/reports/daybook", "Day Book", undefined, "book"],
      ["/reports/gst", "GST Summary / HSN", undefined, "percent"],
      ["/reports/trial-balance", "Trial Balance", undefined, "scale"],
      ["/reports/pnl", "Profit & Loss / Balance Sheet", undefined, "chart"],
    ],
  },
  {
    title: "Utilities",
    links: [
      ["/import", "Import Marg Data", undefined, "upload"],
      ["/settings", "Company & Backup", undefined, "gear"],
      ["/audit", "Activity Log", undefined, "expiry"],
      ["/users", "Users", undefined, "users"],
      ["/password", "Change Password", undefined, "key"],
    ],
  },
];

const KEYS: Record<string, string> = {
  F2: "/vouchers/sale/new",
  F3: "/vouchers/purchase/new",
  F6: "/vouchers/receipt/new",
  F7: "/vouchers/payment/new",
};

const ADMIN_ONLY = ["/settings", "/import", "/users", "/audit"];

export default function Sidebar({ company, user }: { company: string; user: { username: string; role: string } }) {
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (KEYS[e.key]) {
        e.preventDefault();
        const midEntry = /\/vouchers\/(new|edit\/)/.test(path) || /\/vouchers\/[^/]+\/new/.test(path);
        if (midEntry && !window.confirm("Leave this screen? Unsaved entries will be lost.")) return;
        router.push(KEYS[e.key]);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [router, path]);
  return (
    <aside className="no-print sticky top-0 h-screen w-56 shrink-0 overflow-y-auto bg-slate-900 text-slate-200">
      <div className="border-b border-slate-700 px-4 py-3">
        <Logo size={26} textClass="text-teal-400 uppercase tracking-wide text-xs" />
        <div className="truncate text-sm font-semibold">{company}</div>
        <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-700 text-[10px] font-bold text-white">
              {user.username.slice(0, 2).toUpperCase()}
            </span>
            {user.username} · {user.role}
          </span>
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
              .map(([href, label, key, icon]) => {
              const active = href === "/" ? path === "/" : path === href.split("?")[0];
              const Ic = icon ? Icon[icon] : null;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center justify-between rounded px-2 py-1 hover:bg-slate-800 ${active ? "bg-teal-700 text-white" : ""}`}
                >
                  <span className="flex items-center gap-2">
                    {Ic && Ic(`h-3.5 w-3.5 shrink-0 ${active ? "text-white" : "text-slate-500"}`)}
                    {label}
                  </span>
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
