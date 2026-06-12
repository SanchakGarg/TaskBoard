import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { Project, Task } from "../../lib/types";

// Open tasks per project as hand-drawn bars — plain divs, no chart library.
export default function WorkloadWidget() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    api.get<Project[]>("/projects").then(setProjects);
    api.get<Task[]>("/tasks/mine").then(setTasks);
  }, []);

  const counts = projects.map((p) => ({
    name: p.name,
    open: tasks.filter((t) => t.project_id === p.id && !t.completed_at).length,
  }));
  const max = Math.max(...counts.map((c) => c.open), 1);
  const colors = ["bg-pen-blue", "bg-pen-red", "bg-pen-green", "bg-pen-amber"];

  if (!projects.length) return <p className="text-sm text-ink-soft">Create a project first.</p>;

  return (
    <div className="flex flex-col gap-2">
      {counts.map((c, i) => (
        <div key={c.name} className="text-sm">
          <div className="flex justify-between">
            <span className="truncate">{c.name}</span>
            <span className="text-ink-soft">{c.open}</span>
          </div>
          <div className="mt-0.5 h-3 rounded-sm bg-paper-dark">
            <div
              className={`h-full rounded-sm ${colors[i % colors.length]} transition-[width] duration-700 ease-out`}
              style={{ width: `${(c.open / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
