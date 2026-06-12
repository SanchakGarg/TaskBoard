import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export interface DropdownOption<T extends string> {
  value: T;
  label: ReactNode;
}

interface DropdownProps<T extends string> {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}

export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  className = "",
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="anim-hover flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border-2 border-ink-soft/40 bg-paper px-3 py-2 hover:border-ink"
      >
        <span>{selected?.label ?? value}</span>
        <ChevronDown
          size={16}
          className={`text-ink-soft transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="anim-modal absolute z-20 mt-1 w-full overflow-hidden rounded-lg border-2 border-ink bg-paper shadow-card">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={`anim-hover block w-full cursor-pointer px-3 py-2 text-left hover:bg-paper-dark ${o.value === value ? "bg-paper-dark font-semibold" : ""}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
