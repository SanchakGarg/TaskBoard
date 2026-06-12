import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { parseTags, type Priority, type Task } from "../../lib/types";
import { Badge, Button, Checkbox, Divider, Dropdown, Input, Modal, Textarea } from "../ui";

const priorityOptions: { value: Priority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

interface TaskModalProps {
  task: Task | null;
  onClose: () => void;
  onChanged: () => void;
}

export function TaskModal({ task, onClose, onChanged }: TaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [completed, setCompleted] = useState(false);
  const [savedTags, setSavedTags] = useState<string[]>([]);
  const [tagFocus, setTagFocus] = useState(false);

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description);
    setPriority(task.priority);
    setDueDate(task.due_date ?? "");
    setTags(parseTags(task.tags));
    setCompleted(!!task.completed_at);
    setTagInput("");
    api.get<string[]>("/tags").then(setSavedTags);
  }, [task]);

  if (!task) return null;

  const save = async () => {
    await api.patch(`/tasks/${task.id}`, {
      title: title.trim() || task.title,
      description,
      priority,
      dueDate: dueDate || null,
      tags,
      completed,
    });
    onChanged();
  };

  const remove = async () => {
    if (!confirm(`Delete task "${task.title}"?`)) return;
    await api.delete(`/tasks/${task.id}`);
    onChanged();
  };

  const addTag = (value = tagInput) => {
    const t = value.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  };

  const suggestions = savedTags.filter(
    (t) => !tags.includes(t) && t.toLowerCase().includes(tagInput.trim().toLowerCase())
  );

  return (
    <Modal open onClose={onClose} title="Task" wide>
      <div className="flex flex-col gap-4">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description — what does done look like?"
          rows={4}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-ink-soft">Priority</label>
            <Dropdown value={priority} options={priorityOptions} onChange={setPriority} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-ink-soft">Due date</label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm text-ink-soft">Tags</label>
          <div className="flex flex-wrap items-center gap-1.5">
            {tags.map((t) => (
              <button key={t} onClick={() => setTags(tags.filter((x) => x !== t))} className="cursor-pointer">
                <Badge tone="blue">{t} ✕</Badge>
              </button>
            ))}
            <span className="relative">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onFocus={() => setTagFocus(true)}
                onBlur={() => setTimeout(() => setTagFocus(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Add tag, press Enter"
                className="!w-44"
              />
              {tagFocus && suggestions.length > 0 && (
                <span className="anim-modal absolute left-0 top-full z-20 mt-1 flex max-h-36 w-44 flex-col overflow-y-auto rounded-lg border-2 border-ink bg-paper shadow-card">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addTag(s);
                      }}
                      className="anim-hover cursor-pointer px-3 py-1.5 text-left text-sm hover:bg-paper-dark"
                    >
                      {s}
                    </button>
                  ))}
                </span>
              )}
            </span>
          </div>
        </div>

        <Checkbox checked={completed} onChange={setCompleted} label="Completed" />

        <Divider />

        <div className="flex items-center justify-between">
          <Button variant="danger" size="sm" onClick={remove}>
            <Trash2 size={15} /> Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save}>Save</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
