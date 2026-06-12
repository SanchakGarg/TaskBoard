import { useCallback, useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { api } from "../../lib/api";
import { parseTags, type Column, type Task } from "../../lib/types";
import { Badge, Checkbox, ContextMenu, priorityTone, useConfirm, type ContextMenuItem } from "../ui";
import { TaskModal } from "./TaskModal";
import { QuickAddTask } from "./QuickAddTask";
import { CompletedSection } from "./CompletedSection";

const today = () => new Date().toISOString().slice(0, 10);

// Single-list view for projects created as "list" instead of kanban.
export function ListBoard({ projectId }: { projectId: number }) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<Task | null>(null);
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; task: Task } | null>(null);
  const [pageMenu, setPageMenu] = useState<{ x: number; y: number } | null>(null);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    const board = await api.get<{ columns: Column[]; tasks: Task[] }>(
      `/projects/${projectId}/board`
    );
    setColumns(board.columns);
    setTasks(board.tasks);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const listColumn = columns[0];

  const open = tasks.filter((t) => !t.completed_at).sort((a, b) => a.position - b.position);
  const done = tasks.filter((t) => t.completed_at).sort((a, b) => a.position - b.position);

  const toggleComplete = (t: Task, completed: boolean) =>
    api.patch(`/tasks/${t.id}`, { completed }).then(load);

  const menuItems = (task: Task): ContextMenuItem[] => [
    { label: "Edit task", icon: <Pencil size={14} />, onClick: () => setSelected(task) },
    {
      label: task.completed_at ? "Reopen" : "Mark complete",
      icon: task.completed_at ? <Undo2 size={14} /> : <CheckCircle2 size={14} />,
      onClick: () => toggleComplete(task, !task.completed_at),
    },
    {
      label: "Delete",
      icon: <Trash2 size={14} />,
      danger: true,
      onClick: async () => {
        if (await confirm(`Delete task "${task.title}"?`))
          api.delete(`/tasks/${task.id}`).then(load);
      },
    },
  ];

  const row = (t: Task) => {
    const overdue = !t.completed_at && !!t.due_date && t.due_date < today();
    return (
      <li
        key={t.id}
        onClick={() => setSelected(t)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenu({ x: e.clientX, y: e.clientY, task: t });
        }}
        className="anim-lift-card flex cursor-pointer items-center gap-3 rounded-lg border-2 border-ink/70 bg-paper p-3 shadow-card"
      >
        <span onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={!!t.completed_at} onChange={(d) => toggleComplete(t, d)} />
        </span>
        <span className={`min-w-0 truncate ${t.completed_at ? "text-ink-soft line-through" : ""}`}>
          {t.title}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {parseTags(t.tags)
            .slice(0, 3)
            .map((tag) => (
              <Badge key={tag} tone="blue">
                {tag}
              </Badge>
            ))}
          {t.priority !== "medium" && <Badge tone={priorityTone[t.priority]}>{t.priority}</Badge>}
          {t.due_date && (
            <Badge tone={overdue ? "red" : "neutral"}>
              <CalendarDays size={11} />
              {t.due_date}
            </Badge>
          )}
        </span>
      </li>
    );
  };

  return (
    <div
      className="mx-auto min-h-full max-w-3xl p-5"
      onContextMenu={(e) => {
        e.preventDefault();
        setPageMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      {adding && listColumn ? (
        <div className="mb-3">
          <QuickAddTask
            onCreate={async (data) => {
              await api.post("/tasks", { columnId: listColumn.id, ...data });
              load();
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
      )}

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
        <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.task)} onClose={() => setMenu(null)} />
      )}

      {pageMenu && (
        <ContextMenu
          x={pageMenu.x}
          y={pageMenu.y}
          items={[{ label: "Add task", icon: <Plus size={14} />, onClick: () => setAdding(true) }]}
          onClose={() => setPageMenu(null)}
        />
      )}

      <TaskModal
        task={selected}
        onClose={() => setSelected(null)}
        onChanged={() => {
          setSelected(null);
          load();
        }}
      />
    </div>
  );
}
