export type Zone = "left" | "right" | "hide";

export type PrintPrefs = {
  format: string;
  copy: string;
  accent: string;
  party: string;
  fs: string;
  frame: string;
  stamp: string;
  lhmm: number;
  gsum: string;
  signt: string;
  logo: boolean;
  hsn: boolean;
  batch: boolean;
  free: boolean;
  mrp: boolean;
  brand: boolean;
  sm: boolean;
  bar: boolean;
  zgst: Zone;
  zwords: Zone;
  zterms: Zone;
  zdecl: Zone;
  zbank: Zone;
  zsign: Zone;
  ztotals: Zone;
  zbal: Zone;
  zfoot: Zone;
};

export const DEFAULT_PREFS: PrintPrefs = {
  format: "a4", copy: "", accent: "teal", party: "left",
  fs: "m", frame: "box", stamp: "", lhmm: 40, gsum: "rate", signt: "",
  logo: true, hsn: true, batch: true, free: true, mrp: true, brand: false, sm: true, bar: false,
  zgst: "left", zwords: "left", zterms: "left", zdecl: "left", zbank: "left", zsign: "right", ztotals: "right", zbal: "right", zfoot: "left",
};

const KEY = "aushadhi_print";
const PRESETS_KEY = "aushadhi_print_presets";

export function loadPrefs(): PrintPrefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(p: PrintPrefs) {
  localStorage.setItem(KEY, JSON.stringify(p));
}

export function loadPresets(): Record<string, PrintPrefs> {
  try {
    return JSON.parse(localStorage.getItem(PRESETS_KEY) || "{}");
  } catch {
    return {};
  }
}

export function savePresets(p: Record<string, PrintPrefs>) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(p));
}

export function prefsQuery(p: PrintPrefs): string {
  const bits = [`format=${p.format}`];
  if (p.copy) bits.push(`copy=${p.copy}`);
  if (p.accent !== "teal") bits.push(`accent=${p.accent}`);
  if (p.party !== "left") bits.push(`party=${p.party}`);
  if (p.fs !== "m") bits.push(`fs=${p.fs}`);
  if (p.frame !== "box") bits.push(`frame=${p.frame}`);
  if (p.stamp) bits.push(`stamp=${p.stamp}`);
  if (p.lhmm !== 40) bits.push(`lhmm=${p.lhmm}`);
  if (p.gsum !== "rate") bits.push(`gsum=${p.gsum}`);
  if (p.signt) bits.push(`signt=${encodeURIComponent(p.signt)}`);
  for (const k of ["zgst", "zwords", "zterms", "zdecl", "zbank", "zsign", "ztotals", "zbal", "zfoot"] as const) {
    if (p[k] !== DEFAULT_PREFS[k]) bits.push(`${k}=${p[k]}`);
  }
  for (const k of ["logo", "hsn", "batch", "free", "mrp", "sm"] as const) {
    if (!p[k]) bits.push(`${k}=0`);
  }
  for (const k of ["brand", "bar"] as const) {
    if (p[k]) bits.push(`${k}=1`);
  }
  return bits.join("&");
}
