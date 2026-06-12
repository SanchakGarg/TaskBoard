import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import type { Column, Task } from "../../lib/types";
import { useBoardDrag } from "../../hooks/useDrag";
import { Button, Input } from "../ui";
import { TaskCard } from "./TaskCard";
import { TaskModal } from "./TaskModal";
import { SketchArrow } from "../../illustrations";

export function KanbanBoard({ projectId }: { projectId: number }) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<Task | null>(null);
  const [addingTo, setAddingTo] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumn, setNewColumn] = useState("");

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

  const createTask = async (columnId: number) => {
    const title = newTitle.trim();
    if (!title) return;
    await api.post("/tasks", { columnId, title });
    setNewTitle("");
    setAddingTo(null);
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

  return (
    <div className="flex h-full gap-4 overflow-x-auto p-5">
      {columns.map((col) => {
        const colTasks = tasks
          .filter((t) => t.column_id === col.id)
          .sort((a, b) => a.position - b.position);
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

            <div className="flex flex-col gap-2 overflow-y-auto">
              {colTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  isDragging={dragging?.taskId === task.id}
                  dragHandleProps={dragProps(task.id, col.id)}
                  onClick={() => setSelected(task)}
                />
              ))}
            </div>

            {addingTo === col.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createTask(col.id);
                }}
                className="mt-2 flex flex-col gap-2"
              >
                <Input
                  autoFocus
                  placeholder="Task title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onBlur={() => !newTitle.trim() && setAddingTo(null)}
                />
                <Button type="submit" size="sm" disabled={!newTitle.trim()}>
                  Add
                </Button>
              </form>
            ) : (
              <button
                onClick={() => {
                  setAddingTo(col.id);
                  setNewTitle("");
                }}
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
