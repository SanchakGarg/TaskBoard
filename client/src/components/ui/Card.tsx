import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  lift?: boolean;
  children: ReactNode;
}

export function Card({ lift = false, className = "", children, ...rest }: CardProps) {
  return (
    <div
      className={`rounded-xl border-2 border-ink/80 bg-paper p-4 shadow-card ${lift ? "anim-lift" : ""} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
