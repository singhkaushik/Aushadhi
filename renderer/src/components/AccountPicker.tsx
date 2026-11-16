"use client";
import { useRouter, useSearchParams } from "next/navigation";
import Combobox from "./Combobox";

export default function AccountPicker({ name }: { name: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  return (
    <div className="w-80">
      <label className="label">Account</label>
      <Combobox
        url="/api/accounts/search"
        value={name}
        placeholder="Search ledger..."
        onSelect={(o) => {
          const p = new URLSearchParams(sp.toString());
          p.set("account", String(o.id));
          router.push(`?${p.toString()}`);
        }}
      />
    </div>
  );
}
