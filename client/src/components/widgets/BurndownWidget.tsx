import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { Task } from "../../lib/types";

const DAYS = 14;

// Hand-rolled SVG line chart: open tasks remaining per day. No chart library.
export default function BurndownWidget() {
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    api.get<Task[]>("/tasks/mine").then(setTasks);
  }, []);

  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (DAYS - 1 - i));
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });

  // tasks that existed by end of `day` and weren't completed by then
  const remaining = days.map(
    (day) =>
      tasks.filter(
        (t) =>
          t.created_at.slice(0, 10) <= day &&
          (!t.completed_at || t.completed_at.slice(0, 10) > day)
      ).length
  );

  const max = Math.max(...remaining, 1);
  const W = 200;
  const H = 70;
  const points = remaining
    .map((r, i) => `${(i / (DAYS - 1)) * W},${H - (r / max) * (H - 8) - 4}`)
    .join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <line x1="0" y1={H - 1} x2={W} y2={H - 1} stroke="var(--color-ink-soft)" strokeWidth="1" opacity="0.3" />
        <polyline
          points={points}
          fill="none"
          stroke="var(--color-pen-blue)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex justify-between text-xs text-ink-soft">
        <span>{DAYS} days ago</span>
        <span>
          {remaining[DAYS - 1]} task{remaining[DAYS - 1] === 1 ? "" : "s"} remaining
        </span>
      </div>
    </div>
  );
}
