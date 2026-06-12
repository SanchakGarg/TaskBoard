import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { Task } from "../../lib/types";
import { Badge, priorityTone } from "../ui";

const today = () => new Date().toISOString().slice(0, 10);

export default function MyTasksWidget() {
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    api.get<Task[]>("/tasks/mine").then(setTasks);
  }, []);

  const open = tasks.filter((t) => !t.completed_at);
  const dueToday = open.filter((t) => t.due_date === today());
  const overdue = open.filter((t) => t.due_date && t.due_date < today());
  const upcoming = open.filter((t) => t.due_date && t.due_date > today());

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Due today" value={dueToday.length} tone="text-pen-amber" />
        <Stat label="Overdue" value={overdue.length} tone="text-pen-red" />
        <Stat label="Upcoming" value={upcoming.length} tone="text-pen-blue" />
      </div>
      <ul className="flex flex-col gap-1.5">
        {[...overdue, ...dueToday, ...upcoming].slice(0, 5).map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate">{t.title}</span>
            <Badge tone={priorityTone[t.priority]}>{t.due_date}</Badge>
          </li>
        ))}
        {open.length === 0 && <li className="font-hand text-sm text-ink-soft">All clear! ✨</li>}
      </ul>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg bg-paper-dark/60 py-2">
      <div className={`font-hand text-2xl font-bold ${tone}`}>{value}</div>
      <div className="text-xs text-ink-soft">{label}</div>
    </div>
  );
}
