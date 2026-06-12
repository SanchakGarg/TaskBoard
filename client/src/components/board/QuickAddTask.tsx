import { useEffect, useRef, useState } from "react";
import { CalendarDays, Plus, Tag } from "lucide-react";
import { api } from "../../lib/api";
import { Badge, Button, Input } from "../ui";

interface QuickAddTaskProps {
  onCreate: (data: { title: string; dueDate?: string; tags: string[] }) => Promise<void>;
  onCancel: () => void;
}

export function QuickAddTask({ onCreate, onCancel }: QuickAddTaskProps) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [showDate, setShowDate] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagOpen, setTagOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [savedTags, setSavedTags] = useState<string[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    api.get<string[]>("/tags").then(setSavedTags);
  }, []);

  // close when clicking outside the whole form
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!formRef.current?.contains(e.target as Node)) onCancel();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [onCancel]);

  const submit = async () => {
    const t = title.trim();
    if (!t) return;
    await onCreate({ title: t, dueDate: dueDate || undefined, tags });
    setTitle("");
    setDueDate("");
    setTags([]);
    setTagInput("");
  };

  const addTag = (value: string) => {
    const t = value.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  };

  const suggestions = savedTags.filter(
    (t) => !tags.includes(t) && t.toLowerCase().includes(tagInput.trim().toLowerCase())
  );

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-2 rounded-lg border-2 border-ink/40 bg-paper p-2"
    >
      <Input
        autoFocus
        placeholder="Task title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        className="!border-transparent !px-1 !py-1"
      />

      {(tags.length > 0 || dueDate) && (
        <div className="flex flex-wrap items-center gap-1">
          {tags.map((t) => (
            <button key={t} type="button" onClick={() => setTags(tags.filter((x) => x !== t))} className="cursor-pointer">
              <Badge tone="blue">{t} ✕</Badge>
            </button>
          ))}
          {dueDate && (
            <button type="button" onClick={() => setDueDate("")} className="cursor-pointer">
              <Badge tone="neutral">
                <CalendarDays size={11} />
                {dueDate} ✕
              </Badge>
            </button>
          )}
        </div>
      )}

      {tagOpen && (
        <span className="relative">
          <Input
            autoFocus
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag(tagInput);
              }
              if (e.key === "Escape") setTagOpen(false);
            }}
            placeholder="Tag name…"
            className="!py-1 text-sm"
          />
          {suggestions.length > 0 && (
            <span className="anim-modal absolute left-0 top-full z-20 mt-1 flex max-h-32 w-full flex-col overflow-y-auto rounded-lg border-2 border-ink bg-paper shadow-card">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addTag(s);
                  }}
                  className="anim-hover cursor-pointer px-3 py-1 text-left text-sm hover:bg-paper-dark"
                >
                  {s}
                </button>
              ))}
            </span>
          )}
        </span>
      )}

      {showDate && (
        <Input
          type="date"
          value={dueDate}
          onChange={(e) => {
            setDueDate(e.target.value);
            setShowDate(false);
          }}
          className="!py-1 text-sm"
        />
      )}

      <div className="flex items-center gap-1">
        <button
          type="button"
          title="Add tag"
          onClick={() => setTagOpen((v) => !v)}
          className={`anim-hover flex cursor-pointer items-center gap-0.5 rounded-md border border-ink-soft/40 px-1.5 py-0.5 text-xs text-ink-soft hover:border-ink hover:text-ink ${tagOpen ? "bg-paper-dark" : ""}`}
        >
          <Plus size={11} />
          <Tag size={11} />
        </button>
        <button
          type="button"
          title="Set due date"
          onClick={() => setShowDate((v) => !v)}
          className={`anim-hover flex cursor-pointer items-center gap-0.5 rounded-md border border-ink-soft/40 px-1.5 py-0.5 text-xs text-ink-soft hover:border-ink hover:text-ink ${showDate ? "bg-paper-dark" : ""}`}
        >
          <Plus size={11} />
          <CalendarDays size={11} />
        </button>
        <Button type="submit" size="sm" className="ml-auto !px-3 !py-0.5" disabled={!title.trim()}>
          Add
        </Button>
      </div>
    </form>
  );
}
