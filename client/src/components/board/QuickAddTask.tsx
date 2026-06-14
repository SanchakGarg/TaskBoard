import { useEffect, useRef, useState } from "react";
import type { Member, Priority, TagDef } from "../../lib/types";
import { Avatar, Button, DatePicker, Input } from "../ui";
import { AssigneePicker, PriorityPicker, Removable, TagBadge, TagPicker } from "./pickers";

interface QuickAddTaskProps {
  onCreate: (data: {
    title: string;
    dueDate?: string;
    tags: string[];
    priority: Priority;
    assignees: number[];
  }) => Promise<void>;
  onCancel: () => void;
  tags?: TagDef[]; // workspace tag registry (empty for personal tasks)
  members?: Member[]; // workspace members for assignment
}

export function QuickAddTask({ onCreate, onCancel, tags = [], members = [] }: QuickAddTaskProps) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Priority>("low");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [assignees, setAssignees] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // workspace tasks must be assigned to someone; personal tasks have no members
  const requireAssignee = members.length > 0;
  const canSubmit = !!title.trim() && (!requireAssignee || assignees.length > 0) && !submitting;

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
        dueDate: dueDate || undefined,
        tags: selectedTags,
        priority,
        assignees,
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
      {members.length > 0 && (
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
          <AssigneePicker selected={assignees} onChange={setAssignees} members={members} />
        </div>
      )}

      {requireAssignee && !!title.trim() && assignees.length === 0 && (
        <p className="text-right text-xs text-pen-red">Assign at least one member</p>
      )}
    </form>
  );
}
