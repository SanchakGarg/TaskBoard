import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { api } from "../../lib/api";
import { Button, Input } from "../ui";
import { Lightbulb } from "../../illustrations";

export default function DailyFocusWidget() {
  const [goal, setGoal] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    api.get<{ goal: string }>("/focus").then((f) => setGoal(f.goal));
  }, []);

  const save = async () => {
    await api.put("/focus", { goal: draft.trim() });
    setGoal(draft.trim());
    setEditing(false);
  };

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="flex gap-2"
      >
        <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Today's goal…" />
        <Button type="submit" size="sm">
          Set
        </Button>
      </form>
    );
  }

  return (
    <button
      onClick={() => {
        setDraft(goal);
        setEditing(true);
      }}
      className="group flex w-full cursor-pointer items-center gap-3 text-left"
    >
      <Lightbulb size={34} className={`shrink-0 ${goal ? "anim-float text-pen-amber" : "text-ink-soft/50"}`} />
      <span className={`font-hand text-lg ${goal ? "" : "text-ink-soft"}`}>
        {goal || "What's your one goal for today?"}
      </span>
      <Pencil size={14} className="ml-auto shrink-0 text-ink-soft opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
    </button>
  );
}
