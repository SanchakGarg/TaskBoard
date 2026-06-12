import { useCallback, useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Pencil, Plus, Search, Trash2, Undo2 } from "lucide-react";
import { api } from "../../lib/api";
import { parseTags, type Column, type Task } from "../../lib/types";
import { useBoardDrag } from "../../hooks/useDrag";
import { Button, ContextMenu, Input, type ContextMenuItem } from "../ui";
import { TaskCard } from "./TaskCard";
import { TaskModal } from "./TaskModal";
import { QuickAddTask } from "./QuickAddTask";
import { CompletedSection } from "./CompletedSection";
import { SketchArrow } from "../../illustrations";

export function KanbanBoard({ projectId }: { projectId: number }) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<Task | null>(null);
  const [addingTo, setAddingTo] = useState<number | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumn, setNewColumn] = useState("");
  const [search, setSearch] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; task: Task } | null>(null);

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

  const moveTask = useCallback(
    (taskId: number, toColumn: number, position: number) => {
      // optimistic update, then persist
      setTasks((prev) => {
        const task = prev.find((t) => t.id === taskId);
        if (!task) return prev;
        return prev.map((t) =>
          t.id === taskId ? { ...t, column_id: toColumn, position } : t
        );
      });
      api.patch(`/tasks/${taskId}/move`, { columnId: toColumn, position }).then(load);
    },
    [load]
  );

  const { dragging, overColumn, dragProps, dropProps } = useBoardDrag(moveTask);

  const createTask = async (
    columnId: number,
    data: { title: string; dueDate?: string; tags: string[] }
  ) => {
    await api.post("/tasks", { columnId, ...data });
    load();
  };

  const createColumn = async () => {
    const name = newColumn.trim();
    if (!name) return;
    await api.post(`/projects/${projectId}/columns`, { name });
    setNewColumn("");
    setAddingColumn(false);
    load();
  };

  const matches = (t: Task) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      t.title.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      parseTags(t.tags).some((tag) => tag.toLowerCase().includes(q))
    );
  };

  const menuItems = (task: Task): ContextMenuItem[] => {
    const sorted = [...columns].sort((a, b) => a.position - b.position);
    const idx = sorted.findIndex((c) => c.id === task.column_id);
    const next = sorted[idx + 1];
    const items: ContextMenuItem[] = [
      { label: "Edit task", icon: <Pencil size={14} />, onClick: () => setSelected(task) },
      {
        label: task.completed_at ? "Reopen" : "Mark complete",
        icon: task.completed_at ? <Undo2 size={14} /> : <CheckCircle2 size={14} />,
        onClick: () =>
          api.patch(`/tasks/${task.id}`, { completed: !task.completed_at }).then(load),
      },
    ];
    if (next) {
      items.push({
        label: `Move to ${next.name}`,
        icon: <ArrowRight size={14} />,
        onClick: () =>
          api
            .patch(`/tasks/${task.id}/move`, {
              columnId: next.id,
              position: tasks.filter((t) => t.column_id === next.id).length,
            })
            .then(load),
      });
    }
    items.push({
      label: "Delete",
      icon: <Trash2 size={14} />,
      danger: true,
      onClick: () => {
        if (confirm(`Delete task "${task.title}"?`)) api.delete(`/tasks/${task.id}`).then(load);
      },
    });
    return items;
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-5 pt-4">
        <div className="relative w-72">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-soft" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks, tags…"
            className="!py-1.5 !pl-8 text-sm"
          />
        </div>
        {search && (
          <span className="text-sm text-ink-soft">
            {tasks.filter(matches).length} match{tasks.filter(matches).length === 1 ? "" : "es"}
          </span>
        )}
      </div>

      <div className="flex flex-1 gap-4 overflow-x-auto p-5">
      {columns.map((col) => {
        const colTasks = tasks
          .filter((t) => t.column_id === col.id && matches(t))
          .sort((a, b) => a.position - b.position);
        const openTasks = colTasks.filter((t) => !t.completed_at);
        const doneTasks = colTasks.filter((t) => t.completed_at);
        return (
          <section
            key={col.id}
            {...dropProps(col.id, colTasks.length)}
            className={`flex h-fit max-h-full w-72 shrink-0 flex-col rounded-xl border-2 border-ink/30 bg-paper-dark/50 p-3 ${overColumn === col.id && dragging ? "drop-target" : ""}`}
          >
            <header className="group/col mb-3 flex items-center justify-between">
              <h3 className="font-hand font-bold">
                {col.name}
                <span className="ml-2 text-sm font-normal text-ink-soft">{colTasks.length}</span>
              </h3>
              <button
                aria-label={`Delete column ${col.name}`}
                onClick={() => {
                  if (
                    colTasks.length === 0 ||
                    confirm(`Delete "${col.name}" and its ${colTasks.length} tasks?`)
                  )
                    api.delete(`/columns/${col.id}`).then(load);
                }}
                className="anim-hover cursor-pointer rounded p-1 text-ink-soft opacity-0 hover:text-pen-red group-hover/col:opacity-100"
              >
                <Trash2 size={14} />
              </button>
            </header>

            <div className="-m-1 flex flex-col gap-2 overflow-y-auto p-1">
              {openTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  isDragging={dragging?.taskId === task.id}
                  dragHandleProps={dragProps(task.id, col.id)}
                  onClick={() => setSelected(task)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, task });
                  }}
                />
              ))}
              <CompletedSection count={doneTasks.length}>
                {doneTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    isDragging={dragging?.taskId === task.id}
                    dragHandleProps={dragProps(task.id, col.id)}
                    onClick={() => setSelected(task)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenu({ x: e.clientX, y: e.clientY, task });
                    }}
                  />
                ))}
              </CompletedSection>
            </div>

            {addingTo === col.id ? (
              <div className="mt-2">
                <QuickAddTask
                  onCreate={(data) => createTask(col.id, data)}
                  onCancel={() => setAddingTo(null)}
                />
              </div>
            ) : (
              <button
                onClick={() => setAddingTo(col.id)}
                className="anim-hover mt-2 flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-ink-soft hover:bg-paper hover:text-ink"
              >
                <Plus size={15} /> Add task
              </button>
            )}
          </section>
        );
      })}

      {/* add column */}
      <div className="w-64 shrink-0">
        {addingColumn ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createColumn();
            }}
            className="flex flex-col gap-2 rounded-xl border-2 border-dashed border-ink/30 p-3"
          >
            <Input
              autoFocus
              placeholder="Column name"
              value={newColumn}
              onChange={(e) => setNewColumn(e.target.value)}
              onBlur={() => !newColumn.trim() && setAddingColumn(false)}
            />
            <Button type="submit" size="sm" disabled={!newColumn.trim()}>
              Add column
            </Button>
          </form>
        ) : (
          <button
            onClick={() => setAddingColumn(true)}
            className="anim-hover flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink/30 p-3 text-ink-soft hover:border-ink hover:text-ink"
          >
            <Plus size={16} /> Add column
          </button>
        )}
        {columns.length > 0 && tasks.length === 0 && (
          <div className="mt-8 text-center text-ink-soft">
            <SketchArrow size={40} className="mx-auto -scale-x-100" />
            <p className="font-hand mt-1">add your first task!</p>
          </div>
        )}
      </div>

      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.task)}
          onClose={() => setMenu(null)}
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
