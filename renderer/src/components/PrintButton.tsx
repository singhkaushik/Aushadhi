"use client";
import { useEffect } from "react";

export default function PrintButton({ auto }: { auto?: boolean }) {
  useEffect(() => {
    if (auto) setTimeout(() => window.print(), 300);
  }, [auto]);
  return <button className="btn no-print" onClick={() => window.print()}>Print</button>;
}
