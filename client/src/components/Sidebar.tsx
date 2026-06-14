import { useState } from "react";
import {
  LayoutDashboard,
  ListChecks,
  KanbanSquare,
  List,
  Plus,
  Settings,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  User,
} from "lucide-react";
import { Button, ContextMenu, Divider, Input, Modal, Tooltip, type ContextMenuItem } from "./ui";
import { Notebook } from "../illustrations";
import type { Project, Workspace, View } from "../lib/types";

interface SidebarProps {
  workspaces: Workspace[];
  projects: Project[];
  view: View;
  onNavigate: (view: View) => void;
  onCreateWorkspace: (name: string) => Promise<void>;
  onCreateProject: (workspaceId: string, name: string, viewType: "kanban" | "list") => Promise<void>;
  onOpenSettings: (ws: Workspace) => void;
  onOpenProjectSettings: (p: Project) => void;
  onOpenUserSettings: () => void;
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({
  workspaces,
  projects,
  view,
  onNavigate,
  onCreateWorkspace,
  onCreateProject,
  onOpenSettings,
  onOpenProjectSettings,
  onOpenUserSettings,
  collapsed,
  onToggle,
}: SidebarProps) {
  const [creatingIn, setCreatingIn] = useState<string | null>(null); // workspace id
  const [creatingWs, setCreatingWs] = useState(false);
  const [name, setName] = useState("");
  const [wsName, setWsName] = useState("");
  const [viewType, setViewType] = useState<"kanban" | "list">("kanban");
  const [closedWs, setClosedWs] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);

  const workspaceMenu = (ws: Workspace): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    if (ws.role === "admin")
      items.push({
        label: "New project",
        icon: <Plus size={14} />,
        onClick: () => setCreatingIn(ws.id),
      });
    items.push({
      label: "Settings",
      icon: <Settings size={14} />,
      onClick: () => onOpenSettings(ws),
    });
    return items;
  };

  const submitProject = async () => {
    const trimmed = name.trim();
    if (!trimmed || creatingIn === null) return;
    await onCreateProject(creatingIn, trimmed, viewType);
    setName("");
    setViewType("kanban");
    setCreatingIn(null);
  };

  const submitWorkspace = async () => {
    const trimmed = wsName.trim();
    if (!trimmed) return;
    await onCreateWorkspace(trimmed);
    setWsName("");
    setCreatingWs(false);
  };

  const toggleWs = (id: string) =>
    setClosedWs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <aside
        onContextMenu={(e) => {
          // right-click on sidebar background → new workspace
          e.preventDefault();
          setMenu({
            x: e.clientX,
            y: e.clientY,
            items: [
              {
                label: "New workspace",
                icon: <Plus size={14} />,
                onClick: () => setCreatingWs(true),
              },
            ],
          });
        }}
        className={`anim-sidebar flex h-full shrink-0 flex-col border-r-2 border-ink/20 bg-paper-dark/60 backdrop-blur ${collapsed ? "w-14" : "w-64"}`}
      >
        <div className={`flex gap-2 p-3 ${collapsed ? "flex-col items-center" : "items-center"}`}>
          <Notebook size={28} className="shrink-0 text-pen-blue" />
          {!collapsed && <span className="font-hand text-lg font-bold">Taskboard</span>}
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

        {!collapsed && <Divider label="workspaces" className="mx-3 my-3" />}

        <div className="flex-1 overflow-y-auto px-2">
          {workspaces.map((ws) => {
            const wsProjects = projects.filter((p) => p.workspace_id === ws.id);
            const closed = closedWs.has(ws.id);
            return (
              <div key={ws.id} className="mb-1">
                {!collapsed && (
                  <div
                    className="group/ws flex items-center gap-1 rounded-md px-1 py-1"
                    onContextMenu={(e) => {
                      // right-click a workspace → project creation, settings
                      e.preventDefault();
                      e.stopPropagation();
                      setMenu({ x: e.clientX, y: e.clientY, items: workspaceMenu(ws) });
                    }}
                  >
                    <button
                      onClick={() => toggleWs(ws.id)}
                      className="anim-hover flex min-w-0 flex-1 cursor-pointer items-center gap-1 text-left text-sm font-semibold text-ink-soft hover:text-ink"
                    >
                      <ChevronRight
                        size={13}
                        className={`shrink-0 transition-transform duration-200 ${closed ? "" : "rotate-90"}`}
                      />
                      <FolderOpen size={14} className="shrink-0" />
                      <span className="truncate">{ws.name}</span>
                    </button>
                    {ws.role === "admin" && (
                      <button
                        aria-label={`New project in ${ws.name}`}
                        onClick={() => setCreatingIn(ws.id)}
                        className="anim-hover shrink-0 cursor-pointer rounded p-0.5 text-ink-soft opacity-40 hover:bg-paper hover:text-ink group-hover/ws:opacity-100"
                      >
                        <Plus size={14} />
                      </button>
                    )}
                    <button
                      aria-label={`Settings for ${ws.name}`}
                      onClick={() => onOpenSettings(ws)}
                      className="anim-hover shrink-0 cursor-pointer rounded p-0.5 text-ink-soft opacity-40 hover:bg-paper hover:text-ink group-hover/ws:opacity-100"
                    >
                      <Settings size={13} />
                    </button>
                  </div>
                )}

                {(!closed || collapsed) &&
                  wsProjects.map((p) => (
                    <div
                      key={p.id}
                      className="group/project relative"
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setMenu({
                          x: e.clientX,
                          y: e.clientY,
                          items: [
                            {
                              label: "Project settings",
                              icon: <Settings size={14} />,
                              onClick: () => onOpenProjectSettings(p),
                            },
                          ],
                        });
                      }}
                    >
                      <NavItem
                        icon={
                          p.view_type === "list" ? <List size={18} /> : <KanbanSquare size={18} />
                        }
                        label={p.name}
                        collapsed={collapsed}
                        indent={!collapsed}
                        active={view.kind === "board" && view.projectId === p.id}
                        onClick={() => onNavigate({ kind: "board", projectId: p.id })}
                      />
                      {!collapsed && (
                        <span className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center opacity-0 group-hover/project:opacity-100">
                          <button
                            aria-label={`Settings for ${p.name}`}
                            onClick={() => onOpenProjectSettings(p)}
                            className="anim-hover cursor-pointer rounded p-1 text-ink-soft hover:text-ink"
                          >
                            <Settings size={13} />
                          </button>
                        </span>
                      )}
                    </div>
                  ))}

                {!collapsed && !closed && wsProjects.length === 0 && (
                  <p className="px-6 py-1 text-xs text-ink-soft/70">No projects yet</p>
                )}
              </div>
            );
          })}
          
          {/* Shared Projects */}
          {!collapsed && projects.filter(p => !workspaces.find(w => w.id === p.workspace_id)).length > 0 && (
            <div className="mt-4">
              <Divider label="shared projects" className="mx-3 my-3" />
              {projects.filter(p => !workspaces.find(w => w.id === p.workspace_id)).map(p => (
                <NavItem
                  key={p.id}
                  icon={p.view_type === "list" ? <List size={18} /> : <KanbanSquare size={18} />}
                  label={p.name}
                  collapsed={collapsed}
                  active={view.kind === "board" && view.projectId === p.id}
                  onClick={() => onNavigate({ kind: "board", projectId: p.id })}
                />
              ))}
            </div>
          )}
        </div>

        <div className="p-2 flex flex-col gap-2">
          {collapsed ? (
            <Tooltip label="New workspace">
              <Button size="sm" variant="ghost" onClick={() => setCreatingWs(true)}>
                <Plus size={16} />
              </Button>
            </Tooltip>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              className="w-full"
              onClick={() => setCreatingWs(true)}
            >
              <Plus size={16} /> New workspace
            </Button>
          )}

          {collapsed ? (
            <Tooltip label="Profile & Settings">
              <Button size="sm" variant="ghost" onClick={onOpenUserSettings}>
                <User size={16} />
              </Button>
            </Tooltip>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="w-full"
              onClick={onOpenUserSettings}
            >
              <User size={16} /> Profile & Settings
            </Button>
          )}
        </div>
      </aside>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}

      <Modal open={creatingIn !== null} onClose={() => setCreatingIn(null)} title="New project">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitProject();
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

      <Modal open={creatingWs} onClose={() => setCreatingWs(false)} title="New workspace">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitWorkspace();
          }}
          className="flex flex-col gap-3"
        >
          <Input
            autoFocus
            placeholder="Workspace name"
            value={wsName}
            onChange={(e) => setWsName(e.target.value)}
          />
          <Button type="submit" disabled={!wsName.trim()}>
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
  indent = false,
}: {
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
  active: boolean;
  onClick: () => void;
  indent?: boolean;
}) {
  const inner = (
    <button
      onClick={onClick}
      className={`anim-hover flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left ${indent ? "pl-6" : ""} ${active ? "bg-paper font-semibold shadow-card" : "text-ink-soft hover:bg-paper hover:text-ink"}`}
    >
      <span className="shrink-0">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
  return collapsed ? <Tooltip label={label}>{inner}</Tooltip> : inner;
}
