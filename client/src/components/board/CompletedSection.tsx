import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

// Collapsed-by-default dropdown holding completed tasks at the bottom
// of a kanban column or a list. State resets on reload (default closed).
export function CompletedSection({ count, children }: { count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  if (count === 0) return null;

  return (
    <div className="mt-2 border-t-2 border-dashed border-ink/15 pt-1.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="anim-hover flex w-full cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-sm text-ink-soft hover:bg-paper-dark hover:text-ink"
      >
        <ChevronRight
          size={14}
          className={`transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
        Completed
        <span className="rounded-full bg-ink/10 px-1.5 text-xs">{count}</span>
      </button>
      {open && <div className="mt-1.5 flex flex-col gap-2">{children}</div>}
    </div>
  );
}
