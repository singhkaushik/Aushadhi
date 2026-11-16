// Lightweight inline SVG icons (stroke style, lucide-like). Usage: <I.sale className="h-5 w-5" />
const I = ({ d, className = "h-5 w-5" }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d={d} />
  </svg>
);

export const Icon = {
  sale: (c?: string) => <I className={c} d="M3 3v18h18 M7 15l4-4 4 3 5-6" />,
  purchase: (c?: string) => <I className={c} d="M6 6h15l-1.5 9h-12L5 3H2 M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />,
  cash: (c?: string) => <I className={c} d="M2 7h20v10H2z M12 12m-2.5 0a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0" />,
  receivable: (c?: string) => <I className={c} d="M12 3v12m0 0l-4-4m4 4l4-4 M4 21h16" />,
  payable: (c?: string) => <I className={c} d="M12 21V9m0 0l-4 4m4-4l4 4 M4 3h16" />,
  expiry: (c?: string) => <I className={c} d="M12 8v5l3 2 M12 12m-9 0a9 9 0 1 0 18 0 9 9 0 1 0-18 0" />,
  alert: (c?: string) => <I className={c} d="M12 3l10 18H2z M12 10v5m0 3v.5" />,
  box: (c?: string) => <I className={c} d="M21 8l-9-5-9 5v8l9 5 9-5z M3 8l9 5 9-5 M12 13v8" />,
  users: (c?: string) => <I className={c} d="M16 19c0-2.2-1.8-4-4-4s-4 1.8-4 4 M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M20 19c0-2-1.4-3.5-3.2-3.9 M15.5 4.3a3.5 3.5 0 0 1 0 6.4" />,
  home: (c?: string) => <I className={c} d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10" />,
  file: (c?: string) => <I className={c} d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 13h6 M9 17h6" />,
  undo: (c?: string) => <I className={c} d="M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3" />,
  book: (c?: string) => <I className={c} d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5z" />,
  clipboard: (c?: string) => <I className={c} d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2 M9 3h6v4H9z M9 12h6 M9 16h6" />,
  truck: (c?: string) => <I className={c} d="M1 8h13v8H1z M14 11h4l3 3v2h-7 M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm11 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />,
  list: (c?: string) => <I className={c} d="M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01" />,
  gear: (c?: string) => <I className={c} d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.4 1z" />,
  shield: (c?: string) => <I className={c} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  key: (c?: string) => <I className={c} d="M21 2l-2 2 M11.6 11.6a5 5 0 1 1-7 7 5 5 0 0 1 7-7zm0 0L21 3 M15 9l3 3" />,
  upload: (c?: string) => <I className={c} d="M12 16V4m0 0L8 8m4-4l4 4 M4 16v4h16v-4" />,
  chart: (c?: string) => <I className={c} d="M3 3v18h18 M7 15v3 M12 10v8 M17 6v12" />,
  scale: (c?: string) => <I className={c} d="M12 3v18 M5 21h14 M7 6l-4 7a3.5 3.5 0 0 0 7 0L7 6 M17 6l-4 7a3.5 3.5 0 0 0 7 0l-4-7z" />,
  percent: (c?: string) => <I className={c} d="M19 5L5 19 M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm11 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />,
};
export default Icon;
