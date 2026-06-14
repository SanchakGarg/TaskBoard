import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import type { Milestone, Project } from "../../lib/types";
import { Dropdown, Input } from "../ui";

export default function MilestonesWidget() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [adding, setAdding] = useState("");

  useEffect(() => {
    api.get<Project[]>("/projects").then((p) => {
      setProjects(p);
      if (p.length) setProjectId(p[0].id);
    });
  }, []);

  const load = useCallback(() => {
    if (projectId !== null)
      api.get<Milestone[]>(`/projects/${projectId}/milestones`).then(setMilestones);
  }, [projectId]);

  useEffect(load, [load]);

  if (!projects.length) return <p className="text-sm text-ink-soft">Create a project first.</p>;

  const toggle = (m: Milestone) => {
    setMilestones((prev) => prev.map((x) => (x.id === m.id ? { ...x, done: x.done ? 0 : 1 } : x)));
    api.patch(`/milestones/${m.id}`, { done: !m.done }).catch(load);
  };

  const add = async () => {
    const title = adding.trim();
    if (!title || projectId === null) return;
    const tempId = "temp-" + Math.random();
    const newM: Milestone = { id: tempId, project_id: projectId, title, done: 0, position: milestones.length, due_date: null };
    setMilestones((prev) => [...prev, newM]);
    setAdding("");
    try {
      await api.post(`/projects/${projectId}/milestones`, { title });
      load();
    } catch {
      load();
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {projects.length > 1 && (
        <Dropdown
          value={projectId ?? ""}
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
          onChange={setProjectId}
        />
      )}

      <ul className="flex flex-col gap-1">
        {milestones.map((m) => (
          <li key={m.id} className="group flex items-center gap-2">
            <button
              onClick={() => toggle(m)}
              className={`anim-hover cursor-pointer font-hand text-lg ${m.done ? "text-pen-green" : "text-ink-soft"}`}
              aria-label={m.done ? "Mark not done" : "Mark done"}
            >
              {m.done ? "✓" : "○"}
            </button>
            <span className={m.done ? "text-ink-soft line-through" : ""}>{m.title}</span>
            <button
              onClick={() => {
                setMilestones((prev) => prev.filter((x) => x.id !== m.id));
                api.delete(`/milestones/${m.id}`).catch(load);
              }}
              aria-label="Delete milestone"
              className="anim-hover ml-auto cursor-pointer rounded p-0.5 text-ink-soft opacity-0 hover:text-pen-red group-hover:opacity-100"
            >
              <Trash2 size={13} />
            </button>
          </li>
        ))}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="flex items-center gap-1.5"
      >
        <Plus size={14} className="shrink-0 text-ink-soft" />
        <Input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          placeholder="New milestone…"
          className="!border-transparent !px-1 !py-1 text-sm"
        />
      </form>
    </div>
  );
}
