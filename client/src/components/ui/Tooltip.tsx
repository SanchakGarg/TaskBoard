import type { ReactNode } from "react";

interface TooltipProps {
  label: string;
  children: ReactNode;
  className?: string;
}

// Pure CSS tooltip: hidden by default, fades in on hover via group-hover.
export function Tooltip({ label, children, className = "" }: TooltipProps) {
  return (
    <span className={`group relative inline-flex ${className}`}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute -top-9 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-md border-2 border-ink bg-ink px-2 py-0.5 text-xs text-paper opacity-0 transition-opacity duration-200 group-hover:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}
