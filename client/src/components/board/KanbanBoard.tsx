import { useCallback, useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Pencil, Plus, Search, Trash2 } from "lucide-react";
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
import { useBoardDrag } from "../../hooks/useDrag";
import { Button, ContextMenu, Input, Tooltip, useConfirm, type ContextMenuItem } from "../ui";
import { TaskCard } from "./TaskCard";
import { TaskEditor, anchorFromEvent, type EditorAnchor } from "./TaskEditor";
import { QuickAddTask } from "./QuickAddTask";
import { SketchArrow } from "../../illustrations";

interface KanbanBoardProps {
  projectId: number;
  role: Role;
}

export function KanbanBoard({ projectId, role }: KanbanBoardProps) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tags, setTags] = useState<TagDef[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [editing, setEditing] = useState<{ task: Task; anchor: EditorAnchor } | null>(null);
  const [addingTo, setAddingTo] = useState<number | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumn, setNewColumn] = useState("");
  const [search, setSearch] = useState("");
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    task: Task;
    anchor: EditorAnchor;
  } | null>(null);
  const [colMenu, setColMenu] = useState<{ x: number; y: number; columnId: number } | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const confirm = useConfirm();

  const canWrite = atLeast(role, "write");
  const isAdmin = role === "admin";

  const load = useCallback(async () => {
    try {
      const board = await api.get<{ columns: Column[]; tasks: Task[]; workspaceId: number }>(
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
  }, [projectId]);

  useEffect(() => {
    setIsInitialLoad(true);
    load();
  }, [load]);

  const doneColumn = columns.find((c) => c.is_done);

  const moveTask = useCallback(
    (taskId: number, toColumn: number, position: number) => {
      setTasks((prev) => {
        const task = prev.find((t) => t.id === taskId);
        if (!task) return prev;

        const fromColumn = task.column_id;
        const fromPosition = task.position;

        return prev.map((t) => {
          if (t.id === taskId) {
            return { ...t, column_id: toColumn, position };
          }
          // Shift others in the source column up to fill the gap
          if (t.column_id === fromColumn && t.position > fromPosition) {
            return { ...t, position: t.position - 1 };
          }
          // Shift others in the target column down to make room
          if (t.column_id === toColumn && t.position >= position) {
            return { ...t, position: t.position + 1 };
          }
          return t;
        });
      });

      api.patch(`/tasks/${taskId}/move`, { columnId: toColumn, position }).catch(() => {
        // On failure, reload to last known good state
        load();
      });
    },
    [load]
  );

  const { dragging, overColumn, dragProps, dropProps } = useBoardDrag(moveTask);

  const matches = (t: Task) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      t.title.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      parseTags(t.tags).some((tag) => tag.toLowerCase().includes(q))
    );
  };

  const menuItems = (task: Task, anchor: EditorAnchor): ContextMenuItem[] => {
    const sorted = [...columns].sort((a, b) => a.position - b.position);
    const idx = sorted.findIndex((c) => c.id === task.column_id);
    const next = sorted[idx + 1];
    const items: ContextMenuItem[] = [];
    if (canWrite)
      items.push({
        label: "Edit task",
        icon: <Pencil size={14} />,
        onClick: () => setEditing({ task, anchor }),
      });
    if (doneColumn && task.column_id !== doneColumn.id && atLeast(role, "checker"))
      items.push({
        label: `Complete (move to ${doneColumn.name})`,
        icon: <CheckCircle2 size={14} />,
        onClick: () => {
          setTasks((prev) => prev.map((x) => (x.id === task.id ? { ...x, column_id: doneColumn.id, completed_at: new Date().toISOString() } : x)));
          moveTask(task.id, doneColumn.id, tasks.filter((t) => t.column_id === doneColumn.id).length);
        }
      });
    if (next && canWrite && next.id !== task.column_id)
      items.push({
        label: `Move to ${next.name}`,
        icon: <ArrowRight size={14} />,
        onClick: () =>
          moveTask(task.id, next.id, tasks.filter((t) => t.column_id === next.id).length),
      });
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

  const createTask = async (
    columnId: number,
    data: { title: string; dueDate?: string; tags: string[]; priority: string; assignees: number[] }
  ) => {
    const newTask = await api.post<Task>("/tasks", { columnId, ...data });
    // Optimistically add to local state — no full reload needed
    setTasks((prev) => [...prev, newTask]);
    setAddingTo(null);
    // Fetch fresh tags in background in case new ones were registered
    api.get<{ columns: Column[]; tasks: Task[]; workspaceId: number }>(`/projects/${projectId}/board`)
      .then((board) => {
        setTasks(board.tasks);
        return api.get<TagDef[]>(`/workspaces/${board.workspaceId}/tags`);
      })
      .then(setTags)
      .catch(() => {});
  };

  const createColumn = async () => {
    const name = newColumn.trim();
    if (!name) return;
    await api.post(`/projects/${projectId}/columns`, { name });
    setNewColumn("");
    setAddingColumn(false);
    load();
  };

  if (isInitialLoad && columns.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-1 gap-4 overflow-x-auto p-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex h-fit w-72 shrink-0 flex-col gap-3 rounded-xl border-2 border-ink/10 bg-paper/50 p-3">
              <div className="h-6 w-32 rounded bg-ink/10 animate-pulse"></div>
              <div className="h-24 w-full rounded-lg bg-ink/5 animate-pulse"></div>
              <div className="h-24 w-full rounded-lg bg-ink/5 animate-pulse"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-3 pt-3 sm:px-5 sm:pt-4">
        <div className="relative w-full max-w-72">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-soft" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks, tags…"
            className="!py-1.5 !pl-8 text-sm"
          />
        </div>
        {search && (
          <span className="shrink-0 text-sm text-ink-soft">
            {tasks.filter(matches).length} match{tasks.filter(matches).length === 1 ? "" : "es"}
          </span>
        )}
      </div>

      <div className="flex flex-1 gap-3 overflow-x-auto p-3 sm:gap-4 sm:p-5">
        {columns.map((col) => {
          const colTasks = tasks
            .filter((t) => t.column_id === col.id && matches(t))
            .sort((a, b) => a.position - b.position);
          return (
            <section
              key={col.id}
              {...(canWrite || role === "checker" ? dropProps(col.id, colTasks.length) : {})}
              onContextMenu={(e) => {
                if (!canWrite) return;
                e.preventDefault();
                setColMenu({ x: e.clientX, y: e.clientY, columnId: col.id });
              }}
              className={`flex h-fit max-h-full w-[82vw] shrink-0 flex-col rounded-xl border-2 p-3 sm:w-72 ${col.is_done ? "border-pen-green/50 bg-pen-green/5" : "border-ink/30 bg-paper-dark/50"} ${overColumn === col.id && dragging ? "drop-target" : ""}`}
            >
              <header className="group/col mb-3 flex items-center gap-1">
                <h3 className="font-hand font-bold">
                  {col.name}
                  <span className="ml-2 text-sm font-normal text-ink-soft">{colTasks.length}</span>
                </h3>
                {!!col.is_done && (
                  <Tooltip label="Tasks here count as completed">
                    <CheckCircle2 size={14} className="text-pen-green" />
                  </Tooltip>
                )}
                <span className="ml-auto flex items-center gap-0.5">
                  {isAdmin && !col.is_done && (
                    <Tooltip label="Make this the done column">
                      <button
                        aria-label={`Make ${col.name} the done column`}
                        onClick={() => api.patch(`/columns/${col.id}/done`).then(load)}
                        className="anim-hover cursor-pointer rounded p-1 text-ink-soft opacity-0 hover:text-pen-green group-hover/col:opacity-100"
                      >
                        <CheckCircle2 size={14} />
                      </button>
                    </Tooltip>
                  )}
                  {isAdmin && (
                    <button
                      aria-label={`Delete column ${col.name}`}
                      onClick={async () => {
                        if (
                          colTasks.length === 0 ||
                          (await confirm(`Delete "${col.name}" and its ${colTasks.length} tasks?`))
                        )
                          api.delete(`/columns/${col.id}`).then(load);
                      }}
                      className="anim-hover cursor-pointer rounded p-1 text-ink-soft opacity-0 hover:text-pen-red group-hover/col:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </span>
              </header>

              <div className="-m-1 flex flex-col gap-2 overflow-y-auto p-1">
                {colTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    tags={tags}
                    isDragging={dragging?.taskId === task.id}
                    dragHandleProps={canWrite || role === "checker" ? dragProps(task.id, col.id) : {}}
                    onDoubleClick={(e) => canWrite && setEditing({ task, anchor: anchorFromEvent(e) })}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const anchor = anchorFromEvent(e);
                      if (menuItems(task, anchor).length)
                        setMenu({ x: e.clientX, y: e.clientY, task, anchor });
                    }}
                  />
                ))}
              </div>

              {canWrite &&
                (addingTo === col.id ? (
                  <div className="mt-2">
                    <QuickAddTask
                      tags={tags}
                      members={members}
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
                ))}
            </section>
          );
        })}

        {isAdmin && (
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
        )}
      </div>

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
          onDone={() => {
            setEditing(null);
            load();
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {colMenu && (
        <ContextMenu
          x={colMenu.x}
          y={colMenu.y}
          items={[
            {
              label: "Add task",
              icon: <Plus size={14} />,
              onClick: () => setAddingTo(colMenu.columnId),
            },
          ]}
          onClose={() => setColMenu(null)}
        />
      )}
    </div>
  );
}
