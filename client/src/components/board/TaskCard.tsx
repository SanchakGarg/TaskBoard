import { CalendarDays, Flag } from "lucide-react";
import { Badge, priorityTone } from "../ui";
import { parseTags, type TagDef, type Task } from "../../lib/types";
import { AvatarStack, TagBadge } from "./pickers";

interface TaskCardProps {
  task: Task;
  tags?: TagDef[];
  isDragging?: boolean;
  dragHandleProps?: Record<string, unknown>;
  onDoubleClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export function TaskCard({
  task,
  tags = [],
  isDragging = false,
  dragHandleProps = {},
  onDoubleClick,
  onContextMenu,
}: TaskCardProps) {
  const taskTags = parseTags(task.tags);
  const overdue = !task.completed_at && !!task.due_date && task.due_date < today();
  const dueToday = !task.completed_at && task.due_date === today();

  return (
    <div
      {...dragHandleProps}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className={`anim-lift-card cursor-pointer select-none rounded-lg border-2 border-ink/70 bg-paper p-3 shadow-card ${isDragging ? "dragging" : ""} ${task.completed_at ? "opacity-60" : ""}`}
    >
      {/* tags live top-right in their workspace colors */}
      {taskTags.length > 0 && (
        <div className="mb-1.5 flex flex-wrap justify-end gap-1">
          {taskTags.map((t) => (
            <TagBadge key={t} name={t} tags={tags} />
          ))}
        </div>
      )}

      <p className={`font-medium ${task.completed_at ? "line-through" : ""}`}>{task.title}</p>

      {(task.due_date || task.priority !== "low" || (task.assignees?.length ?? 0) > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {task.priority !== "low" && (
            <Badge tone={priorityTone[task.priority]}>
              <Flag size={10} />
              {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
            </Badge>
          )}
          {task.due_date && (
            <Badge tone={overdue ? "red" : dueToday ? "amber" : "neutral"}>
              <CalendarDays size={11} />
              {overdue ? `Overdue · ${task.due_date}` : task.due_date}
            </Badge>
          )}
          <span className="ml-auto">
            <AvatarStack assignees={task.assignees ?? []} />
          </span>
        </div>
      )}
    </div>
  );
}
