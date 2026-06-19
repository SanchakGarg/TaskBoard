import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Flag, Plus, X } from "lucide-react";
import { api } from "../../lib/api";
import { atLeast, type Milestone, type Role } from "../../lib/types";
import { Confetti, DatePicker, Input, useConfirm } from "../ui";

interface MilestonesBarProps {
  projectId: string;
  role: Role;
}

const pickerToIso = (value: string): string | null => {
  if (!value) return null;
  if (value.includes("T")) return value;
  const [d, t] = value.split(" ");
  const [y, m, day] = d!.split("-").map(Number);
  const [h, min] = (t || "00:00").split(":").map(Number);
  return new Date(y!, m! - 1, day!, h!, min!).toISOString();
};

const dueLabel = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export function MilestonesBar({ projectId, role }: MilestonesBarProps) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [burst, setBurst] = useState<{ x: number; y: number; key: number } | null>(null);
  const burstKey = useRef(0);
  const confirm = useConfirm();

  const canWrite = atLeast(role, "write");
  const canCheck = atLeast(role, "checker");

  const load = useCallback(() => {
    api.get<Milestone[]>(`/projects/${projectId}/milestones`).then(setMilestones);
  }, [projectId]);

  useEffect(load, [load]);

  const fireConfetti = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    burstKey.current += 1;
    setBurst({ x: r.left + r.width / 2, y: r.top + r.height / 2, key: burstKey.current });
  };

  const toggle = (m: Milestone, e: React.MouseEvent) => {
    if (!canCheck) return;
    const becomingDone = !m.done;
    if (becomingDone) fireConfetti(e);
    setMilestones((prev) => prev.map((x) => (x.id === m.id ? { ...x, done: becomingDone ? 1 : 0 } : x)));
    api.patch(`/milestones/${m.id}`, { done: becomingDone }).catch(load);
  };

  const add = async () => {
    const name = title.trim();
    if (!name) return;
    const dueIso = pickerToIso(due);
    const tempId = "temp-" + Date.now();
    setMilestones((prev) => [
      ...prev,
      { id: tempId, project_id: projectId, title: name, done: 0, position: prev.length, due_date: dueIso },
    ]);
    setTitle("");
    setDue("");
    setAdding(false);
    try {
      await api.post(`/projects/${projectId}/milestones`, { title: name, dueDate: dueIso });
    } finally {
      load();
    }
  };

  const saveTitle = (m: Milestone) => {
    const next = editTitle.trim();
    setEditingId(null);
    if (!next || next === m.title) return;
    setMilestones((prev) => prev.map((x) => (x.id === m.id ? { ...x, title: next } : x)));
    api.patch(`/milestones/${m.id}`, { title: next }).catch(load);
  };

  const remove = async (m: Milestone) => {
    if (!(await confirm(`Delete milestone "${m.title}"?`))) return;
    setMilestones((prev) => prev.filter((x) => x.id !== m.id));
    api.delete(`/milestones/${m.id}`).catch(load);
  };

  // Nothing to show and can't add — stay out of the way.
  if (!milestones.length && !canWrite) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto border-b-2 border-dashed border-ink/20 bg-paper-dark/30 px-4 py-2">
      <span className="flex shrink-0 items-center gap-1.5 font-hand text-base text-ink-soft">
        <Flag size={15} className="text-pen-amber" />
        Milestones
      </span>

      <span className="h-5 w-px shrink-0 bg-ink/15" />

      {milestones.map((m) => (
        <div
          key={m.id}
          className={`anim-hover group flex shrink-0 items-center gap-1.5 rounded-full border-2 px-2.5 py-0.5 ${
            m.done
              ? "border-pen-green/50 bg-pen-green/10"
              : "border-ink/20 bg-paper hover:border-ink/40"
          }`}
        >
          <button
            onClick={(e) => toggle(m, e)}
            disabled={!canCheck}
            aria-label={m.done ? "Mark not done" : "Mark done"}
            className={`anim-hover flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
              m.done ? "border-pen-green bg-pen-green text-paper" : "border-ink-soft/50 text-transparent"
            } ${canCheck ? "cursor-pointer hover:border-pen-green" : "cursor-default"}`}
          >
            <Check size={10} strokeWidth={3.5} />
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
              className="!w-32 !border-transparent !bg-transparent !px-0 !py-0 font-hand text-base"
            />
          ) : (
            <span
              onDoubleClick={() => {
                if (!canWrite) return;
                setEditingId(m.id);
                setEditTitle(m.title);
              }}
              className={`font-hand text-base ${m.done ? "text-ink-soft line-through" : "text-ink"} ${canWrite ? "cursor-text" : ""}`}
              title={canWrite ? "Double-click to rename" : undefined}
            >
              {m.title}
            </span>
          )}

          {m.due_date && (
            <span className="shrink-0 text-xs text-ink-soft/80">· {dueLabel(m.due_date)}</span>
          )}

          {canWrite && (
            <button
              onClick={() => remove(m)}
              aria-label="Delete milestone"
              className="anim-hover -mr-1 shrink-0 cursor-pointer rounded-full p-0.5 text-ink-soft opacity-0 hover:text-pen-red group-hover:opacity-100"
            >
              <X size={13} />
            </button>
          )}
        </div>
      ))}

      {canWrite &&
        (adding ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
            className="flex shrink-0 items-center gap-1.5 rounded-full border-2 border-ink/30 bg-paper px-2 py-0.5"
          >
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && (setAdding(false), setTitle(""), setDue(""))}
              placeholder="Milestone…"
              className="!w-32 !border-transparent !bg-transparent !px-0 !py-0 font-hand text-base"
            />
            <DatePicker value={due} onChange={setDue} compact />
            <button
              type="submit"
              disabled={!title.trim()}
              aria-label="Add milestone"
              className="anim-hover shrink-0 cursor-pointer rounded-full bg-ink p-1 text-paper hover:bg-pen-blue disabled:opacity-40"
            >
              <Check size={12} strokeWidth={3} />
            </button>
          </form>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="anim-hover flex shrink-0 cursor-pointer items-center gap-1 rounded-full border-2 border-dashed border-ink/30 px-2.5 py-0.5 font-hand text-base text-ink-soft hover:border-ink hover:text-ink"
          >
            <Plus size={14} />
            Milestone
          </button>
        ))}

      {burst && <Confetti key={burst.key} x={burst.x} y={burst.y} onDone={() => setBurst(null)} />}
    </div>
  );
}
