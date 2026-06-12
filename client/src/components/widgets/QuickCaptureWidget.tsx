import { useState } from "react";
import { Zap } from "lucide-react";
import { api } from "../../lib/api";
import type { Column, Project } from "../../lib/types";
import { Input } from "../ui";

// One-click idea dumping: creates a task in the first column of your first project.
export default function QuickCaptureWidget() {
  const [text, setText] = useState("");
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState("");

  const capture = async () => {
    const title = text.trim();
    if (!title) return;
    const projects = await api.get<Project[]>("/projects");
    if (!projects.length) {
      setError("Create a project first.");
      return;
    }
    const board = await api.get<{ columns: Column[] }>(`/projects/${projects[0].id}/board`);
    if (!board.columns.length) {
      setError("Your first project has no columns.");
      return;
    }
    await api.post("/tasks", { columnId: board.columns[0].id, title });
    setText("");
    setError("");
    setFlash(true);
    setTimeout(() => setFlash(false), 400);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        capture();
      }}
    >
      <div className={`flex items-center gap-2 ${flash ? "anim-success" : ""}`}>
        <Zap size={18} className="shrink-0 text-pen-amber" />
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type anything, press Enter…"
        />
      </div>
      {error && <p className="mt-1 text-xs text-pen-red">{error}</p>}
    </form>
  );
}
