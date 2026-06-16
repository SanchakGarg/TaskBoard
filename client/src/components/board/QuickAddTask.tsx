import { useEffect, useRef, useState } from "react";
import type { Member, Priority, TagDef } from "../../lib/types";
import { Avatar, Button, DatePicker, Input } from "../ui";
import { AssigneePicker, PriorityPicker, Removable, TagBadge, TagPicker } from "./pickers";
import { ProgressInput } from "./ProgressInput";

interface QuickAddTaskProps {
  onCreate: (data: {
    title: string;
    description: string;
    dueDate?: string;
    tags: string[];
    priority: Priority;
    progress: number;
    assignees: string[];
    externalAssignees: string[];
  }) => Promise<void>;
  onCancel: () => void;
  tags?: TagDef[]; // workspace tag registry (empty for personal tasks)
  members?: Member[]; // workspace members for assignment
}

export function QuickAddTask({ onCreate, onCancel, tags = [], members = [] }: QuickAddTaskProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Priority>("low");
  const [progress, setProgress] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [externalAssignees, setExternalAssignees] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const canSubmit = !!title.trim() && !submitting;

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element;
      // clicks inside portaled picker menus are not "outside" the form
      if (target.closest?.("[data-popover]")) return;
      if (!formRef.current?.contains(target)) onCancel();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [onCancel]);

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onCreate({
        title: title.trim(),
        description: description.trim(),
        dueDate: dueDate || undefined,
        tags: selectedTags,
        priority,
        progress,
        assignees,
        externalAssignees,
      });
      // onCreate is expected to call onCancel / close from the parent after success
    } finally {
      setSubmitting(false);
    }
  };

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

      <textarea
        placeholder="Description…"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full resize-none border-none bg-transparent px-1 py-0 text-sm text-ink-soft outline-none placeholder:text-ink-soft/40"
        rows={2}
      />

      {/* calendar + priority above */}
      <div className="flex items-center gap-1">
        <DatePicker value={dueDate} onChange={setDueDate} compact />
        <PriorityPicker value={priority} onChange={setPriority} />
        <Button
          type="submit"
          size="sm"
          className="ml-auto !px-3 !py-0.5"
          disabled={!canSubmit}
        >
          {submitting ? "Adding…" : "Add"}
        </Button>
      </div>

      <ProgressInput value={progress} onChange={setProgress} compact />

      {/* tags row, pushed bottom right: chips with hover ✕, plus to add more */}
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {selectedTags.map((t) => (
          <Removable key={t} onRemove={() => setSelectedTags(selectedTags.filter((x) => x !== t))}>
            <TagBadge name={t} tags={tags} />
          </Removable>
        ))}
        <TagPicker selected={selectedTags} onChange={setSelectedTags} available={tags} />
      </div>

      {/* assignees row below, same style */}
      {(members.length > 0 || externalAssignees.length > 0) && (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {assignees.map((id) => {
            const m = members.find((x) => x.id === id);
            if (!m) return null;
            return (
              <Removable key={id} onRemove={() => setAssignees(assignees.filter((x) => x !== id))}>
                <span title={m.name}>
                  <Avatar name={m.name} src={m.avatar_url || undefined} size={24} />
                </span>
              </Removable>
            );
          })}
          {externalAssignees.map((name) => (
            <Removable key={name} onRemove={() => setExternalAssignees(externalAssignees.filter((x) => x !== name))}>
              <span title={`${name} (Guest)`}>
                <Avatar name={name} size={24} />
              </span>
            </Removable>
          ))}
          <AssigneePicker
            selected={assignees}
            onChange={setAssignees}
            externalSelected={externalAssignees}
            onExternalChange={setExternalAssignees}
            members={members}
          />
        </div>
      )}
    </form>
  );
}
