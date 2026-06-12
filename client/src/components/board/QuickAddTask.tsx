import { useEffect, useRef, useState } from "react";
import type { Member, Priority, TagDef } from "../../lib/types";
import { Button, DatePicker, Input } from "../ui";
import { AssigneePicker, PriorityPicker, TagPicker } from "./pickers";

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
  const formRef = useRef<HTMLFormElement>(null);

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
    await onCreate({ title: t, dueDate: dueDate || undefined, tags: selectedTags, priority, assignees });
    setTitle("");
    setDueDate("");
    setSelectedTags([]);
    setAssignees([]);
    setPriority("low");
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

      <div className="flex flex-wrap items-center gap-1">
        <TagPicker selected={selectedTags} onChange={setSelectedTags} available={tags} />
        <DatePicker value={dueDate} onChange={setDueDate} compact />
        <PriorityPicker value={priority} onChange={setPriority} />
        {members.length > 0 && (
          <AssigneePicker selected={assignees} onChange={setAssignees} members={members} />
        )}
        <Button type="submit" size="sm" className="ml-auto !px-3 !py-0.5" disabled={!title.trim()}>
          Add
        </Button>
      </div>
    </form>
  );
}
