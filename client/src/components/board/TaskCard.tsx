import { Clock, Flag } from "lucide-react";
import { Badge, priorityTone } from "../ui";
import { parseTags, type TagDef, type Task } from "../../lib/types";
import { AvatarStack, TagBadge } from "./pickers";

const formatDeadline = (iso: string) => {
  const d = new Date(iso);
  const date = d.toISOString().slice(0, 10);
  const time = d.toTimeString().slice(0, 5);
  return time === "00:00" ? date : `${date} ${time}`;
};

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
  const hasTime = task.due_date && !task.due_date.endsWith("T00:00:00.000Z");

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
              {formatDeadline(task.due_date)}
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
