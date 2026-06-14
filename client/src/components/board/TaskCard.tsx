import { Clock, Flag } from "lucide-react";
import { Badge, priorityTone } from "../ui";
import { formatIST, parseTags, type TagDef, type Task } from "../../lib/types";
import { AvatarStack, TagBadge } from "./pickers";

interface TaskCardProps {
  task: Task;
  tags?: TagDef[];
  isDragging?: boolean;
  dragHandleProps?: Record<string, unknown>;
  onDoubleClick: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function TaskCard({
  task,
  tags = [],
  isDragging = false,
  dragHandleProps = {},
  onDoubleClick,
  onContextMenu,
}: TaskCardProps) {
  const taskTags = parseTags(task.tags);
  const d = task.due_date ? new Date(task.due_date) : null;
  const hasTime = d && (d.getHours() !== 0 || d.getMinutes() !== 0);

  return (
    <div
      {...dragHandleProps}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className={`anim-lift-card cursor-pointer select-none rounded-lg border-2 border-ink/70 bg-paper p-3 shadow-card ${isDragging ? "dragging" : ""} ${task.completed_at ? "opacity-60" : ""}`}
    >
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
            <Badge tone={hasTime ? "red" : "blue"}>
              <Clock size={11} />
              {formatIST(task.due_date)}
            </Badge>
          )}
          <span className="ml-auto">
            <AvatarStack assignees={task.assignees ?? []} />
          </span>
        </div>
      )}

      {/* tags live in their own row, bottom right */}
      {taskTags.length > 0 && (
        <div className="mt-2 flex flex-wrap justify-end gap-1">
          {taskTags.map((t) => (
            <TagBadge key={t} name={t} tags={tags} />
          ))}
        </div>
      )}
    </div>
  );
}
