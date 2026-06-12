interface DividerProps {
  label?: string;
  className?: string;
}

// Hand-drawn wavy divider — a tiny inline SVG, not a flat <hr>.
export function Divider({ label, className = "" }: DividerProps) {
  const wave = (
    <svg viewBox="0 0 200 8" preserveAspectRatio="none" className="h-2 flex-1 text-ink-soft/50">
      <path
        d="M0 4 Q 12 1, 25 4 T 50 4 T 75 4 T 100 4 T 125 4 T 150 4 T 175 4 T 200 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );

  return (
    <div className={`flex items-center gap-3 ${className}`} role="separator">
      {wave}
      {label && <span className="font-hand text-sm text-ink-soft">{label}</span>}
      {label && wave}
    </div>
  );
}
