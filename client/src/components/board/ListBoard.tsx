import { useCallback, useEffect, useState } from "react";
import { Calendar, ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import {
  atLeast,
  parseTags,
  type Column,
  type Member,
  type Role,
  type TagDef,
  type Task,
} from "../../lib/types";
import { Checkbox, ContextMenu, useConfirm, type ContextMenuItem } from "../ui";
import { TaskEditor, anchorFromEvent, type EditorAnchor } from "./TaskEditor";
import { QuickAddTask } from "./QuickAddTask";
import { CompletedSection } from "./CompletedSection";
import { AvatarStack, TagBadge } from "./pickers";

// ── helpers (mirrors MyTasksPage) ───────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const formatShortDate = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));

const PRIORITY_COLOR: Record<Task["priority"], string> = {
  urgent: "bg-pen-red",
  high: "bg-pen-amber",
  medium: "bg-pen-blue",
  low: "bg-ink/20",
};
const PRIORITY_LABELS: Record<Task["priority"], string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

function getDueInfo(dueDate: string) {
  const t = todayStr();
  const d = dueDate.slice(0, 10);
  if (d < t) {
    const days = Math.round((new Date(t).getTime() - new Date(d).getTime()) / 86400000);
    return { label: days === 1 ? "Yesterday" : `${days}d overdue`, cls: "text-pen-red bg-pen-red/10" };
  }
  if (d === t) return { label: "Today", cls: "text-pen-amber bg-pen-amber/10" };
  const days = Math.round((new Date(d).getTime() - new Date(t).getTime()) / 86400000);
  if (days === 1) return { label: "Tomorrow", cls: "text-pen-blue bg-pen-blue/10" };
  if (days <= 7) return { label: `${days}d left`, cls: "text-ink-soft bg-ink/5" };
  return { label: formatShortDate(dueDate), cls: "text-ink-soft bg-ink/5" };
}

// ── component ────────────────────────────────────────────────────────────────

interface ListBoardProps {
  projectId: string;
  role: Role;
  publicData?: { project: any; columns: Column[]; tasks: Task[] } | null;
}

export function ListBoard({ projectId, role, publicData }: ListBoardProps) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tags, setTags] = useState<TagDef[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [editing, setEditing] = useState<{ task: Task; anchor: EditorAnchor } | null>(null);
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; task: Task; anchor: EditorAnchor } | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const confirm = useConfirm();

  const canWrite = atLeast(role, "write");
  const canComplete = atLeast(role, "checker");

  const load = useCallback(async () => {
    if (publicData) {
      setColumns(publicData.columns);
      setTasks(publicData.tasks);
      setIsInitialLoad(false);
      return;
    }
    try {
      const board = await api.get<{ columns: Column[]; tasks: Task[]; workspaceId: string }>(
        `/projects/${projectId}/board`
      );
      setColumns(board.columns);
      setTasks(board.tasks);
      const [tagList, memberList] = await Promise.all([
        api.get<TagDef[]>(`/workspaces/${board.workspaceId}/tags`),
        api.get<Member[]>(`/workspaces/${board.workspaceId}/members`),
      ]);
      setTags(tagList);
      setMembers(memberList);
    } finally {
      setIsInitialLoad(false);
    }
  }, [projectId, publicData]);

  useEffect(() => {
    setIsInitialLoad(true);
    load();
  }, [load]);

  const listColumn = columns[0];
  const open = tasks.filter((t) => !t.completed_at).sort((a, b) => a.position - b.position);
  const done = tasks.filter((t) => t.completed_at).sort((a, b) => a.position - b.position);

  const toggleComplete = (t: Task, completed: boolean) => {
    setTasks((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, completed_at: completed ? new Date().toISOString() : null } : x))
    );
    api.patch(`/tasks/${t.id}`, { completed }).catch(load);
  };

  const menuItems = (task: Task, anchor: EditorAnchor): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    if (canWrite)
      items.push({ label: "Edit task", icon: <Pencil size={14} />, onClick: () => setEditing({ task, anchor }) });
    if (canWrite)
      items.push({
        label: "Delete",
        icon: <Trash2 size={14} />,
        danger: true,
        onClick: async () => {
          if (await confirm(`Delete task "${task.title}"?`)) {
            setTasks((prev) => prev.filter((t) => t.id !== task.id));
            api.delete(`/tasks/${task.id}`).catch(load);
          }
        },
      });
    return items;
  };

  const row = (t: Task) => {
    const taskTags = parseTags(t.tags);
    const dueInfo = t.due_date ? getDueInfo(t.due_date) : null;
    const showStrip = t.priority !== "low";
    const isCompleted = !!t.completed_at;
    const indent = canComplete ? "pl-7" : "pl-0";

    return (
      <li
        key={t.id}
        onDoubleClick={(e) => canWrite && setEditing({ task: t, anchor: anchorFromEvent(e) })}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const anchor = anchorFromEvent(e);
          if (menuItems(t, anchor).length)
            setMenu({ x: e.clientX, y: e.clientY, task: t, anchor });
        }}
        className={`anim-lift-card relative cursor-pointer list-none overflow-hidden rounded-xl border-2 border-ink/10 bg-paper transition-all hover:border-ink/20 hover:shadow-card ${isCompleted ? "opacity-60" : ""}`}
      >
        {/* priority accent strip */}
        {showStrip && (
          <div className={`absolute inset-y-0 left-0 w-1 ${PRIORITY_COLOR[t.priority]}`} />
        )}

        <div className={`flex flex-col gap-2 p-3 ${showStrip ? "pl-4" : ""}`}>
          {/* row 1: checkbox + title + priority badge */}
          <div className="flex items-start gap-3">
            {canComplete && (
              <span className="mt-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={isCompleted} onChange={(d) => toggleComplete(t, d)} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium leading-snug ${isCompleted ? "text-ink-soft line-through" : "text-ink"}`}>
                {t.title}
              </p>
            </div>
            {t.priority !== "low" && (
              <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold ${
                t.priority === "urgent" ? "bg-pen-red/10 text-pen-red" :
                t.priority === "high" ? "bg-pen-amber/10 text-pen-amber" :
                "bg-pen-blue/10 text-pen-blue"
              }`}>
                {PRIORITY_LABELS[t.priority]}
              </span>
            )}
          </div>

          {/* progress bar */}
          {(t.progress ?? 0) > 0 && (
            <div className={indent}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs text-ink-soft">Progress</span>
                <span className="text-xs font-semibold text-ink">{t.progress}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
                <div
                  className={`h-full rounded-full transition-all ${
                    t.progress === 100 ? "bg-pen-green" :
                    t.progress >= 67 ? "bg-pen-blue" :
                    t.progress >= 34 ? "bg-pen-amber" :
                    "bg-pen-red"
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, t.progress ?? 0))}%` }}
                />
              </div>
            </div>
          )}

          {/* meta row */}
          {(taskTags.length > 0 || dueInfo || (t.assignees?.length ?? 0) > 0 || (t.subtasks?.length ?? 0) > 0) && (
            <div className={`flex flex-wrap items-center gap-1.5 ${indent}`}>
              {taskTags.slice(0, 3).map((tag) => (
                <TagBadge key={tag} name={tag} tags={tags} />
              ))}
              {taskTags.length > 3 && (
                <span className="text-xs text-ink-soft">+{taskTags.length - 3}</span>
              )}
              {(t.subtasks?.length ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-ink-soft">
                  <ListChecks size={11} />
                  {t.subtasks!.filter((s) => s.done).length}/{t.subtasks!.length}
                </span>
              )}
              {dueInfo && (
                <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${dueInfo.cls}`}>
                  <Calendar size={10} />
                  {dueInfo.label}
                </span>
              )}
              {(t.assignees?.length ?? 0) > 0 && <AvatarStack assignees={t.assignees ?? []} />}
            </div>
          )}
        </div>
      </li>
    );
  };

  if (isInitialLoad && columns.length === 0) {
    return (
      <div className="mx-auto min-h-full w-full max-w-3xl p-3 sm:p-5">
        <div className="flex flex-col gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 w-full rounded-xl border-2 border-ink/10 bg-paper/50 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-full w-full max-w-3xl p-3 sm:p-5">
      {canWrite &&
        (adding && listColumn ? (
          <div className="mb-3">
            <QuickAddTask
              tags={tags}
              members={members}
              onCreate={async (data) => {
                const newTask = await api.post<Task>("/tasks", { columnId: listColumn.id, ...data });
                setTasks((prev) => [...prev, newTask]);
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="anim-hover mb-3 flex cursor-pointer items-center gap-1 rounded-lg border-2 border-dashed border-ink/30 px-3 py-2 text-sm text-ink-soft hover:border-ink hover:text-ink"
          >
            <Plus size={15} /> Add task
          </button>
        ))}

      <ul className="flex flex-col gap-2">{open.map(row)}</ul>

      {open.length === 0 && done.length === 0 && (
        <p className="font-hand mt-10 text-center text-lg text-ink-soft">
          Empty list — add your first task!
        </p>
      )}

      <CompletedSection count={done.length}>
        <ul className="flex flex-col gap-2">{done.map(row)}</ul>
      </CompletedSection>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.task, menu.anchor)}
          onClose={() => setMenu(null)}
        />
      )}

      {editing && (
        <TaskEditor
          task={editing.task}
          anchor={editing.anchor}
          tags={tags}
          members={members}
          onSave={(updated) => {
            setTasks((prev) => prev.map((t) => (t.id === editing.task.id ? { ...t, ...updated } : t)));
            setEditing(null);
          }}
          onDelete={() => {
            setTasks((prev) => prev.filter((t) => t.id !== editing.task.id));
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}
