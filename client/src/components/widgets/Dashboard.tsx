import { Suspense, useEffect, useRef, useState } from "react";
import { Check, Pencil, Plus } from "lucide-react";
import { api } from "../../lib/api";
import type { WidgetInstance } from "../../lib/types";
import { Button, Modal } from "../ui";
import { WidgetShell } from "./WidgetShell";
import { widgetRegistry, defaultLayout } from "./registry";

const spanClass = (cols: number) =>
  cols >= 3 ? "md:col-span-2 xl:col-span-3" : cols === 2 ? "md:col-span-2" : "";

export function Dashboard() {
  const [layout, setLayout] = useState<WidgetInstance[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    api.get<WidgetInstance[] | null>("/widgets/layout").then((saved) => {
      setLayout(saved && saved.length ? saved : defaultLayout);
    });
  }, []);

  const update = (next: WidgetInstance[]) => {
    setLayout(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => api.put("/widgets/layout", next), 800);
  };

  if (!layout) return null;

  const patch = (id: string, p: Partial<WidgetInstance>) =>
    update(layout.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const move = (from: string, to: string) => {
    if (from === to) return;
    const next = [...layout];
    const fromIdx = next.findIndex((w) => w.id === from);
    const toIdx = next.findIndex((w) => w.id === to);
    const [item] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, item);
    update(next);
  };

  const available = Object.keys(widgetRegistry).filter(
    (type) => !layout.some((w) => w.type === type)
  );

  return (
    <div className="p-5">
      <div className="mb-4 flex items-center justify-end gap-2">
        {editing && (
          <Button size="sm" variant="secondary" onClick={() => setPicking(true)}>
            <Plus size={15} /> Add widget
          </Button>
        )}
        <Button
          size="sm"
          variant={editing ? "primary" : "ghost"}
          onClick={() => setEditing((e) => !e)}
        >
          {editing ? (
            <>
              <Check size={15} /> Done
            </>
          ) : (
            <>
              <Pencil size={15} /> Edit
            </>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        {layout.map((w) => {
          const def = widgetRegistry[w.type];
          if (!def) return null;
          const WidgetBody = def.component;
          const cols = Math.min(w.cols ?? 1, 3);
          return (
            <div
              key={w.id}
              className={spanClass(cols)}
              onDragOver={(e) => {
                e.preventDefault();
                setOverId(w.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId) move(dragId, w.id);
                setDragId(null);
                setOverId(null);
              }}
            >
              <WidgetShell
                title={def.title}
                collapsed={!!w.collapsed}
                editing={editing}
                height={w.height}
                cols={cols}
                onToggleCollapse={() => patch(w.id, { collapsed: !w.collapsed })}
                onRemove={() => update(layout.filter((x) => x.id !== w.id))}
                onResize={(p) => patch(w.id, p)}
                isDragging={dragId === w.id}
                isDropTarget={overId === w.id && dragId !== null && dragId !== w.id}
                dragHandleProps={{
                  draggable: true,
                  onDragStart: (e: React.DragEvent) => {
                    e.dataTransfer.effectAllowed = "move";
                    // ghost the whole widget, not just the header strip
                    const widget = (e.currentTarget as HTMLElement).closest("section");
                    if (widget) e.dataTransfer.setDragImage(widget, 24, 16);
                    setDragId(w.id);
                  },
                  onDragEnd: () => {
                    setDragId(null);
                    setOverId(null);
                  },
                }}
              >
                <Suspense fallback={<p className="text-sm text-ink-soft">Loading…</p>}>
                  <WidgetBody />
                </Suspense>
              </WidgetShell>
            </div>
          );
        })}
      </div>

      {layout.length === 0 && (
        <p className="font-hand mt-10 text-center text-lg text-ink-soft">
          Your dashboard is empty — hit Edit, then add a widget!
        </p>
      )}

      <Modal open={picking} onClose={() => setPicking(false)} title="Add widget">
        {available.length === 0 ? (
          <p className="text-ink-soft">All widgets are already on your dashboard.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {available.map((type) => (
              <Button
                key={type}
                variant="secondary"
                size="sm"
                onClick={() => {
                  update([...layout, { id: `w-${type}-${Date.now()}`, type }]);
                  setPicking(false);
                }}
              >
                {widgetRegistry[type].title}
              </Button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
