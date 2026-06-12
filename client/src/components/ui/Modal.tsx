import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  wide?: boolean;
}

export function Modal({ open, onClose, title, children, wide = false }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="anim-backdrop fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`anim-modal max-h-[85vh] w-full overflow-y-auto rounded-xl border-2 border-ink bg-paper p-5 shadow-card-lift ${wide ? "max-w-2xl" : "max-w-md"}`}
      >
        <div className="mb-4 flex items-center justify-between">
          {title && <h2 className="font-hand text-xl font-bold">{title}</h2>}
          <button
            onClick={onClose}
            aria-label="Close"
            className="anim-hover ml-auto cursor-pointer rounded-md p-1 text-ink-soft hover:bg-paper-dark hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
