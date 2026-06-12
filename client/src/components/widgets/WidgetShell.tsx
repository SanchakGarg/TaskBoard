import { useRef, type ReactNode } from "react";
import { ChevronDown, GripVertical, X } from "lucide-react";

interface WidgetShellProps {
  title: string;
  collapsed: boolean;
  editing: boolean;
  height?: number;
  cols: number;
  onToggleCollapse: () => void;
  onRemove: () => void;
  onResize: (patch: { height?: number; cols?: number }) => void;
  dragHandleProps: Record<string, unknown>;
  isDragging: boolean;
  isDropTarget: boolean;
  children: ReactNode;
}

export function WidgetShell({
  title,
  collapsed,
  editing,
  height,
  cols,
  onToggleCollapse,
  onRemove,
  onResize,
  dragHandleProps,
  isDragging,
  isDropTarget,
  children,
}: WidgetShellProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  const startHeightDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height ?? bodyRef.current?.offsetHeight ?? 120;
    const move = (ev: PointerEvent) =>
      onResize({ height: Math.max(60, Math.round(startH + ev.clientY - startY)) });
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startWidthDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const el = sectionRef.current;
    if (!el) return;
    const colWidth = el.offsetWidth / cols;
    const startW = el.offsetWidth;
    const move = (ev: PointerEvent) => {
      const want = Math.min(3, Math.max(1, Math.round((startW + ev.clientX - startX) / colWidth)));
      if (want !== cols) onResize({ cols: want });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <section
      ref={sectionRef}
      className={`group/widget relative rounded-xl border-2 border-ink/70 bg-paper shadow-card ${isDragging ? "dragging" : ""} ${isDropTarget ? "drop-target" : ""} ${editing ? "border-dashed" : ""}`}
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
          {editing && (
            <button
              onClick={onRemove}
              aria-label="Remove widget"
              className="anim-hover cursor-pointer rounded p-1 text-pen-red hover:bg-paper-dark"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </header>

      {!collapsed && (
        <div
          ref={bodyRef}
          className="overflow-y-auto p-3"
          style={height ? { height } : undefined}
        >
          {children}
        </div>
      )}

      {/* resize handles — appear on hover */}
      {!collapsed && (
        <>
          <div
            onPointerDown={startHeightDrag}
            title="Drag to resize height"
            className="absolute -bottom-1 left-3 right-3 h-2 cursor-ns-resize rounded opacity-0 transition-opacity duration-200 hover:bg-pen-blue/40 group-hover/widget:opacity-100"
          />
          <div
            onPointerDown={startWidthDrag}
            title="Drag to resize width"
            className="absolute -right-1 bottom-3 top-3 w-2 cursor-ew-resize rounded opacity-0 transition-opacity duration-200 hover:bg-pen-blue/40 group-hover/widget:opacity-100"
          />
        </>
      )}
    </section>
  );
}
