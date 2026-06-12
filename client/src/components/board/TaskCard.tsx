import { CalendarDays } from "lucide-react";
import { Badge, priorityTone } from "../ui";
import { parseTags, type Task } from "../../lib/types";

interface TaskCardProps {
  task: Task;
  isDragging: boolean;
  dragHandleProps: Record<string, unknown>;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

const isOverdue = (due: string | null) =>
  !!due && new Date(due + "T23:59:59") < new Date();

// card tint follows priority
const priorityCard: Record<Task["priority"], string> = {
  urgent: "border-pen-red bg-pen-red/10",
  high: "border-pen-amber bg-pen-amber/10",
  medium: "border-ink/70 bg-paper",
  low: "border-ink/35 bg-paper",
};

export function TaskCard({
  task,
  isDragging,
  dragHandleProps,
  onClick,
  onContextMenu,
}: TaskCardProps) {
  const tags = parseTags(task.tags);

  return (
    <div
      {...dragHandleProps}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`anim-lift-card cursor-pointer rounded-lg border-2 p-3 shadow-card ${priorityCard[task.priority]} ${isDragging ? "dragging" : ""} ${task.completed_at ? "opacity-60" : ""}`}
    >
      <p className={`font-medium ${task.completed_at ? "line-through" : ""}`}>{task.title}</p>

      {(tags.length > 0 || task.due_date || task.priority !== "medium") && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {task.priority !== "medium" && (
            <Badge tone={priorityTone[task.priority]}>{task.priority}</Badge>
          )}
          {task.due_date && (
            <Badge tone={isOverdue(task.due_date) && !task.completed_at ? "red" : "neutral"}>
              <CalendarDays size={11} />
              {task.due_date}
            </Badge>
          )}
          {tags.map((t) => (
            <Badge key={t} tone="blue">
              {t}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
