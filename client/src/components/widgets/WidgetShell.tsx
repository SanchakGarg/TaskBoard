import type { ReactNode } from "react";
import { ChevronDown, GripVertical, X } from "lucide-react";

interface WidgetShellProps {
  title: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onRemove: () => void;
  dragHandleProps: Record<string, unknown>;
  isDragging: boolean;
  isDropTarget: boolean;
  children: ReactNode;
}

export function WidgetShell({
  title,
  collapsed,
  onToggleCollapse,
  onRemove,
  dragHandleProps,
  isDragging,
  isDropTarget,
  children,
}: WidgetShellProps) {
  return (
    <section
      className={`rounded-xl border-2 border-ink/70 bg-paper shadow-card ${isDragging ? "dragging" : ""} ${isDropTarget ? "drop-target" : ""}`}
    >
      <header
        {...dragHandleProps}
        className="flex cursor-grab items-center gap-1.5 border-b-2 border-ink/10 px-3 py-2 active:cursor-grabbing"
      >
        <GripVertical size={14} className="text-ink-soft/50" />
        <h3 className="font-hand font-bold">{title}</h3>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand" : "Collapse"}
            className="anim-hover cursor-pointer rounded p-1 text-ink-soft hover:bg-paper-dark hover:text-ink"
          >
            <ChevronDown
              size={15}
              className={`transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`}
            />
          </button>
          <button
            onClick={onRemove}
            aria-label="Remove widget"
            className="anim-hover cursor-pointer rounded p-1 text-ink-soft hover:bg-paper-dark hover:text-pen-red"
          >
            <X size={15} />
          </button>
        </div>
      </header>
      {!collapsed && <div className="p-3">{children}</div>}
    </section>
  );
}
