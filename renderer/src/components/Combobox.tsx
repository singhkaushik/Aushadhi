"use client";
import { useEffect, useRef, useState } from "react";

export type Option = { id: number; label: string; sub?: string; [k: string]: unknown };

export default function Combobox({
  url,
  value,
  onSelect,
  placeholder,
  autoFocus,
  className,
}: {
  url: string;
  value: string;
  onSelect: (o: Option) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const [q, setQ] = useState(value);
  const [opts, setOpts] = useState<Option[]>([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => setQ(value), [value]);

  const runFetch = async (text: string, id: number): Promise<Option[] | null> => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const sep = url.includes("?") ? "&" : "?";
      const res = await fetch(`${url}${sep}q=${encodeURIComponent(text)}`, { signal: ac.signal });
      const data = (await res.json()) as Option[];
      if (id !== seq.current) return null; // a newer request superseded this one
      return data;
    } catch {
      return null;
    }
  };

  const search = (text: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const id = ++seq.current;
      const data = await runFetch(text, id);
      if (data === null) return;
      const exact = text.length >= 6 ? data.find((o) => o.barcode && String(o.barcode) === text.trim()) : undefined;
      if (exact) return choose(exact);
      setOpts(data);
      setHi(0);
      setOpen(true);
    }, 120);
  };

  const choose = (o: Option) => {
    setQ(o.label);
    setOpen(false);
    onSelect(o);
  };

  return (
    <div className={`relative ${className ?? ""}`}>
      <input
        className="input"
        value={q}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQ(e.target.value);
          search(e.target.value);
        }}
        onFocus={() => search(q === value ? "" : q)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={async (e) => {
          if (!open && e.key === "Enter" && q.trim() && q !== value) {
            e.preventDefault();
            if (timer.current) clearTimeout(timer.current);
            const id = ++seq.current;
            const data = await runFetch(q.trim(), id);
            if (data === null) return;
            const exact = data.find((o) => o.barcode && String(o.barcode) === q.trim());
            if (exact || data.length === 1) choose(exact ?? data[0]);
            else { setOpts(data); setHi(0); setOpen(true); }
            return;
          }
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHi((h) => Math.min(h + 1, opts.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter" && opts[hi]) {
            e.preventDefault();
            choose(opts[hi]);
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && opts.length > 0 && (
        <ul className="absolute z-30 mt-0.5 max-h-72 w-full min-w-80 overflow-auto rounded border border-slate-300 bg-white text-sm shadow-lg">
          {opts.map((o, i) => (
            <li
              key={o.id}
              onMouseDown={() => choose(o)}
              className={`cursor-pointer px-2 py-1 ${i === hi ? "bg-teal-600 text-white" : ""}`}
            >
              <div>{o.label}</div>
              {o.sub && <div className={`text-xs ${i === hi ? "text-teal-100" : "text-slate-500"}`}>{o.sub}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
