import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { Task } from "../../lib/types";
import { Rocket } from "../../illustrations";

export default function SprintWidget() {
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    api.get<Task[]>("/tasks/mine").then(setTasks);
  }, []);

  const total = tasks.length;
  const done = tasks.filter((t) => t.completed_at).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div>
      <div className="relative h-14">
        {/* dashed track */}
        <svg viewBox="0 0 100 4" preserveAspectRatio="none" className="absolute bottom-2 h-1 w-full text-ink-soft/40">
          <path d="M0 2 L100 2" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" fill="none" />
        </svg>
        <Rocket
          size={36}
          className="anim-float absolute bottom-0 rotate-45 text-pen-red transition-[left] duration-700 ease-out"
          // rocket flies along the track as completion grows
          // (inline style because the position is data-driven)
          {...{ style: { left: `calc(${pct}% - 18px)` } }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-sm">
        <span className="text-ink-soft">Start</span>
        <span className="font-hand text-lg font-bold text-pen-blue">{pct}%</span>
        <span className="text-ink-soft">Goal 🏁</span>
      </div>
      <p className="text-center text-xs text-ink-soft">
        {done} of {total} tasks complete
      </p>
    </div>
  );
}
