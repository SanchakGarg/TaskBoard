import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Flag, Tag, UserPlus } from "lucide-react";
import type { Assignee, Member, Priority, TagDef } from "../../lib/types";
import { Avatar, Input } from "../ui";

// ---------- shared popover scaffolding ----------

function Popover({
  trigger,
  open,
  setOpen,
  children,
}: {
  trigger: ReactNode;
  open: boolean;
  setOpen: (v: boolean) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  return (
    <div ref={ref} className="relative inline-block">
      {trigger}
      {open && (
        <div className="anim-modal absolute left-0 top-full z-30 mt-1 w-56 rounded-lg border-2 border-ink bg-paper p-1.5 shadow-card-lift">
          {children}
        </div>
      )}
    </div>
  );
}

const chip = (active: boolean) =>
  `anim-hover flex cursor-pointer items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs ${active ? "border-pen-blue/60 text-pen-blue" : "border-ink-soft/40 text-ink-soft hover:border-ink hover:text-ink"}`;

// ---------- priority dropdown ----------

export const priorities: Priority[] = ["low", "medium", "high", "urgent"];
export const priorityLabel = (p: Priority) => p.charAt(0).toUpperCase() + p.slice(1);
const priorityColor: Record<Priority, string> = {
  low: "text-ink-soft",
  medium: "text-pen-blue",
  high: "text-pen-amber",
  urgent: "text-pen-red",
};

export function PriorityPicker({
  value,
  onChange,
}: {
  value: Priority;
  onChange: (p: Priority) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      setOpen={setOpen}
      trigger={
        <button type="button" onClick={() => setOpen(!open)} className={chip(value !== "low")}>
          <Flag size={11} className={priorityColor[value]} />
          {priorityLabel(value)}
        </button>
      }
    >
      {priorities.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => {
            onChange(p);
            setOpen(false);
          }}
          className={`anim-hover flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-paper-dark ${p === value ? "font-semibold" : ""}`}
        >
          <Flag size={13} className={priorityColor[p]} />
          {priorityLabel(p)}
          {p === value && <Check size={13} className="ml-auto" />}
        </button>
      ))}
    </Popover>
  );
}

// ---------- tag picker (multi-select, stays open) ----------

export function TagPicker({
  selected,
  onChange,
  available,
  allowCreate = true,
}: {
  selected: string[];
  onChange: (tags: string[]) => void;
  available: TagDef[];
  allowCreate?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");

  const toggle = (name: string) =>
    onChange(selected.includes(name) ? selected.filter((t) => t !== name) : [...selected, name]);

  const create = () => {
    const t = input.trim();
    if (t && !selected.includes(t)) onChange([...selected, t]);
    setInput("");
  };

  const filtered = available.filter((t) =>
    t.name.toLowerCase().includes(input.trim().toLowerCase())
  );

  return (
    <Popover
      open={open}
      setOpen={setOpen}
      trigger={
        <button type="button" onClick={() => setOpen(!open)} className={chip(selected.length > 0)}>
          <Tag size={11} />
          {selected.length ? `${selected.length} tag${selected.length > 1 ? "s" : ""}` : "Tags"}
        </button>
      }
    >
      {allowCreate && (
        <Input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              create();
            }
          }}
          placeholder="Search or create…"
          className="mb-1 !py-1 text-sm"
        />
      )}
      <div className="flex max-h-44 flex-col overflow-y-auto">
        {filtered.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => toggle(t.name)}
            className="anim-hover flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-paper-dark"
          >
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: t.color }} />
            <span className="truncate">{t.name}</span>
            {selected.includes(t.name) && <Check size={13} className="ml-auto shrink-0" />}
          </button>
        ))}
        {/* tags picked but not in the registry yet (new or personal) */}
        {selected
          .filter((name) => !available.some((t) => t.name === name))
          .map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => toggle(name)}
              className="anim-hover flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-paper-dark"
            >
              <span className="h-3 w-3 shrink-0 rounded-full bg-ink-soft/40" />
              <span className="truncate">{name}</span>
              <Check size={13} className="ml-auto shrink-0" />
            </button>
          ))}
        {filtered.length === 0 && input.trim() && allowCreate && (
          <button
            type="button"
            onClick={create}
            className="anim-hover cursor-pointer rounded-md px-2 py-1.5 text-left text-sm text-pen-blue hover:bg-paper-dark"
          >
            + Create "{input.trim()}"
          </button>
        )}
      </div>
    </Popover>
  );
}

// ---------- assignee picker (multi-select with avatars) ----------

export function AssigneePicker({
  selected,
  onChange,
  members,
}: {
  selected: number[];
  onChange: (ids: number[]) => void;
  members: Member[];
}) {
  const [open, setOpen] = useState(false);

  const toggle = (id: number) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <Popover
      open={open}
      setOpen={setOpen}
      trigger={
        <button type="button" onClick={() => setOpen(!open)} className={chip(selected.length > 0)}>
          <UserPlus size={11} />
          {selected.length ? selected.length : ""}
        </button>
      }
    >
      <div className="flex max-h-44 flex-col overflow-y-auto">
        {members.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => toggle(m.id)}
            className="anim-hover flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-paper-dark"
          >
            <Avatar name={m.name} src={m.avatar_url || undefined} size={22} />
            <span className="truncate">{m.name}</span>
            {selected.includes(m.id) && <Check size={13} className="ml-auto shrink-0" />}
          </button>
        ))}
        {members.length === 0 && (
          <p className="px-2 py-1.5 text-sm text-ink-soft">No members in this workspace.</p>
        )}
      </div>
    </Popover>
  );
}

// ---------- display helpers ----------

export function TagBadge({ name, tags }: { name: string; tags: TagDef[] }) {
  const def = tags.find((t) => t.name === name);
  const color = def?.color ?? "#6b645a";
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
      style={{ color, borderColor: `${color}66`, background: `${color}1a` }}
    >
      {name}
    </span>
  );
}

export function AvatarStack({ assignees, size = 22 }: { assignees: Assignee[]; size?: number }) {
  if (!assignees.length) return null;
  return (
    <span className="flex items-center">
      {assignees.slice(0, 4).map((a, i) => (
        <span key={a.id} style={{ marginLeft: i === 0 ? 0 : -6 }} title={a.name}>
          <Avatar name={a.name} src={a.avatar_url || undefined} size={size} />
        </span>
      ))}
      {assignees.length > 4 && (
        <span className="ml-1 text-xs text-ink-soft">+{assignees.length - 4}</span>
      )}
    </span>
  );
}
