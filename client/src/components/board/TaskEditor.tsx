import { useState } from "react";
import { createPortal } from "react-dom";
import { Check, Plus, Trash2, X } from "lucide-react";
import { api } from "../../lib/api";
import { parseTags, type Member, type Priority, type Subtask, type TagDef, type Task } from "../../lib/types";
import { Avatar, Button, DatePicker, Input, Textarea, useConfirm } from "../ui";
import { AssigneePicker, PriorityPicker, Removable, TagBadge, TagPicker } from "./pickers";
import { ProgressInput } from "./ProgressInput";

export interface EditorAnchor {
  left: number;
  top: number;
  width: number;
}

export const anchorFromEvent = (e: React.MouseEvent): EditorAnchor => {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width };
};

interface TaskEditorProps {
  task: Task;
  anchor: EditorAnchor;
  tags?: TagDef[];
  members?: Member[];
  canDelete?: boolean;
  /** Called instantly with updated fields so parent can optimistically update state */
  onSave: (updated: Partial<Task>) => void;
  /** Called instantly so parent can optimistically remove from state */
  onDelete: () => void;
  onCancel: () => void;
}

const pad = (n: number) => String(n).padStart(2, "0");
const formatDeadline = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return time === "00:00" ? date : `${date} ${time}`;
};

// Expanding editor overlaid on top of the card — portaled so it can
// spill outside the column instead of being clipped by it.
export function TaskEditor({
  task,
  anchor,
  tags = [],
  members = [],
  canDelete = true,
  onSave,
  onDelete,
  onCancel,
}: TaskEditorProps) {
  const confirm = useConfirm();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [progress, setProgress] = useState(task.progress ?? 0);
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [selectedTags, setSelectedTags] = useState<string[]>(parseTags(task.tags));
  const [assignees, setAssignees] = useState<string[]>(
    task.assignees?.filter((a) => !a.isGuest).map((a) => a.id!) ?? []
  );
  const [externalAssignees, setExternalAssignees] = useState<string[]>(
    task.assignees?.filter((a) => a.isGuest).map((a) => a.name) ?? []
  );
  const [subtasks, setSubtasks] = useState<Subtask[]>(task.subtasks ?? []);
  const [newSub, setNewSub] = useState("");

  const hasSubs = subtasks.length > 0;
  const doneSubs = subtasks.filter((s) => s.done).length;
  const derivedProgress = hasSubs ? Math.round((doneSubs / subtasks.length) * 100) : progress;

  const addSubtask = async () => {
    const t = newSub.trim();
    if (!t) return;
    setNewSub("");
    const tempId = "temp-" + Date.now();
    setSubtasks((prev) => [...prev, { id: tempId, task_id: task.id, title: t, done: 0, position: prev.length }]);
    try {
      const res = await api.post<{ subtask: Subtask }>(`/tasks/${task.id}/subtasks`, { title: t });
      setSubtasks((prev) => prev.map((s) => (s.id === tempId ? res.subtask : s)));
    } catch {
      setSubtasks((prev) => prev.filter((s) => s.id !== tempId));
    }
  };

  const toggleSubtask = (s: Subtask) => {
    setSubtasks((prev) => prev.map((x) => (x.id === s.id ? { ...x, done: x.done ? 0 : 1 } : x)));
    api.patch(`/subtasks/${s.id}`, { done: !s.done }).catch(() => {});
  };

  const removeSubtask = (s: Subtask) => {
    setSubtasks((prev) => prev.filter((x) => x.id !== s.id));
    api.delete(`/subtasks/${s.id}`).catch(() => {});
  };

  const save = () => {
    let finalDueDate: string | null = null;
    if (dueDate) {
      if (dueDate.includes("T")) {
        // already ISO
        finalDueDate = dueDate;
      } else {
        // YYYY-MM-DD HH:mm (local)
        const [d, t] = dueDate.split(" ");
        const parts = d!.split("-").map(Number);
        const y = parts[0];
        const m = parts[1];
        const day = parts[2];
        const timeParts = (t || "00:00").split(":").map(Number);
        const h = timeParts[0];
        const min = timeParts[1];
        const date = new Date(y!, m! - 1, day!, h!, min!);
        finalDueDate = date.toISOString();
      }
    }

    const updated: Partial<Task> = {
      title: title.trim() || task.title,
      description,
      progress: derivedProgress,
      subtasks,
      priority,
      due_date: finalDueDate,
      tags: JSON.stringify(selectedTags),
      assignees: [
        ...assignees.map((id) => {
          const m = members.find((x) => x.id === id);
          return {
            id,
            name: m?.name ?? "Unknown",
            avatar_url: m?.avatar_url ?? "",
          };
        }),
        ...externalAssignees.map((name) => ({ name, isGuest: true })),
      ],
    };

    api.patch(`/tasks/${task.id}`, {
      ...updated,
      tags: selectedTags, // Send as array for backend registerTags
      assignees,
      externalAssignees,
    });
    onSave(updated);
  };

  const remove = async () => {
    if (!(await confirm(`Delete task "${task.title}"?`))) return;
    // Close immediately (optimistic)
    onDelete();
    // Fire API in background
    api.delete(`/tasks/${task.id}`).catch(() => {});
  };

  // wide enough to be usable, clamped to the viewport
  const width = Math.min(Math.max(anchor.width, 380), window.innerWidth - 16);
  const left = Math.min(Math.max(8, anchor.left), window.innerWidth - width - 8);
  const top = Math.min(Math.max(8, anchor.top), Math.max(8, window.innerHeight - 360));

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-ink/10" onMouseDown={onCancel} />
      <div
        style={{ position: "fixed", left, top, width, zIndex: 50 }}
        className="anim-modal flex max-h-[85vh] flex-col gap-2 overflow-y-auto rounded-lg border-2 border-pen-blue bg-paper p-3 shadow-card-lift"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
      >
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="!py-1 font-medium"
      />
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description…"
        rows={3}
        className="!py-1 text-sm"
      />
      {/* calendar + priority above */}
      <div className="flex items-center gap-1">
        <DatePicker value={formatDeadline(dueDate)} onChange={setDueDate} compact />
        <PriorityPicker value={priority} onChange={setPriority} />
      </div>

      {/* subtasks */}
      <div className="rounded-lg border-2 border-ink/10 bg-paper-dark/30 p-2">
        <div className="mb-1 flex items-center gap-2 px-0.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Subtasks</span>
          {hasSubs && (
            <span className="text-xs text-ink-soft">
              {doneSubs}/{subtasks.length}
            </span>
          )}
        </div>

        {subtasks.map((s) => (
          <div key={s.id} className="group/sub flex items-center gap-2 py-0.5">
            <button
              type="button"
              onClick={() => toggleSubtask(s)}
              aria-label={s.done ? "Mark not done" : "Mark done"}
              className={`anim-hover flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded border-2 ${
                s.done ? "border-pen-green bg-pen-green text-paper" : "border-ink-soft/50 text-transparent hover:border-pen-green"
              }`}
            >
              <Check size={10} strokeWidth={3.5} />
            </button>
            <span className={`flex-1 truncate text-sm ${s.done ? "text-ink-soft line-through" : "text-ink"}`}>
              {s.title}
            </span>
            <button
              type="button"
              onClick={() => removeSubtask(s)}
              aria-label="Delete subtask"
              className="anim-hover shrink-0 cursor-pointer rounded p-0.5 text-ink-soft opacity-0 hover:text-pen-red group-hover/sub:opacity-100"
            >
              <X size={13} />
            </button>
          </div>
        ))}

        <div className="mt-1 flex items-center gap-2">
          <Plus size={13} className="shrink-0 text-ink-soft" />
          <Input
            value={newSub}
            onChange={(e) => setNewSub(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSubtask();
              }
            }}
            placeholder="Add a subtask…"
            className="!border-transparent !bg-transparent !px-0 !py-0.5 text-sm"
          />
        </div>
      </div>

      {hasSubs ? (
        <div className="flex items-center gap-2 px-0.5">
          <div className="h-2 min-w-0 flex-1 rounded-full border border-ink-soft/30 bg-paper-dark">
            <div className="h-full rounded-full bg-pen-green" style={{ width: `${derivedProgress}%` }} />
          </div>
          <span className="text-xs font-semibold text-pen-green">{derivedProgress}%</span>
        </div>
      ) : (
        <ProgressInput value={progress} onChange={setProgress} />
      )}

      {/* tags row, bottom right */}
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {selectedTags.map((t) => (
          <Removable key={t} onRemove={() => setSelectedTags(selectedTags.filter((x) => x !== t))}>
            <TagBadge name={t} tags={tags} />
          </Removable>
        ))}
        <TagPicker selected={selectedTags} onChange={setSelectedTags} available={tags} />
      </div>

      {/* assignees row below, same style */}
      {(members.length > 0 || externalAssignees.length > 0) && (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {assignees.map((id) => {
            const m = members.find((x) => x.id === id);
            if (!m) return null;
            return (
              <Removable key={id} onRemove={() => setAssignees(assignees.filter((x) => x !== id))}>
                <span title={m.name}>
                  <Avatar name={m.name} src={m.avatar_url || undefined} size={24} />
                </span>
              </Removable>
            );
          })}
          {externalAssignees.map((name) => (
            <Removable key={name} onRemove={() => setExternalAssignees(externalAssignees.filter((x) => x !== name))}>
              <span title={`${name} (Guest)`}>
                <Avatar name={name} size={24} />
              </span>
            </Removable>
          ))}
          <AssigneePicker
            selected={assignees}
            onChange={setAssignees}
            externalSelected={externalAssignees}
            onExternalChange={setExternalAssignees}
            members={members}
          />
        </div>
      )}
      <div className="flex items-center gap-2 pt-1">
        {canDelete && (
          <Button variant="danger" size="sm" onClick={remove} className="!px-2 !py-0.5">
            <Trash2 size={13} />
          </Button>
        )}
        <Button variant="ghost" size="sm" className="ml-auto !px-3 !py-0.5" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" className="!px-3 !py-0.5" onClick={save}>
          Save
        </Button>
      </div>
      </div>
    </>,
    document.body
  );
}
