export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="aushadhi-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0f766e" />
          <stop offset="1" stopColor="#14b8a6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#aushadhi-bg)" />
      <g transform="rotate(-45 31 37)">
        <rect x="15" y="31" width="32" height="13" rx="6.5" fill="#ffffff" />
        <rect x="15" y="31" width="16" height="13" rx="6.5" fill="#99f6e4" />
      </g>
      <path d="M45 13c-8.5.7-15.3 6-16.6 14.2C36.9 26 43.4 20.4 45 13z" fill="#d1fae5" />
      <path d="M45 13c2.6 8.5-1.8 16-8.8 19.4C37 24.6 40 18.3 45 13z" fill="#6ee7b7" opacity="0.9" />
    </svg>
  );
}

export function Logo({ size = 28, textClass = "text-slate-100" }: { size?: number; textClass?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={size} />
      <span className={`font-semibold tracking-wide ${textClass}`} style={{ fontSize: size * 0.55 }}>
        Aushadhi
      </span>
    </span>
  );
}
