import { useCallback, useEffect, useState } from "react";
import { Clock, Flag, Pencil, Plus, Trash2 } from "lucide-react";
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
import { TaskEditor, anchorFromEvent, type EditorAnchor } from "./TaskEditor";
import { QuickAddTask } from "./QuickAddTask";
import { CompletedSection } from "./CompletedSection";
import { AvatarStack, TagBadge } from "./pickers";

const pad = (n: number) => String(n).padStart(2, "0");
const formatDeadline = (iso: string) => {
  const d = new Date(iso);
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return time === "00:00" ? date : `${date} ${time}`;
};

interface ListBoardProps {
  projectId: string;
  role: Role;
  publicData?: { project: any; columns: Column[]; tasks: Task[] } | null;
}

// Single-list view for projects created as "list". Completion stays a checkbox here.
export function ListBoard({ projectId, role, publicData }: ListBoardProps) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tags, setTags] = useState<TagDef[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [editing, setEditing] = useState<{ task: Task; anchor: EditorAnchor } | null>(null);
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    task: Task;
    anchor: EditorAnchor;
  } | null>(null);
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
      items.push({
        label: "Edit task",
        icon: <Pencil size={14} />,
        onClick: () => setEditing({ task, anchor }),
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

  const row = (t: Task) => {
    return (
      <li
        key={t.id}
        onDoubleClick={(e) =>
          canWrite && setEditing({ task: t, anchor: anchorFromEvent(e) })
        }
        onContextMenu={(e) => {
          e.preventDefault();
          const anchor = anchorFromEvent(e);
          if (menuItems(t, anchor).length)
            setMenu({ x: e.clientX, y: e.clientY, task: t, anchor });
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
          {(() => {
             if (!t.due_date) return null;
             const d = new Date(t.due_date);
             const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
             return (
               <Badge tone={hasTime ? "red" : "blue"}>
                 <Clock size={11} />
                 {formatDeadline(t.due_date)}
               </Badge>
             );
          })()}
          <AvatarStack assignees={t.assignees ?? []} />
        </span>
      </li>
    );
  };

  if (isInitialLoad && columns.length === 0) {
    return (
      <div className="mx-auto min-h-full w-full max-w-3xl p-3 sm:p-5">
        <div className="flex flex-col gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 w-full rounded-lg border-2 border-ink/10 bg-paper/50 animate-pulse"></div>
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
                // background refresh
                if (!publicData) load().catch(() => {});
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
