import { useEffect, useRef, type ReactNode } from "react";

export interface ContextMenuItem {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  onClick: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    // delay so the opening right-click doesn't immediately close it
    const id = setTimeout(() => {
      window.addEventListener("mousedown", close);
      window.addEventListener("scroll", close, true);
      window.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      clearTimeout(id);
      window.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // keep the menu inside the viewport
  const menuWidth = 190;
  const menuHeight = items.length * 36 + 12;
  const left = Math.min(x, window.innerWidth - menuWidth - 8);
  const top = Math.min(y, window.innerHeight - menuHeight - 8);

  return (
    <div
      ref={ref}
      role="menu"
      style={{ left, top, width: menuWidth }}
      className="anim-modal fixed z-50 overflow-hidden rounded-lg border-2 border-ink bg-paper py-1 shadow-card-lift"
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          onClick={() => {
            onClose();
            item.onClick();
          }}
          className={`anim-hover flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-paper-dark ${item.danger ? "text-pen-red" : ""}`}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}
