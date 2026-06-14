import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../../lib/api";
import type { Task } from "../../lib/types";

const pad = (n: number) => String(n).padStart(2, "0");

export default function CalendarWidget() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() };
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    api.get<Task[]>("/tasks/mine").then(setTasks);
  }, []);

  const first = new Date(month.y, month.m, 1);
  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  const startWeekday = (first.getDay() + 6) % 7; // Monday first
  const todayStr = `${new Date().getFullYear()}-${pad(new Date().getMonth() + 1)}-${pad(new Date().getDate())}`;

  const dateStr = (day: number) => `${month.y}-${pad(month.m + 1)}-${pad(day)}`;
  const dueOn = (day: number) => tasks.filter((t) => t.due_date === dateStr(day) && !t.completed_at);

  const shift = (delta: number) => {
    const d = new Date(month.y, month.m + delta, 1);
    setMonth({ y: d.getFullYear(), m: d.getMonth() });
    setSelectedDay(null);
  };

  const agenda = selectedDay ? tasks.filter((t) => t.due_date === selectedDay) : [];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button onClick={() => shift(-1)} aria-label="Previous month" className="anim-hover cursor-pointer rounded p-1 hover:bg-paper-dark">
          <ChevronLeft size={16} />
        </button>
        <span className="font-hand font-bold">
          {first.toLocaleString("default", { month: "long" })} {month.y}
        </span>
        <button onClick={() => shift(1)} aria-label="Next month" className="anim-hover cursor-pointer rounded p-1 hover:bg-paper-dark">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="py-1 text-ink-soft">
            {d}
          </span>
        ))}
        {Array.from({ length: startWeekday }).map((_, i) => (
          <span key={`pad-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const ds = dateStr(day);
          const due = dueOn(day);
          return (
            <button
              key={day}
              onClick={() => setSelectedDay(selectedDay === ds ? null : ds)}
              className={`anim-hover relative cursor-pointer rounded py-1 hover:bg-paper-dark ${ds === todayStr ? "sketch-border font-bold" : ""} ${selectedDay === ds ? "bg-paper-dark" : ""}`}
            >
              {day}
              {due.length > 0 && (
                <span className="absolute bottom-0 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-pen-red" />
              )}
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <ul className="mt-2 border-t-2 border-ink/10 pt-2 text-sm">
          {agenda.length === 0 && <li className="text-ink-soft">Nothing due on {selectedDay}.</li>}
          {agenda.map((t) => (
            <li key={t.id} className={t.completed_at ? "text-ink-soft line-through" : ""}>
              • {t.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
