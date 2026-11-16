import { KeyboardEvent } from "react";

/** Marg-style keyboard flow: Enter moves to the next field. */
export function enterToNext(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== "Enter" || e.defaultPrevented) return;
  const t = e.target as HTMLElement;
  if (t.tagName === "BUTTON" || t.tagName === "TEXTAREA") return;
  e.preventDefault();
  const form = e.currentTarget;
  const els = Array.from(form.querySelectorAll<HTMLElement>("input:not([type=hidden]):not([disabled]), select:not([disabled]), button[data-nav]"));
  const i = els.indexOf(t);
  if (i >= 0 && els[i + 1]) {
    els[i + 1].focus();
    if (els[i + 1] instanceof HTMLInputElement) (els[i + 1] as HTMLInputElement).select();
  }
}
