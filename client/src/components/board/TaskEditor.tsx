import { useState } from "react";
import { Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { parseTags, type Member, type Priority, type TagDef, type Task } from "../../lib/types";
import { Button, DatePicker, Input, Textarea, useConfirm } from "../ui";
import { AssigneePicker, PriorityPicker, TagPicker } from "./pickers";

interface TaskEditorProps {
  task: Task;
  tags?: TagDef[];
  members?: Member[];
  canDelete?: boolean;
  onDone: () => void; // saved/deleted — reload
  onCancel: () => void;
}

// In-place expanding editor — replaces the old popup modal.
export function TaskEditor({
  task,
  tags = [],
  members = [],
  canDelete = true,
  onDone,
  onCancel,
}: TaskEditorProps) {
  const confirm = useConfirm();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [selectedTags, setSelectedTags] = useState<string[]>(parseTags(task.tags));
  const [assignees, setAssignees] = useState<number[]>(task.assignees?.map((a) => a.id) ?? []);

  const save = async () => {
    await api.patch(`/tasks/${task.id}`, {
      title: title.trim() || task.title,
      description,
      priority,
      dueDate: dueDate || null,
      tags: selectedTags,
      assignees,
    });
    onDone();
  };

  const remove = async () => {
    if (!(await confirm(`Delete task "${task.title}"?`))) return;
    await api.delete(`/tasks/${task.id}`);
    onDone();
  };

  return (
    <div
      className="anim-modal flex flex-col gap-2 rounded-lg border-2 border-pen-blue bg-paper p-3 shadow-card-lift"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
    >
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="!py-1 font-medium"
      />
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description…"
        rows={3}
        className="!py-1 text-sm"
      />
      <div className="flex flex-wrap items-center gap-1">
        <TagPicker selected={selectedTags} onChange={setSelectedTags} available={tags} />
        <DatePicker value={dueDate} onChange={setDueDate} compact />
        <PriorityPicker value={priority} onChange={setPriority} />
        {members.length > 0 && (
          <AssigneePicker selected={assignees} onChange={setAssignees} members={members} />
        )}
      </div>
      <div className="flex items-center gap-2 pt-1">
        {canDelete && (
          <Button variant="danger" size="sm" onClick={remove} className="!px-2 !py-0.5">
            <Trash2 size={13} />
          </Button>
        )}
        <Button variant="ghost" size="sm" className="ml-auto !px-3 !py-0.5" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" className="!px-3 !py-0.5" onClick={save}>
          Save
        </Button>
      </div>
    </div>
  );
}
