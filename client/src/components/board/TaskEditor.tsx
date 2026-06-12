import { useState } from "react";
import { createPortal } from "react-dom";
import { Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { parseTags, type Member, type Priority, type TagDef, type Task } from "../../lib/types";
import { Button, DatePicker, Input, Textarea, useConfirm } from "../ui";
import { AssigneePicker, PriorityPicker, TagPicker } from "./pickers";

export interface EditorAnchor {
  left: number;
  top: number;
  width: number;
}

export const anchorFromEvent = (e: React.MouseEvent): EditorAnchor => {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width };
};

interface TaskEditorProps {
  task: Task;
  anchor: EditorAnchor;
  tags?: TagDef[];
  members?: Member[];
  canDelete?: boolean;
  onDone: () => void; // saved/deleted — reload
  onCancel: () => void;
}

// Expanding editor overlaid on top of the card — portaled so it can
// spill outside the column instead of being clipped by it.
export function TaskEditor({
  task,
  anchor,
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

  // wide enough to be usable, clamped to the viewport
  const width = Math.min(Math.max(anchor.width, 380), window.innerWidth - 16);
  const left = Math.min(Math.max(8, anchor.left), window.innerWidth - width - 8);
  const top = Math.min(Math.max(8, anchor.top), Math.max(8, window.innerHeight - 360));

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-ink/10" onMouseDown={onCancel} />
      <div
        style={{ position: "fixed", left, top, width, zIndex: 50 }}
        className="anim-modal flex max-h-[85vh] flex-col gap-2 overflow-y-auto rounded-lg border-2 border-pen-blue bg-paper p-3 shadow-card-lift"
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
    </>,
    document.body
  );
}
