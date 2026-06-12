import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { Project, Task } from "../../lib/types";

export default function StatsWidget() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    api.get<Task[]>("/tasks/mine").then(setTasks);
    api.get<Project[]>("/projects").then(setProjects);
  }, []);

  const done = tasks.filter((t) => t.completed_at).length;
  const urgent = tasks.filter((t) => !t.completed_at && t.priority === "urgent").length;

  const counters = [
    { label: "Projects", value: projects.length },
    { label: "Tasks", value: tasks.length },
    { label: "Done", value: done },
    { label: "Urgent", value: urgent },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {counters.map((c) => (
        <div key={c.label} className="sketch-border bg-paper px-3 py-2 text-center">
          <div className="font-hand text-2xl font-bold">{c.value}</div>
          <div className="text-xs text-ink-soft">{c.label}</div>
        </div>
      ))}
    </div>
  );
}
