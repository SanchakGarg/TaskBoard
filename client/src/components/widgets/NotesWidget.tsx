import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import type { Note } from "../../lib/types";

export default function NotesWidget() {
  const [notes, setNotes] = useState<Note[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    api.get<Note[]>("/notes").then(setNotes);
  }, []);

  const add = async () => {
    const note = await api.post<Note>("/notes", { content: "" });
    setNotes((n) => [...n, note]);
  };

  const edit = (id: string, content: string) => {
    setNotes((n) => n.map((x) => (x.id === id ? { ...x, content } : x)));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => api.patch(`/notes/${id}`, { content }), 600);
  };

  const remove = (id: string) => {
    api.delete(`/notes/${id}`);
    setNotes((n) => n.filter((x) => x.id !== id));
  };

  return (
    <div className="flex flex-col gap-3">
      {notes.map((note, i) => (
        <div
          key={note.id}
          className="sticky-note group relative rounded-sm p-3"
          style={{ transform: `rotate(${i % 2 ? 0.8 : -0.8}deg)` }}
        >
          <textarea
            value={note.content}
            onChange={(e) => edit(note.id, e.target.value)}
            placeholder="Jot something down…"
            rows={3}
            className="font-hand w-full resize-none bg-transparent text-sm outline-none placeholder:text-ink-soft/50"
          />
          <button
            onClick={() => remove(note.id)}
            aria-label="Delete note"
            className="anim-hover absolute right-1.5 top-1.5 cursor-pointer rounded p-0.5 text-ink-soft opacity-0 hover:text-pen-red group-hover:opacity-100"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button
        onClick={add}
        className="anim-hover flex cursor-pointer items-center justify-center gap-1 rounded-lg border-2 border-dashed border-ink/30 py-1.5 text-sm text-ink-soft hover:border-ink hover:text-ink"
      >
        <Plus size={14} /> New note
      </button>
    </div>
  );
}
