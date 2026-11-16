"use client";
import { useState } from "react";
import { LogoMark } from "@/components/Logo";

export default function Login() {
  const [err, setErr] = useState("");
  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <form
        className="card w-80 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const res = await fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: f.get("username"), password: f.get("password") }),
          });
          if (!res.ok) return setErr((await res.json()).error);
          const next = new URLSearchParams(window.location.search).get("next");
          window.location.href = next && next.startsWith("/") ? next : "/";
        }}
      >
        <div className="flex flex-col items-center gap-1 text-center">
          <LogoMark size={44} />
          <div className="text-xs font-semibold uppercase tracking-widest text-teal-600">Aushadhi</div>
          <div className="text-lg font-semibold">Login</div>
        </div>
        <div><label className="label">Username</label><input name="username" className="input" autoFocus required /></div>
        <div><label className="label">Password</label><input name="password" type="password" className="input" required /></div>
        {err && <div className="text-sm text-red-600">{err}</div>}
        <button className="btn w-full justify-center">Login</button>
        <p className="text-center text-xs text-slate-500">First time: admin / admin</p>
      </form>
    </div>
  );
}
