"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DEFAULT_PREFS, loadPrefs, prefsQuery } from "@/lib/print-prefs";

const FORMATS: [string, string][] = [
  ["a4", "A4 — Classic GST"],
  ["modern", "A4 — Modern"],
  ["letterhead", "A4 — Letterhead"],
  ["compact", "A4 — Compact"],
  ["a5", "A5"],
  ["estimate", "Estimate / Cash Bill"],
  ["thermal", "Thermal 80mm"],
  ["thermal58", "Thermal 58mm"],
];

export default function PrintMenu({ id }: { id: number }) {
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);

  useEffect(() => setPrefs(loadPrefs()), []);

  return (
    <span className="flex items-center gap-1">
      <select className="input w-auto py-1 text-sm" value={prefs.format}
        onChange={(e) => setPrefs({ ...prefs, format: e.target.value })} title="Bill print format">
        {FORMATS.map(([f, label]) => (
          <option key={f} value={f}>{label}</option>
        ))}
      </select>
      <button className="btn" onClick={() => window.open(`/print/${id}?auto=1&${prefsQuery(prefs)}`, "_blank")}>Print</button>
      <Link href={`/print-design/${id}`} className="btn-sec" title="Design & preview bill">Design</Link>
    </span>
  );
}
