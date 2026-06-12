import { useState } from "react";
import { Zap } from "lucide-react";
import { api } from "../../lib/api";
import { Input } from "../ui";

// One-click idea dumping: creates a personal task (visible in My Tasks).
export default function QuickCaptureWidget() {
  const [text, setText] = useState("");
  const [flash, setFlash] = useState(false);

  const capture = async () => {
    const title = text.trim();
    if (!title) return;
    await api.post("/tasks", { title });
    setText("");
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
      <p className="mt-1 text-xs text-ink-soft">Lands in My Tasks as a personal task.</p>
    </form>
  );
}
