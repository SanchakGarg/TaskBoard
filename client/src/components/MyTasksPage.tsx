import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  ChevronRight,
  Flag,
  KanbanSquare,
  List,
  Plus,
  Search,
  Tag,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import { parseTags, type Project, type Task } from "../lib/types";
import { Checkbox } from "./ui";
import { TaskEditor, anchorFromEvent, type EditorAnchor } from "./board/TaskEditor";
import { QuickAddTask } from "./board/QuickAddTask";
import { CompletedSection } from "./board/CompletedSection";
import { AvatarStack } from "./board/pickers";
import { Coffee } from "../illustrations";
import type { View } from "../lib/types";

// ─── helpers ────────────────────────────────────────────────────────────────

type StatusFilter = "open" | "today" | "overdue" | "all";
type GroupBy = "priority" | "project" | "tag" | "due";

const pad = (n: number) => String(n).padStart(2, "0");
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const addDays = (base: string, n: number): string => {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const formatShortDate = (iso: string): string =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));

const PRIORITY_ORDER: Task["priority"][] = ["urgent", "high", "medium", "low"];
const PRIORITY_LABELS: Record<Task["priority"], string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};
const PRIORITY_COLOR: Record<Task["priority"], string> = {
  urgent: "bg-pen-red",
  high: "bg-pen-amber",
  medium: "bg-pen-blue",
  low: "bg-ink/20",
};

interface DueInfo {
  label: string;
  cls: string;
}
function getDueInfo(dueDate: string): DueInfo {
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

type Group = { key: string; label: string; tasks: Task[] };

function groupTasks(tasks: Task[], groupBy: GroupBy, projects: Project[]): Group[] {
  const t = todayStr();
  const weekEnd = addDays(t, 7);

  if (groupBy === "priority") {
    return PRIORITY_ORDER
      .map((p) => ({ key: p, label: PRIORITY_LABELS[p], tasks: tasks.filter((x) => x.priority === p) }))
      .filter((g) => g.tasks.length > 0);
  }

  if (groupBy === "project") {
    const map = new Map<string, Group>();
    for (const task of tasks) {
      const key = task.project_id ?? "__personal__";
      const label = projects.find((p) => p.id === task.project_id)?.name ?? "Personal";
      if (!map.has(key)) map.set(key, { key, label, tasks: [] });
      map.get(key)!.tasks.push(task);
    }
    return [...map.values()];
  }

  if (groupBy === "tag") {
    const map = new Map<string, Group>();
    for (const task of tasks) {
      const tags = parseTags(task.tags);
      const key = tags[0] ?? "__none__";
      const label = key === "__none__" ? "Untagged" : `#${key}`;
      if (!map.has(key)) map.set(key, { key, label, tasks: [] });
      map.get(key)!.tasks.push(task);
    }
    return [...map.values()];
  }

  // due date grouping
  const groups: Group[] = [
    { key: "overdue", label: "Overdue", tasks: tasks.filter((x) => x.due_date && x.due_date.slice(0, 10) < t) },
    { key: "today", label: "Today", tasks: tasks.filter((x) => x.due_date?.slice(0, 10) === t) },
    { key: "week", label: "This week", tasks: tasks.filter((x) => x.due_date && x.due_date.slice(0, 10) > t && x.due_date.slice(0, 10) <= weekEnd) },
    { key: "later", label: "Later", tasks: tasks.filter((x) => x.due_date && x.due_date.slice(0, 10) > weekEnd) },
    { key: "none", label: "No due date", tasks: tasks.filter((x) => !x.due_date) },
  ];
  return groups.filter((g) => g.tasks.length > 0);
}

// ─── main component ──────────────────────────────────────────────────────────

interface MyTasksPageProps {
  onNavigate: (v: View) => void;
}

export function MyTasksPage({ onNavigate }: MyTasksPageProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [groupBy, setGroupBy] = useState<GroupBy>("priority");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ task: Task; anchor: EditorAnchor } | null>(null);
  const [adding, setAdding] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const load = useCallback(() => {
    setIsInitialLoad(true);
    Promise.all([
      api.get<Task[]>("/tasks/mine").then(setTasks),
      api.get<Project[]>("/projects").then(setProjects),
    ]).finally(() => setIsInitialLoad(false));
  }, []);

  useEffect(load, [load]);

  const filtered = useMemo(() => {
    const t = todayStr();
    let base = tasks;
    switch (statusFilter) {
      case "open": base = tasks.filter((x) => !x.completed_at); break;
      case "today": base = tasks.filter((x) => !x.completed_at && x.due_date?.slice(0, 10) === t); break;
      case "overdue": base = tasks.filter((x) => !x.completed_at && !!x.due_date && x.due_date.slice(0, 10) < t); break;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      base = base.filter((x) => x.title.toLowerCase().includes(q));
    }
    return base;
  }, [tasks, statusFilter, search]);

  const openTasks = filtered.filter((t) => !t.completed_at);
  const completedBelow = statusFilter === "open" && !search ? tasks.filter((t) => t.completed_at) : [];
  const groups = useMemo(() => groupTasks(openTasks, groupBy, projects), [openTasks, groupBy, projects]);

  const toggleComplete = (t: Task, done: boolean) => {
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, completed_at: done ? new Date().toISOString() : null } : x)));
    api.patch(`/tasks/${t.id}`, { completed: done }).catch(load);
  };

  const toggleSection = (key: string) =>
    setCollapsed((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  if (isInitialLoad && tasks.length === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl p-4 sm:p-6">
        <div className="flex flex-col gap-3 mt-8">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 w-full rounded-xl border-2 border-ink/10 bg-paper/50 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      {/* ── page header ── */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-hand text-2xl font-bold">My Tasks</h1>
          {openTasks.length > 0 && (
            <span className="rounded-full border-2 border-ink/10 bg-paper px-2 py-0.5 text-xs font-semibold text-ink-soft">
              {openTasks.length}
            </span>
          )}
        </div>
      </div>

      {/* ── controls ── */}
      <div className="mb-4 flex flex-col gap-2.5">
        {/* search */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks…"
            className="w-full rounded-lg border-2 border-ink/20 bg-paper py-2 pl-9 pr-9 text-sm outline-none placeholder:text-ink-soft/50 focus:border-ink transition-colors"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-soft hover:text-ink">
              <X size={14} />
            </button>
          )}
        </div>

        {/* status filter + group-by in one scrollable row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* status pills */}
          <div className="flex items-center gap-1 rounded-lg border-2 border-ink/10 bg-paper p-0.5">
            {(["open", "today", "overdue", "all"] as StatusFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${statusFilter === f ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"}`}
              >
                {f === "open" ? "Open" : f === "today" ? "Today" : f === "overdue" ? "Overdue" : "All"}
              </button>
            ))}
          </div>

          {/* group-by pills */}
          <div className="flex items-center gap-1 rounded-lg border-2 border-ink/10 bg-paper p-0.5 ml-auto">
            <span className="px-2 text-xs text-ink-soft/60 select-none">Group</span>
            {([
              { id: "priority" as GroupBy, icon: <Flag size={11} />, label: "Priority" },
              { id: "project" as GroupBy, icon: <KanbanSquare size={11} />, label: "Project" },
              { id: "tag" as GroupBy, icon: <Tag size={11} />, label: "Tag" },
              { id: "due" as GroupBy, icon: <Calendar size={11} />, label: "Due" },
            ]).map((opt) => (
              <button
                key={opt.id}
                onClick={() => setGroupBy(opt.id)}
                className={`cursor-pointer inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${groupBy === opt.id ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"}`}
              >
                {opt.icon}
                <span className="hidden sm:inline">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── add task ── */}
      {adding ? (
        <div className="mb-4">
          <QuickAddTask
            onCreate={async (data) => {
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
          className="anim-hover mb-4 flex w-full cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-ink/20 px-4 py-2.5 text-sm text-ink-soft hover:border-ink/40 hover:text-ink transition-colors"
        >
          <Plus size={15} />
          Add personal task
        </button>
      )}

      {/* ── empty state ── */}
      {groups.length === 0 && completedBelow.length === 0 ? (
        <div className="mt-16 text-center text-ink-soft">
          <Coffee size={48} className="anim-float mx-auto" />
          <p className="font-hand mt-2 text-lg">Nothing here. Enjoy the quiet ☕</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <TaskSection
              key={group.key}
              group={group}
              groupBy={groupBy}
              collapsed={collapsed.has(group.key)}
              onToggle={() => toggleSection(group.key)}
              projects={projects}
              onToggleComplete={toggleComplete}
              onEdit={(t, e) => {
                if (t.project_id) onNavigate({ kind: "board", projectId: t.project_id });
                else setEditing({ task: t, anchor: anchorFromEvent(e) });
              }}
            />
          ))}
        </div>
      )}

      <CompletedSection count={completedBelow.length}>
        <div className="flex flex-col gap-2 pt-1">
          {completedBelow.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              groupBy={groupBy}
              projects={projects}
              onToggleComplete={toggleComplete}
              onEdit={(task, e) => {
                if (task.project_id) onNavigate({ kind: "board", projectId: task.project_id });
                else setEditing({ task, anchor: anchorFromEvent(e) });
              }}
            />
          ))}
        </div>
      </CompletedSection>

      {editing && (
        <TaskEditor
          task={editing.task}
          anchor={editing.anchor}
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

// ─── task section ─────────────────────────────────────────────────────────────

function TaskSection({
  group,
  groupBy,
  collapsed,
  onToggle,
  projects,
  onToggleComplete,
  onEdit,
}: {
  group: Group;
  groupBy: GroupBy;
  collapsed: boolean;
  onToggle: () => void;
  projects: Project[];
  onToggleComplete: (t: Task, done: boolean) => void;
  onEdit: (t: Task, e: React.MouseEvent) => void;
}) {
  return (
    <div>
      {/* section header */}
      <button
        onClick={onToggle}
        className="mb-2.5 flex w-full cursor-pointer items-center gap-2 text-left"
      >
        <ChevronRight
          size={14}
          className={`shrink-0 text-ink-soft transition-transform duration-200 ${collapsed ? "" : "rotate-90"}`}
        />
        <SectionIcon groupBy={groupBy} groupKey={group.key} />
        <span className="text-sm font-semibold">{group.label}</span>
        <span className="rounded-full bg-ink/8 px-1.5 py-0.5 text-xs font-medium text-ink-soft">
          {group.tasks.length}
        </span>
        <div className="ml-1 h-px flex-1 bg-ink/10" />
      </button>

      {!collapsed && (
        <div className="flex flex-col gap-2">
          {group.tasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              groupBy={groupBy}
              projects={projects}
              onToggleComplete={onToggleComplete}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SectionIcon({ groupBy, groupKey }: { groupBy: GroupBy; groupKey: string }) {
  if (groupBy === "priority") {
    return (
      <span className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_COLOR[groupKey as Task["priority"]] ?? "bg-ink/20"}`} />
    );
  }
  if (groupBy === "project") return <KanbanSquare size={13} className="shrink-0 text-ink-soft" />;
  if (groupBy === "tag") return <Tag size={13} className="shrink-0 text-ink-soft" />;
  return <Calendar size={13} className="shrink-0 text-ink-soft" />;
}

// ─── task card ────────────────────────────────────────────────────────────────

function TaskCard({
  task: t,
  groupBy,
  projects,
  onToggleComplete,
  onEdit,
}: {
  task: Task;
  groupBy: GroupBy;
  projects: Project[];
  onToggleComplete: (t: Task, done: boolean) => void;
  onEdit: (t: Task, e: React.MouseEvent) => void;
}) {
  const tags = parseTags(t.tags);
  const proj = projects.find((p) => p.id === t.project_id);
  const showPriorityStrip = groupBy !== "priority" && t.priority !== "low";
  const showPriorityBadge = groupBy !== "priority" && t.priority !== "low";
  const showProject = groupBy !== "project";
  const showTags = groupBy !== "tag";
  const dueInfo = t.due_date ? getDueInfo(t.due_date) : null;
  const isCompleted = !!t.completed_at;

  return (
    <div
      className={`anim-lift-card relative cursor-pointer overflow-hidden rounded-xl border-2 border-ink/10 bg-paper transition-all hover:border-ink/20 hover:shadow-card ${isCompleted ? "opacity-60" : ""}`}
      onClick={(e) => onEdit(t, e)}
    >
      {/* priority accent strip */}
      {showPriorityStrip && (
        <div className={`absolute inset-y-0 left-0 w-1 ${PRIORITY_COLOR[t.priority]}`} />
      )}

      <div className={`flex flex-col gap-2 p-3 sm:p-4 ${showPriorityStrip ? "pl-4 sm:pl-5" : ""}`}>
        {/* row 1: checkbox + title + priority badge */}
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 shrink-0"
            onClick={(e) => { e.stopPropagation(); onToggleComplete(t, !t.completed_at); }}
          >
            <Checkbox checked={isCompleted} onChange={(done) => onToggleComplete(t, done)} />
          </span>
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-medium leading-snug ${isCompleted ? "text-ink-soft line-through" : "text-ink"}`}>
              {t.title}
            </p>
            {t.description && (
              <p className="mt-0.5 line-clamp-1 text-xs text-ink-soft">{t.description}</p>
            )}
          </div>
          {showPriorityBadge && (
            <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold capitalize ${
              t.priority === "urgent" ? "bg-pen-red/10 text-pen-red" :
              t.priority === "high" ? "bg-pen-amber/10 text-pen-amber" :
              "bg-pen-blue/10 text-pen-blue"
            }`}>
              {PRIORITY_LABELS[t.priority]}
            </span>
          )}
        </div>

        {/* progress bar */}
        {t.progress > 0 && (
          <div className="pl-7">
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
                style={{ width: `${t.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* meta row */}
        {(showProject || (showTags && tags.length > 0) || dueInfo || (t.assignees?.length ?? 0) > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 pl-7">
            {/* project chip */}
            {showProject && (
              <span className="inline-flex items-center gap-1 rounded-md bg-ink/5 px-1.5 py-0.5 text-xs text-ink-soft">
                {proj?.view_type === "list" ? <List size={10} /> : <KanbanSquare size={10} />}
                {proj?.name ?? "Personal"}
              </span>
            )}

            {/* tags */}
            {showTags && tags.slice(0, 3).map((tag) => (
              <span key={tag} className="inline-flex items-center gap-0.5 rounded-full bg-pen-blue/8 px-2 py-0.5 text-xs text-pen-blue">
                #{tag}
              </span>
            ))}
            {showTags && tags.length > 3 && (
              <span className="text-xs text-ink-soft">+{tags.length - 3}</span>
            )}

            {/* due date */}
            {dueInfo && (
              <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${dueInfo.cls}`}>
                <Calendar size={10} />
                {dueInfo.label}
              </span>
            )}

            {/* assignees */}
            {(t.assignees?.length ?? 0) > 0 && (
              <AvatarStack assignees={t.assignees ?? []} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
