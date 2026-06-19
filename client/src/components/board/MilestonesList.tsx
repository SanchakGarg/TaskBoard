import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Flag, Plus, X } from "lucide-react";
import { api } from "../../lib/api";
import { atLeast, type Milestone, type Role } from "../../lib/types";
import { Confetti, DatePicker, Divider, Input, useConfirm } from "../ui";

interface MilestonesListProps {
  projectId: string;
  role: Role;
}

const pad = (n: number) => String(n).padStart(2, "0");

const isoToPicker = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return time === "00:00" ? date : `${date} ${time}`;
};

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
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export function MilestonesList({ projectId, role }: MilestonesListProps) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [collapsed, setCollapsed] = useState(false);
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

  const total = milestones.length;
  const done = milestones.filter((m) => m.done).length;

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

  const setMilestoneDue = (m: Milestone, value: string) => {
    const iso = pickerToIso(value);
    setMilestones((prev) => prev.map((x) => (x.id === m.id ? { ...x, due_date: iso } : x)));
    api.patch(`/milestones/${m.id}`, { dueDate: iso }).catch(load);
  };

  const remove = async (m: Milestone) => {
    if (!(await confirm(`Delete milestone "${m.title}"?`))) return;
    setMilestones((prev) => prev.filter((x) => x.id !== m.id));
    api.delete(`/milestones/${m.id}`).catch(load);
  };

  // Nothing to show and can't add — stay out of the way.
  if (!total && !canWrite) return null;

  return (
    <section className="border-b-2 border-ink/10 bg-paper-dark/25 px-4 py-3 sm:px-6">
      <div className="mx-auto w-full max-w-2xl">
        {/* heading */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="anim-hover flex w-full cursor-pointer items-center gap-2 text-left"
        >
          <Flag size={16} className="shrink-0 text-pen-amber" />
          <span className="font-hand text-lg text-ink">Milestones</span>
          {total > 0 && (
            <span className="font-hand text-base text-ink-soft">
              {done}/{total}
            </span>
          )}
          <ChevronDown
            size={16}
            className={`anim-hover ml-auto text-ink-soft/70 ${collapsed ? "-rotate-90" : ""}`}
          />
        </button>

        {!collapsed && (
          <>
            <Divider className="my-2" />

            {total > 0 && (
              <ul className="flex max-h-60 flex-col overflow-y-auto">
                {milestones.map((m) => (
                  <li
                    key={m.id}
                    className="group flex items-center gap-2.5 border-b border-dashed border-ink/10 py-1.5 last:border-0"
                  >
                    <button
                      onClick={(e) => toggle(m, e)}
                      disabled={!canCheck}
                      aria-label={m.done ? "Mark not done" : "Mark done"}
                      className={`anim-hover flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                        m.done ? "border-pen-green bg-pen-green text-paper" : "border-ink-soft/50 text-transparent"
                      } ${canCheck ? "cursor-pointer hover:border-pen-green" : "cursor-default"}`}
                    >
                      <Check size={12} strokeWidth={3.5} />
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
                        className="!flex-1 !border-transparent !bg-transparent !px-0 !py-0 font-hand text-lg"
                      />
                    ) : (
                      <span
                        onDoubleClick={() => {
                          if (!canWrite) return;
                          setEditingId(m.id);
                          setEditTitle(m.title);
                        }}
                        className={`flex-1 truncate font-hand text-lg ${m.done ? "text-ink-soft line-through" : "text-ink"} ${canWrite ? "cursor-text" : ""}`}
                        title={canWrite ? "Double-click to rename" : undefined}
                      >
                        {m.title}
                      </span>
                    )}

                    {canWrite ? (
                      <DatePicker value={isoToPicker(m.due_date)} onChange={(v) => setMilestoneDue(m, v)} compact />
                    ) : (
                      m.due_date && <span className="shrink-0 text-xs text-ink-soft">{dueLabel(m.due_date)}</span>
                    )}

                    {canWrite && (
                      <button
                        onClick={() => remove(m)}
                        aria-label="Delete milestone"
                        className="anim-hover shrink-0 cursor-pointer rounded p-1 text-ink-soft opacity-0 hover:text-pen-red group-hover:opacity-100"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* add row */}
            {canWrite &&
              (adding ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    add();
                  }}
                  className="flex items-center gap-2.5 py-1.5"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-ink-soft/50 text-ink-soft/50">
                    <Plus size={12} />
                  </span>
                  <Input
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setAdding(false);
                        setTitle("");
                        setDue("");
                      }
                    }}
                    placeholder="New milestone…"
                    className="!flex-1 !border-transparent !bg-transparent !px-0 !py-0 font-hand text-lg"
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
                  className="anim-hover mt-1 flex cursor-pointer items-center gap-2 font-hand text-base text-ink-soft hover:text-ink"
                >
                  <Plus size={15} />
                  Add milestone
                </button>
              ))}
          </>
        )}
      </div>

      {burst && <Confetti key={burst.key} x={burst.x} y={burst.y} onDone={() => setBurst(null)} />}
    </section>
  );
}
