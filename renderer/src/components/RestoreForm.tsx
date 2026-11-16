"use client";
import { useState } from "react";

export default function RestoreForm() {
  const [msg, setMsg] = useState("");
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!confirm("Restore will replace ALL current data with the backup. Continue?")) return;
        const res = await fetch("/api/restore", { method: "POST", body: new FormData(e.currentTarget) });
        const data = await res.json();
        setMsg(res.ok ? "Restored successfully. Reloading..." : data.error);
        if (res.ok) setTimeout(() => (window.location.href = "/"), 800);
      }}
    >
      <input type="file" name="file" accept=".db,.sqlite" required className="text-sm" />
      <button className="btn-danger">Restore</button>
      {msg && <span className="text-sm">{msg}</span>}
    </form>
  );
}
