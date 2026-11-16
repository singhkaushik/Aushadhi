"use client";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";

export default function Shell({ company, user, children }: { company: string; user: { username: string; role: string } | null; children: React.ReactNode }) {
  // Print views render bare — no app chrome on screen or paper
  if (usePathname().startsWith("/print")) return <>{children}</>;
  return (
    <div className="flex min-h-screen">
      {user && <Sidebar company={company} user={user} />}
      <main className="flex-1 overflow-x-auto p-5">{children}</main>
    </div>
  );
}
