import type { Metadata } from "next";
import "./globals.css";
import Shell from "@/components/Shell";
import { getSettings } from "@/lib/db";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Aushadhi", description: "Offline pharma distribution ERP" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const s = getSettings();
  const user = await currentUser();
  return (
    <html lang="en">
      <body>
        <Shell company={s.company_name || "Aushadhi"} user={user} theme={s.theme || "teal"}>{children}</Shell>
      </body>
    </html>
  );
}
