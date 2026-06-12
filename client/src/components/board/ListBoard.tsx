import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Flag, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Badge, Checkbox, ContextMenu, priorityTone, useConfirm, type ContextMenuItem } from "../ui";
import { TaskEditor } from "./TaskEditor";
import { QuickAddTask } from "./QuickAddTask";
import { CompletedSection } from "./CompletedSection";
import { AvatarStack, TagBadge } from "./pickers";

const today = () => new Date().toISOString().slice(0, 10);

interface ListBoardProps {
  projectId: number;
  role: Role;
}

// Single-list view for projects created as "list". Completion stays a checkbox here.
export function ListBoard({ projectId, role }: ListBoardProps) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tags, setTags] = useState<TagDef[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; task: Task } | null>(null);
  const confirm = useConfirm();

  const canWrite = atLeast(role, "write");
  const canComplete = atLeast(role, "checker");

  const load = useCallback(async () => {
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
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const listColumn = columns[0];
  const open = tasks.filter((t) => !t.completed_at).sort((a, b) => a.position - b.position);
  const done = tasks.filter((t) => t.completed_at).sort((a, b) => a.position - b.position);

  const toggleComplete = (t: Task, completed: boolean) =>
    api.patch(`/tasks/${t.id}`, { completed }).then(load);

  const menuItems = (task: Task): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    if (canWrite)
      items.push({ label: "Edit task", icon: <Pencil size={14} />, onClick: () => setEditingId(task.id) });
    if (canWrite)
      items.push({
        label: "Delete",
        icon: <Trash2 size={14} />,
        danger: true,
        onClick: async () => {
          if (await confirm(`Delete task "${task.title}"?`))
            api.delete(`/tasks/${task.id}`).then(load);
        },
      });
    return items;
  };

  const row = (t: Task) => {
    if (editingId === t.id)
      return (
        <li key={t.id}>
          <TaskEditor
            task={t}
            tags={tags}
            members={members}
            onDone={() => {
              setEditingId(null);
              load();
            }}
            onCancel={() => setEditingId(null)}
          />
        </li>
      );
    const overdue = !t.completed_at && !!t.due_date && t.due_date < today();
    const dueToday = !t.completed_at && t.due_date === today();
    return (
      <li
        key={t.id}
        onDoubleClick={() => canWrite && setEditingId(t.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          const items = menuItems(t);
          if (items.length) setMenu({ x: e.clientX, y: e.clientY, task: t });
        }}
        className="anim-lift-card flex cursor-pointer select-none items-center gap-3 rounded-lg border-2 border-ink/70 bg-paper p-3 shadow-card"
      >
        {canComplete && (
          <span onClick={(e) => e.stopPropagation()}>
            <Checkbox checked={!!t.completed_at} onChange={(d) => toggleComplete(t, d)} />
          </span>
        )}
        <span className={`min-w-0 truncate ${t.completed_at ? "text-ink-soft line-through" : ""}`}>
          {t.title}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {parseTags(t.tags)
            .slice(0, 3)
            .map((tag) => (
              <TagBadge key={tag} name={tag} tags={tags} />
            ))}
          {t.priority !== "low" && (
            <Badge tone={priorityTone[t.priority]}>
              <Flag size={10} />
              {t.priority.charAt(0).toUpperCase() + t.priority.slice(1)}
            </Badge>
          )}
          {t.due_date && (
            <Badge tone={overdue ? "red" : dueToday ? "amber" : "neutral"}>
              <CalendarDays size={11} />
              {overdue ? `Overdue · ${t.due_date}` : t.due_date}
            </Badge>
          )}
          <AvatarStack assignees={t.assignees ?? []} />
        </span>
      </li>
    );
  };

  return (
    <div className="mx-auto min-h-full w-full max-w-3xl p-3 sm:p-5">
      {canWrite &&
        (adding && listColumn ? (
          <div className="mb-3">
            <QuickAddTask
              tags={tags}
              members={members}
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
        <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.task)} onClose={() => setMenu(null)} />
      )}
    </div>
  );
}
