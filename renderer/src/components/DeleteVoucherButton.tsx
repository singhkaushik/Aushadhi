"use client";
import { useRouter } from "next/navigation";

export default function DeleteVoucherButton({ id }: { id: number }) {
  const router = useRouter();
  return (
    <button
      className="btn-danger"
      onClick={async () => {
        if (!confirm("Delete this voucher? Stock and ledger will be reversed.")) return;
        const res = await fetch(`/api/vouchers/${id}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) return alert(data.error);
        router.push("/vouchers");
        router.refresh();
      }}
    >
      Delete
    </button>
  );
}
