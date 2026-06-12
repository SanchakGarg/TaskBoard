import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({
      left: Math.min(rect.left, window.innerWidth - rect.width - 8),
      top: Math.min(rect.bottom + 4, window.innerHeight - 60),
      width: rect.width,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    const onScroll = (e: Event) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("scroll", onScroll, true);
    };
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
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            data-popover
            style={{ position: "fixed", left: pos.left, top: pos.top, width: pos.width, zIndex: 60 }}
            className="anim-modal max-h-60 overflow-y-auto rounded-lg border-2 border-ink bg-paper shadow-card-lift"
          >
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
          </div>,
          document.body
        )}
    </div>
  );
}
