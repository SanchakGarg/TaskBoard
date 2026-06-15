import { useCallback, useEffect, useState } from "react";
import { Clock, Flag, Plus } from "lucide-react";
import { api } from "../lib/api";
import { formatIST, parseTags, type Project, type Task } from "../lib/types";
import { Badge, Checkbox, priorityTone } from "./ui";
import { TaskEditor, anchorFromEvent, type EditorAnchor } from "./board/TaskEditor";
import { QuickAddTask } from "./board/QuickAddTask";
import { CompletedSection } from "./board/CompletedSection";
import { AvatarStack } from "./board/pickers";
import { Coffee } from "../illustrations";
import type { View } from "../lib/types";

type Filter = "open" | "today" | "overdue" | "all";

const pad = (n: number) => String(n).padStart(2, "0");
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const filters: { id: Filter; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "today", label: "Due today" },
  { id: "overdue", label: "Overdue" },
  { id: "all", label: "All" },
];

interface MyTasksPageProps {
  onNavigate: (v: View) => void;
}

// Personal tasks + tasks assigned to me, across all workspaces.
export function MyTasksPage({ onNavigate }: MyTasksPageProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState<Filter>("open");
  const [editing, setEditing] = useState<{ task: Task; anchor: EditorAnchor } | null>(null);
  const [adding, setAdding] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const load = useCallback(() => {
    setIsInitialLoad(true);
    Promise.all([
      api.get<Task[]>("/tasks/mine").then(setTasks),
      api.get<Project[]>("/projects").then(setProjects)
    ]).finally(() => setIsInitialLoad(false));
  }, []);

  useEffect(load, [load]);

  const projectName = (t: Task) => projects.find((p) => p.id === t.project_id)?.name;

  const visible = tasks.filter((t) => {
    switch (filter) {
      case "open":
        return !t.completed_at;
      case "today":
        return !t.completed_at && t.due_date?.startsWith(today());
      case "overdue":
        return !t.completed_at && !!t.due_date && t.due_date < today();
      case "all":
        return true;
    }
  });

  const completedBelow = filter === "open" ? tasks.filter((t) => t.completed_at) : [];

  const toggleComplete = (t: Task, done: boolean) => {
    setTasks((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, completed_at: done ? new Date().toISOString() : null } : x))
    );
    api.patch(`/tasks/${t.id}`, { completed: done }).catch(load);
  };

  const row = (t: Task) => {
    return (
      <li
        key={t.id}
        onDoubleClick={(e) => {
          if (t.project_id) {
            onNavigate({ kind: "board", projectId: t.project_id });
          } else {
            setEditing({ task: t, anchor: anchorFromEvent(e) });
          }
        }}
        className="anim-lift-card flex cursor-pointer select-none items-center gap-3 rounded-lg border-2 border-ink/70 bg-paper p-3 shadow-card"
      >
        <span onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={!!t.completed_at} onChange={(done) => toggleComplete(t, done)} />
        </span>
        <span className={`min-w-0 truncate ${t.completed_at ? "text-ink-soft line-through" : ""}`}>
          {t.title}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {parseTags(t.tags)
            .slice(0, 2)
            .map((tag) => (
              <Badge key={tag} tone="blue">
                {tag}
              </Badge>
            ))}
          {(t.progress ?? 0) > 0 && (
            <Badge tone="blue">{Math.max(0, Math.min(100, t.progress))}%</Badge>
          )}
          {t.priority !== "low" && (
            <Badge tone={priorityTone[t.priority]}>
              <Flag size={10} />
              {t.priority.charAt(0).toUpperCase() + t.priority.slice(1)}
            </Badge>
          )}
          {(() => {
            if (!t.due_date) return null;
            const d = new Date(t.due_date);
            const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
            return (
              <Badge tone={hasTime ? "red" : "blue"}>
                <Clock size={11} />
                {formatIST(t.due_date)}
              </Badge>
            );
          })()}
          <AvatarStack assignees={t.assignees ?? []} />
          <Badge tone={projectName(t) ? "green" : "neutral"}>{projectName(t) ?? "Personal"}</Badge>
        </span>
      </li>
    );
  };

  if (isInitialLoad && tasks.length === 0) {
    return (
      <div className="mx-auto min-h-full w-full max-w-3xl p-3 sm:p-5">
        <div className="flex flex-col gap-2 mt-12">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 w-full rounded-lg border-2 border-ink/10 bg-paper/50 animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-full w-full max-w-3xl p-3 sm:p-5">
      <div className="mb-4 flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`anim-hover cursor-pointer rounded-full border-2 px-3 py-1 text-sm ${filter === f.id ? "border-ink bg-ink text-paper" : "border-ink-soft/40 text-ink-soft hover:border-ink hover:text-ink"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {adding ? (
        <div className="mb-3">
          <QuickAddTask
            onCreate={async (data) => {
              // no columnId — a personal task, not tied to any project
              const newTask = await api.post<Task>("/tasks", data);
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
          <Plus size={15} /> Add personal task
        </button>
      )}

      {visible.length === 0 && completedBelow.length === 0 ? (
        <div className="mt-16 text-center text-ink-soft">
          <Coffee size={48} className="anim-float mx-auto" />
          <p className="font-hand mt-2 text-lg">Nothing here. Enjoy the quiet ☕</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">{visible.map(row)}</ul>
      )}

      <CompletedSection count={completedBelow.length}>
        <ul className="flex flex-col gap-2">{completedBelow.map(row)}</ul>
      </CompletedSection>

      {editing && (
        <TaskEditor
          task={editing.task}
          anchor={editing.anchor}
          onSave={(updated) => {
            setTasks((prev) =>
              prev.map((t) => (t.id === editing.task.id ? { ...t, ...updated } : t))
            );
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
