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
};
export default Icon;
