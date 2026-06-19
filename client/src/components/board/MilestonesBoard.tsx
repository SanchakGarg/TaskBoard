import { useCallback, useEffect, useState } from "react";
import { Check, Flag, GripVertical, Plus, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { atLeast, type Milestone, type Role } from "../../lib/types";
import { Button, DatePicker, Input, useConfirm } from "../ui";

interface MilestonesBoardProps {
  projectId: string;
  role: Role;
}

const pad = (n: number) => String(n).padStart(2, "0");

// stored ISO -> DatePicker value ("YYYY-MM-DD" or "YYYY-MM-DD HH:mm")
const isoToPicker = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return time === "00:00" ? date : `${date} ${time}`;
};

// DatePicker value -> ISO string (or null)
const pickerToIso = (value: string): string | null => {
  if (!value) return null;
  if (value.includes("T")) return value;
  const [d, t] = value.split(" ");
  const [y, m, day] = d!.split("-").map(Number);
  const [h, min] = (t || "00:00").split(":").map(Number);
  return new Date(y!, m! - 1, day!, h!, min!).toISOString();
};

// human-friendly due-date label
const dueLabel = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const base = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return time === "00:00" ? base : `${base}, ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
};

export function MilestonesBoard({ projectId, role }: MilestonesBoardProps) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [adding, setAdding] = useState("");
  const [addingDue, setAddingDue] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const confirm = useConfirm();

  const canWrite = atLeast(role, "write");
  const canCheck = atLeast(role, "checker");

  const load = useCallback(() => {
    api.get<Milestone[]>(`/projects/${projectId}/milestones`).then(setMilestones);
  }, [projectId]);

  useEffect(load, [load]);

  const total = milestones.length;
  const done = milestones.filter((m) => m.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const add = async () => {
    const title = adding.trim();
    if (!title) return;
    const dueIso = pickerToIso(addingDue);
    const tempId = "temp-" + Date.now();
    const optimistic: Milestone = {
      id: tempId,
      project_id: projectId,
      title,
      done: 0,
      position: milestones.length,
      due_date: dueIso,
    };
    setMilestones((prev) => [...prev, optimistic]);
    setAdding("");
    setAddingDue("");
    try {
      await api.post(`/projects/${projectId}/milestones`, { title, dueDate: dueIso });
    } finally {
      load();
    }
  };

  const toggle = (m: Milestone) => {
    if (!canCheck) return;
    setMilestones((prev) => prev.map((x) => (x.id === m.id ? { ...x, done: x.done ? 0 : 1 } : x)));
    api.patch(`/milestones/${m.id}`, { done: !m.done }).catch(load);
  };

  const saveTitle = (m: Milestone) => {
    const next = editTitle.trim();
    setEditingId(null);
    if (!next || next === m.title) return;
    setMilestones((prev) => prev.map((x) => (x.id === m.id ? { ...x, title: next } : x)));
    api.patch(`/milestones/${m.id}`, { title: next }).catch(load);
  };

  const setDue = (m: Milestone, value: string) => {
    const iso = pickerToIso(value);
    setMilestones((prev) => prev.map((x) => (x.id === m.id ? { ...x, due_date: iso } : x)));
    api.patch(`/milestones/${m.id}`, { dueDate: iso }).catch(load);
  };

  const remove = async (m: Milestone) => {
    if (!(await confirm(`Delete milestone "${m.title}"?`))) return;
    setMilestones((prev) => prev.filter((x) => x.id !== m.id));
    api.delete(`/milestones/${m.id}`).catch(load);
  };

  const drop = (targetId: string) => {
    if (dragId === null || dragId === targetId) return;
    const ids = milestones.map((m) => m.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    setMilestones((prev) => [...prev].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)));
    api.put(`/projects/${projectId}/milestones/reorder`, { ids }).catch(load);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* header + rollup */}
      <div className="mb-5 flex items-center gap-3">
        <Flag size={20} className="text-pen-amber" />
        <h2 className="font-hand text-2xl text-ink">Milestones</h2>
        {total > 0 && (
          <span className="ml-auto text-sm text-ink-soft">
            {done}/{total} done
          </span>
        )}
      </div>

      {total > 0 && (
        <div className="mb-6 h-2 w-full overflow-hidden rounded-full bg-ink/10">
          <div
            className="anim-hover h-full rounded-full bg-pen-green"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* list */}
      <ul className="flex flex-col gap-1.5">
        {milestones.map((m) => (
          <li
            key={m.id}
            draggable={canWrite && editingId !== m.id}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              setDragId(m.id);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setOverId(m.id);
            }}
            onDrop={(e) => {
              e.preventDefault();
              drop(m.id);
              setDragId(null);
              setOverId(null);
            }}
            className={`group flex items-center gap-2 rounded-lg border-2 bg-paper px-2.5 py-2 ${
              overId === m.id && dragId !== null && dragId !== m.id
                ? "border-pen-blue"
                : "border-ink/15"
            } ${dragId === m.id ? "dragging" : ""}`}
          >
            {canWrite && (
              <GripVertical
                size={14}
                className="shrink-0 cursor-grab text-ink-soft/40 group-hover:text-ink-soft"
              />
            )}

            <button
              onClick={() => toggle(m)}
              disabled={!canCheck}
              aria-label={m.done ? "Mark not done" : "Mark done"}
              className={`anim-hover flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                m.done ? "border-pen-green bg-pen-green text-paper" : "border-ink-soft/50 text-transparent"
              } ${canCheck ? "cursor-pointer hover:border-pen-green" : "cursor-default"}`}
            >
              <Check size={12} strokeWidth={3} />
            </button>

            {editingId === m.id ? (
              <Input
                autoFocus
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={() => saveTitle(m)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveTitle(m);
                  if (e.key === "Escape") setEditingId(null);
                }}
                className="!py-0.5 text-sm"
              />
            ) : (
              <span
                onDoubleClick={() => {
                  if (!canWrite) return;
                  setEditingId(m.id);
                  setEditTitle(m.title);
                }}
                className={`min-w-0 flex-1 truncate ${m.done ? "text-ink-soft line-through" : "text-ink"} ${canWrite ? "cursor-text" : ""}`}
                title={canWrite ? "Double-click to rename" : undefined}
              >
                {m.title}
              </span>
            )}

            {canWrite ? (
              <DatePicker value={isoToPicker(m.due_date)} onChange={(v) => setDue(m, v)} compact />
            ) : (
              m.due_date && <span className="shrink-0 text-xs text-ink-soft">{dueLabel(m.due_date)}</span>
            )}

            {canWrite && (
              <button
                onClick={() => remove(m)}
                aria-label="Delete milestone"
                className="anim-hover shrink-0 cursor-pointer rounded p-1 text-ink-soft opacity-0 hover:text-pen-red group-hover:opacity-100"
              >
                <Trash2 size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>

      {total === 0 && !canWrite && (
        <p className="text-sm text-ink-soft">No milestones yet.</p>
      )}

      {/* add */}
      {canWrite && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          className="mt-4 flex items-center gap-2"
        >
          <Plus size={16} className="shrink-0 text-ink-soft" />
          <Input
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            placeholder="New milestone…"
            className="flex-1 text-sm"
          />
          <DatePicker value={addingDue} onChange={setAddingDue} compact />
          <Button type="submit" size="sm" disabled={!adding.trim()}>
            Add
          </Button>
        </form>
      )}
    </div>
  );
}
