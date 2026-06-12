import { useState } from "react";
import { KanbanSquare, List, ListChecks } from "lucide-react";
import type { Project } from "../lib/types";
import type { View } from "./Sidebar";

interface TabsProps {
  projects: Project[];
  view: View;
  onNavigate: (view: View) => void;
  onReorder: (ids: number[]) => void;
}

// Project tab strip: My Tasks is pinned first, project tabs drag to reorder.
export function Tabs({ projects, view, onNavigate, onReorder }: TabsProps) {
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);

  const drop = (targetId: number) => {
    if (dragId === null || dragId === targetId) return;
    const ids = projects.map((p) => p.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    onReorder(ids);
  };

  const base =
    "anim-hover flex shrink-0 cursor-pointer items-center gap-1.5 rounded-t-lg border-2 border-b-0 px-3 py-1.5 text-sm";
  const active = "border-ink bg-paper font-semibold shadow-card";
  const inactive = "border-transparent text-ink-soft hover:bg-paper/60 hover:text-ink";

  return (
    <div className="flex items-end gap-1 overflow-x-auto border-b-2 border-ink/20 bg-paper-dark/40 px-4 pt-2">
      <button
        onClick={() => onNavigate({ kind: "mytasks" })}
        className={`${base} ${view.kind === "mytasks" ? active : inactive}`}
      >
        <ListChecks size={15} />
        My Tasks
      </button>

      {projects.map((p) => (
        <button
          key={p.id}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            setDragId(p.id);
          }}
          onDragEnd={() => {
            setDragId(null);
            setOverId(null);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setOverId(p.id);
          }}
          onDrop={(e) => {
            e.preventDefault();
            drop(p.id);
            setDragId(null);
            setOverId(null);
          }}
          onClick={() => onNavigate({ kind: "board", projectId: p.id })}
          className={`${base} ${view.kind === "board" && view.projectId === p.id ? active : inactive} ${dragId === p.id ? "dragging" : ""} ${overId === p.id && dragId !== null && dragId !== p.id ? "drop-target" : ""}`}
        >
          {p.view_type === "list" ? <List size={15} /> : <KanbanSquare size={15} />}
          <span className="max-w-36 truncate">{p.name}</span>
        </button>
      ))}
    </div>
  );
}
