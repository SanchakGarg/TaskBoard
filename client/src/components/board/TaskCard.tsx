import { useState } from "react";
import { Clock, Flag, ChevronDown, ChevronUp } from "lucide-react";
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
  const [expanded, setExpanded] = useState(false);
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

      {task.description && (
        <div 
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="group/desc relative mt-1"
        >
          <p className={`text-xs text-ink-soft whitespace-pre-wrap ${expanded ? "" : "line-clamp-3"}`}>
            {task.description}
          </p>
          {task.description.split("\n").length > 3 || task.description.length > 100 ? (
            <div className="absolute -right-1 -top-1 opacity-0 group-hover/desc:opacity-100 transition-opacity">
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </div>
          ) : null}
        </div>
      )}

      {(task.progress ?? 0) > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <div className="h-2 min-w-0 flex-1 rounded-full border border-ink-soft/30 bg-paper-dark">
            <div
              className="h-full rounded-full bg-pen-blue"
              style={{ width: `${Math.max(0, Math.min(100, task.progress ?? 0))}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-pen-blue">{task.progress}%</span>
        </div>
      )}

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
