import { useState } from "react";
import { LayoutDashboard, ListChecks, KanbanSquare, List, Plus, Trash2, ChevronLeft } from "lucide-react";
import { Button, Divider, Input, Modal, Tooltip } from "./ui";
import { Notebook } from "../illustrations";
import type { Project } from "../lib/types";

export type View =
  | { kind: "mytasks" }
  | { kind: "dashboard" }
  | { kind: "board"; projectId: number };

interface SidebarProps {
  projects: Project[];
  view: View;
  onNavigate: (view: View) => void;
  onCreateProject: (name: string, viewType: "kanban" | "list") => Promise<void>;
  onDeleteProject: (id: number) => Promise<void>;
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({
  projects,
  view,
  onNavigate,
  onCreateProject,
  onDeleteProject,
  collapsed,
  onToggle,
}: SidebarProps) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [viewType, setViewType] = useState<"kanban" | "list">("kanban");

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await onCreateProject(trimmed, viewType);
    setName("");
    setViewType("kanban");
    setCreating(false);
  };

  return (
    <>
      <aside
        className={`anim-sidebar flex h-screen shrink-0 flex-col border-r-2 border-ink/20 bg-paper-dark/60 backdrop-blur ${collapsed ? "w-14" : "w-60"}`}
      >
        <div className={`flex gap-2 p-3 ${collapsed ? "flex-col items-center" : "items-center"}`}>
          <Notebook size={28} className="shrink-0 text-pen-blue" />
          {!collapsed && <span className="font-hand text-lg font-bold">Jotter</span>}
          <button
            onClick={onToggle}
            aria-label="Toggle sidebar"
            className={`anim-hover cursor-pointer rounded-md p-1 text-ink-soft hover:bg-paper hover:text-ink ${collapsed ? "" : "ml-auto"}`}
          >
            <ChevronLeft
              size={16}
              className={`transition-transform duration-250 ${collapsed ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        <nav className="flex flex-col gap-1 px-2">
          <NavItem
            icon={<ListChecks size={18} />}
            label="My Tasks"
            collapsed={collapsed}
            active={view.kind === "mytasks"}
            onClick={() => onNavigate({ kind: "mytasks" })}
          />
          <NavItem
            icon={<LayoutDashboard size={18} />}
            label="Dashboard"
            collapsed={collapsed}
            active={view.kind === "dashboard"}
            onClick={() => onNavigate({ kind: "dashboard" })}
          />
        </nav>

        {!collapsed && <Divider label="projects" className="mx-3 my-3" />}

        {/* project explorer */}
        <div className="flex-1 overflow-y-auto px-2">
          {projects.map((p) => (
            <div key={p.id} className="group/project relative">
              <NavItem
                icon={p.view_type === "list" ? <List size={18} /> : <KanbanSquare size={18} />}
                label={p.name}
                collapsed={collapsed}
                active={view.kind === "board" && view.projectId === p.id}
                onClick={() => onNavigate({ kind: "board", projectId: p.id })}
              />
              {!collapsed && (
                <button
                  aria-label={`Delete ${p.name}`}
                  onClick={() => {
                    if (confirm(`Delete project "${p.name}" and all its tasks?`))
                      onDeleteProject(p.id);
                  }}
                  className="anim-hover absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer rounded p-1 text-ink-soft opacity-0 hover:text-pen-red group-hover/project:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="p-2">
          {collapsed ? (
            <Tooltip label="New project">
              <Button size="sm" variant="ghost" onClick={() => setCreating(true)}>
                <Plus size={16} />
              </Button>
            </Tooltip>
          ) : (
            <Button size="sm" variant="secondary" className="w-full" onClick={() => setCreating(true)}>
              <Plus size={16} /> New project
            </Button>
          )}
        </div>
      </aside>

      <Modal open={creating} onClose={() => setCreating(false)} title="New project">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-3"
        >
          <Input
            autoFocus
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { type: "kanban", label: "Kanban board", icon: <KanbanSquare size={16} /> },
                { type: "list", label: "List", icon: <List size={16} /> },
              ] as const
            ).map((opt) => (
              <button
                key={opt.type}
                type="button"
                onClick={() => setViewType(opt.type)}
                className={`anim-hover flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 px-3 py-2 text-sm ${viewType === opt.type ? "border-ink bg-paper-dark font-semibold" : "border-ink-soft/40 text-ink-soft hover:border-ink hover:text-ink"}`}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>
          <Button type="submit" disabled={!name.trim()}>
            Create
          </Button>
        </form>
      </Modal>
    </>
  );
}

function NavItem({
  icon,
  label,
  collapsed,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
  active: boolean;
  onClick: () => void;
}) {
  const inner = (
    <button
      onClick={onClick}
      className={`anim-hover flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left ${active ? "bg-paper font-semibold shadow-card" : "text-ink-soft hover:bg-paper hover:text-ink"}`}
    >
      <span className="shrink-0">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
  return collapsed ? <Tooltip label={label}>{inner}</Tooltip> : inner;
}
