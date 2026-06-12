import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useMagnetic } from "../../hooks/useMousePosition";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  magnetic?: boolean;
  children: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: "bg-ink text-paper border-2 border-ink hover:bg-pen-blue hover:border-pen-blue",
  secondary: "bg-paper text-ink border-2 border-ink hover:bg-paper-dark",
  ghost: "bg-transparent text-ink-soft border-2 border-transparent hover:text-ink hover:bg-paper-dark",
  danger: "bg-paper text-pen-red border-2 border-pen-red hover:bg-pen-red hover:text-paper",
};

const sizes: Record<Size, string> = {
  sm: "px-2.5 py-1 text-sm",
  md: "px-4 py-2",
};

export function Button({
  variant = "primary",
  size = "md",
  magnetic = false,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const { ref, onMouseMove, onMouseLeave } = useMagnetic<HTMLButtonElement>();
  const magneticProps = magnetic ? { ref, onMouseMove, onMouseLeave } : {};

  return (
    <button
      {...magneticProps}
      className={`anim-hover inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg font-medium disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
