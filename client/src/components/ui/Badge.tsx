import type { ReactNode } from "react";
import type { Priority } from "../../lib/types";

type Tone = "blue" | "red" | "green" | "amber" | "neutral";

const tones: Record<Tone, string> = {
  blue: "bg-pen-blue/10 text-pen-blue border-pen-blue/40",
  red: "bg-pen-red/10 text-pen-red border-pen-red/40",
  green: "bg-pen-green/10 text-pen-green border-pen-green/40",
  amber: "bg-pen-amber/10 text-pen-amber border-pen-amber/40",
  neutral: "bg-ink/5 text-ink-soft border-ink-soft/30",
};

export const priorityTone: Record<Priority, Tone> = {
  low: "neutral",
  medium: "blue",
  high: "amber",
  urgent: "red",
};

export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
