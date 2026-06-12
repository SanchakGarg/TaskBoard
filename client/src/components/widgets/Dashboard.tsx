import { Suspense, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../../lib/api";
import type { WidgetInstance } from "../../lib/types";
import { Button, Modal } from "../ui";
import { WidgetShell } from "./WidgetShell";
import { widgetRegistry, defaultLayout } from "./registry";

export function Dashboard() {
  const [layout, setLayout] = useState<WidgetInstance[] | null>(null);
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
      <div className="mb-4 flex justify-end">
        <Button size="sm" variant="secondary" onClick={() => setPicking(true)}>
          <Plus size={15} /> Add widget
        </Button>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        {layout.map((w) => {
          const def = widgetRegistry[w.type];
          if (!def) return null;
          const WidgetBody = def.component;
          return (
            <div
              key={w.id}
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
                onToggleCollapse={() =>
                  update(layout.map((x) => (x.id === w.id ? { ...x, collapsed: !x.collapsed } : x)))
                }
                onRemove={() => update(layout.filter((x) => x.id !== w.id))}
                isDragging={dragId === w.id}
                isDropTarget={overId === w.id && dragId !== null && dragId !== w.id}
                dragHandleProps={{
                  draggable: true,
                  onDragStart: (e: React.DragEvent) => {
                    e.dataTransfer.effectAllowed = "move";
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
          Your dashboard is empty — add a widget!
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
