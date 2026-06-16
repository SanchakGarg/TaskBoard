import { useState } from "react";
import {
  LayoutDashboard,
  ListChecks,
  KanbanSquare,
  List,
  Plus,
  Share2,
  Settings,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  User,
  Folder as FolderIcon,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button, ContextMenu, Divider, Input, Modal, Tooltip, type ContextMenuItem } from "./ui";
import { Notebook } from "../illustrations";
import type { Project, Workspace, View, Folder } from "../lib/types";

interface SidebarProps {
  workspaces: Workspace[];
  folders: Folder[];
  projects: Project[];
  view: View;
  onNavigate: (view: View) => void;
  onCreateWorkspace: (name: string) => Promise<void>;
  onCreateProject: (workspaceId: string, name: string, viewType: "kanban" | "list", folderId?: string) => Promise<void>;
  onCreateFolder: (workspaceId: string, name: string, parentId?: string) => Promise<void>;
  onMoveProject: (projectId: string, workspaceId: string, folderId: string | null, position: number) => Promise<void>;
  onMoveFolder: (folderId: string, parentId: string | null, position: number) => Promise<void>;
  onRenameFolder: (folderId: string, name: string) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onOpenSettings: (ws: Workspace) => void;
  onOpenWorkspaceShare: (ws: Workspace) => void;
  onOpenProjectSettings: (p: Project) => void;
  onOpenProjectShare: (p: Project) => void;
  onOpenUserSettings: () => void;
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({
  workspaces,
  folders,
  projects,
  view,
  onNavigate,
  onCreateWorkspace,
  onCreateProject,
  onCreateFolder,
  onMoveProject,
  onMoveFolder,
  onRenameFolder,
  onDeleteFolder,
  onOpenSettings,
  onOpenWorkspaceShare,
  onOpenProjectSettings,
  onOpenProjectShare,
  onOpenUserSettings,
  collapsed,
  onToggle,
}: SidebarProps) {
  const [creatingIn, setCreatingIn] = useState<{ workspaceId: string; folderId?: string } | null>(null);
  const [creatingFolderIn, setCreatingFolderIn] = useState<{ workspaceId: string; parentId?: string } | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<Folder | null>(null);
  const [creatingWs, setCreatingWs] = useState(false);
  const [name, setName] = useState("");
  const [folderName, setFolderName] = useState("");
  const [renamedFolderName, setRenamedFolderName] = useState("");
  const [wsName, setWsName] = useState("");
  const [viewType, setViewType] = useState<"kanban" | "list">("kanban");
  const [closedWs, setClosedWs] = useState<Set<string>>(new Set());
  const [closedFolders, setClosedFolders] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);

  // D&D handling for Sidebar
  const [draggedItem, setDraggedId] = useState<{ kind: "project" | "folder"; id: string } | null>(null);

  const handleDragStart = (e: React.DragEvent, kind: "project" | "folder", id: string) => {
    setDraggedId({ kind, id });
    const target = e.currentTarget as HTMLElement;
    setTimeout(() => target.classList.add("opacity-20"), 0);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedId(null);
    const target = e.currentTarget as HTMLElement;
    target.classList.remove("opacity-20");
  };

  const handleDrop = async (e: React.DragEvent, workspaceId: string, folderId: string | null, atIndex?: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedItem) return;

    if (draggedItem.kind === "project") {
      await onMoveProject(draggedItem.id, workspaceId, folderId, atIndex ?? 0);
    } else if (draggedItem.kind === "folder") {
      if (draggedItem.id === folderId) return;
      await onMoveFolder(draggedItem.id, folderId, atIndex ?? 0);
    }
    setDraggedId(null);
  };

  const workspaceMenu = (ws: Workspace): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    if (ws.role === "admin") {
      items.push({
        label: "New project",
        icon: <Plus size={14} />,
        onClick: () => setCreatingIn({ workspaceId: ws.id }),
      });
      items.push({
        label: "New folder",
        icon: <FolderIcon size={14} />,
        onClick: () => setCreatingFolderIn({ workspaceId: ws.id }),
      });
    }
    items.push({
      label: "Share",
      icon: <Share2 size={14} />,
      onClick: () => onOpenWorkspaceShare(ws),
    });
    items.push({
      label: "Settings",
      icon: <Settings size={14} />,
      onClick: () => onOpenSettings(ws),
    });
    return items;
  };

  const folderMenu = (folder: Folder, role: string): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    if (role === "admin") {
      items.push({
        label: "New project",
        icon: <Plus size={14} />,
        onClick: () => setCreatingIn({ workspaceId: folder.workspace_id, folderId: folder.id }),
      });
      items.push({
        label: "New subfolder",
        icon: <FolderIcon size={14} />,
        onClick: () => setCreatingFolderIn({ workspaceId: folder.workspace_id, parentId: folder.id }),
      });
      items.push({
        label: "Rename folder",
        icon: <Pencil size={14} />,
        onClick: () => {
          setRenamingFolder(folder);
          setRenamedFolderName(folder.name);
        },
      });
      items.push({
        label: "Delete folder",
        icon: <Trash2 size={14} />,
        danger: true,
        onClick: () => onDeleteFolder(folder.id),
      });
    }
    return items;
  };

  const submitProject = async () => {
    const trimmed = name.trim();
    if (!trimmed || creatingIn === null) return;
    await onCreateProject(creatingIn.workspaceId, trimmed, viewType, creatingIn.folderId);
    setName("");
    setViewType("kanban");
    setCreatingIn(null);
  };

  const submitFolder = async () => {
    const trimmed = folderName.trim();
    if (!trimmed || creatingFolderIn === null) return;
    await onCreateFolder(creatingFolderIn.workspaceId, trimmed, creatingFolderIn.parentId);
    setFolderName("");
    setCreatingFolderIn(null);
  };

  const submitFolderRename = async () => {
    const trimmed = renamedFolderName.trim();
    if (!trimmed || !renamingFolder) return;
    await onRenameFolder(renamingFolder.id, trimmed);
    setRenamingFolder(null);
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

  const toggleFolder = (id: string) =>
    setClosedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <aside
        onContextMenu={(e) => {
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
            const closed = closedWs.has(ws.id);
            const wsProjects = projects.filter((p) => p.workspace_id === ws.id && !p.folder_id);
            const wsFolders = folders.filter((f) => f.workspace_id === ws.id && !f.parent_id);

            return (
              <div
                key={ws.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => handleDrop(e, ws.id, null)}
                className="mb-1"
              >
                {!collapsed && (
                  <div
                    className="group/ws flex items-center gap-1 rounded-md px-1 py-1"
                    onContextMenu={(e) => {
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
                        onClick={() => setCreatingIn({ workspaceId: ws.id })}
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

                {(!closed || collapsed) && (
                  <div className={!collapsed ? "pl-2" : ""}>
                    {wsFolders.map((f, idx) => (
                      <FolderTree
                        key={f.id}
                        index={idx}
                        folder={f}
                        folders={folders}
                        projects={projects}
                        view={view}
                        onNavigate={onNavigate}
                        collapsed={collapsed}
                        closedFolders={closedFolders}
                        toggleFolder={toggleFolder}
                        setMenu={setMenu}
                        folderMenu={folderMenu}
                        wsRole={ws.role}
                        handleDragStart={handleDragStart}
                        handleDragEnd={handleDragEnd}
                        handleDrop={handleDrop}
                        onOpenProjectShare={onOpenProjectShare}
                        onOpenProjectSettings={onOpenProjectSettings}
                      />
                    ))}
                    {wsProjects.map((p, idx) => (
                      <ProjectNavItem
                        key={p.id}
                        index={wsFolders.length + idx}
                        project={p}
                        view={view}
                        onNavigate={onNavigate}
                        collapsed={collapsed}
                        setMenu={setMenu}
                        onOpenProjectShare={onOpenProjectShare}
                        onOpenProjectSettings={onOpenProjectSettings}
                        handleDragStart={handleDragStart}
                        handleDragEnd={handleDragEnd}
                        handleDrop={handleDrop}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
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

      <Modal open={creatingFolderIn !== null} onClose={() => setCreatingFolderIn(null)} title="New folder">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitFolder();
          }}
          className="flex flex-col gap-3"
        >
          <Input
            autoFocus
            placeholder="Folder name"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
          />
          <Button type="submit" disabled={!folderName.trim()}>
            Create
          </Button>
        </form>
      </Modal>

      <Modal open={renamingFolder !== null} onClose={() => setRenamingFolder(null)} title="Rename folder">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitFolderRename();
          }}
          className="flex flex-col gap-3"
        >
          <Input
            autoFocus
            placeholder="Folder name"
            value={renamedFolderName}
            onChange={(e) => setRenamedFolderName(e.target.value)}
          />
          <Button type="submit" disabled={!renamedFolderName.trim()}>
            Rename
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

function FolderTree({
  folder,
  index,
  folders,
  projects,
  view,
  onNavigate,
  collapsed,
  closedFolders,
  toggleFolder,
  setMenu,
  folderMenu,
  wsRole,
  handleDragStart,
  handleDragEnd,
  handleDrop,
  onOpenProjectShare,
  onOpenProjectSettings,
}: {
  folder: Folder;
  index: number;
  folders: Folder[];
  projects: Project[];
  view: View;
  onNavigate: (v: View) => void;
  collapsed: boolean;
  closedFolders: Set<string>;
  toggleFolder: (id: string) => void;
  setMenu: (m: any) => void;
  folderMenu: (f: Folder, r: string) => ContextMenuItem[];
  wsRole: string;
  handleDragStart: (e: React.DragEvent, kind: "project" | "folder", id: string) => void;
  handleDragEnd: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent, workspaceId: string, folderId: string | null, atIndex?: number) => void;
  onOpenProjectShare: (p: Project) => void;
  onOpenProjectSettings: (p: Project) => void;
}) {
  const closed = closedFolders.has(folder.id);
  const subfolders = folders.filter((f) => f.parent_id === folder.id);
  const subprojects = projects.filter((p) => p.folder_id === folder.id);

  return (
    <div
      className="mb-0.5"
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => handleDrop(e, folder.workspace_id, folder.parent_id, index)}
    >
      {!collapsed && (
        <div
          draggable
          onDragStart={(e) => handleDragStart(e, "folder", folder.id)}
          onDragEnd={handleDragEnd}
          className="group/folder flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-paper/40"
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenu({ x: e.clientX, y: e.clientY, items: folderMenu(folder, wsRole) });
          }}
        >
          <button
            onClick={() => toggleFolder(folder.id)}
            className="anim-hover flex min-w-0 flex-1 cursor-pointer items-center gap-1 text-left text-xs font-medium text-ink-soft hover:text-ink"
          >
            <ChevronRight
              size={12}
              className={`shrink-0 transition-transform duration-200 ${closed ? "" : "rotate-90"}`}
            />
            <FolderIcon size={14} className="shrink-0 text-pen-amber/80" />
            <span className="truncate">{folder.name}</span>
          </button>
        </div>
      )}

      {(!closed || collapsed) && (
        <div 
          className={!collapsed ? "pl-3 border-l border-ink/10 ml-1.5" : ""}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => handleDrop(e, folder.workspace_id, folder.id)}
        >
          {subfolders.map((f, idx) => (
            <FolderTree
              key={f.id}
              index={idx}
              folder={f}
              folders={folders}
              projects={projects}
              view={view}
              onNavigate={onNavigate}
              collapsed={collapsed}
              closedFolders={closedFolders}
              toggleFolder={toggleFolder}
              setMenu={setMenu}
              folderMenu={folderMenu}
              wsRole={wsRole}
              handleDragStart={handleDragStart}
              handleDragEnd={handleDragEnd}
              handleDrop={handleDrop}
              onOpenProjectShare={onOpenProjectShare}
              onOpenProjectSettings={onOpenProjectSettings}
            />
          ))}
          {subprojects.map((p, idx) => (
            <ProjectNavItem
              key={p.id}
              index={subfolders.length + idx}
              project={p}
              view={view}
              onNavigate={onNavigate}
              collapsed={collapsed}
              setMenu={setMenu}
              onOpenProjectShare={onOpenProjectShare}
              onOpenProjectSettings={onOpenProjectSettings}
              handleDragStart={handleDragStart}
              handleDragEnd={handleDragEnd}
              handleDrop={handleDrop}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectNavItem({
  project,
  index,
  view,
  onNavigate,
  collapsed,
  setMenu,
  onOpenProjectShare,
  onOpenProjectSettings,
  handleDragStart,
  handleDragEnd,
  handleDrop,
}: {
  project: Project;
  index: number;
  view: View;
  onNavigate: (v: View) => void;
  collapsed: boolean;
  setMenu: (m: any) => void;
  onOpenProjectShare: (p: Project) => void;
  onOpenProjectSettings: (p: Project) => void;
  handleDragStart: (e: React.DragEvent, kind: "project" | "folder", id: string) => void;
  handleDragEnd: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent, workspaceId: string, folderId: string | null, atIndex?: number) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => handleDragStart(e, "project", project.id)}
      onDragEnd={handleDragEnd}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => handleDrop(e, project.workspace_id, project.folder_id, index)}
      className="group/project relative"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setMenu({
          x: e.clientX,
          y: e.clientY,
          items: [
            {
              label: "Share project",
              icon: <Share2 size={14} />,
              onClick: () => onOpenProjectShare(project),
            },
            {
              label: "Project settings",
              icon: <Settings size={14} />,
              onClick: () => onOpenProjectSettings(project),
            },
          ],
        });
      }}
    >
      <NavItem
        icon={project.view_type === "list" ? <List size={18} /> : <KanbanSquare size={18} />}
        label={project.name}
        collapsed={collapsed}
        active={view.kind === "board" && view.projectId === project.id}
        onClick={() => onNavigate({ kind: "board", projectId: project.id })}
      />
      {!collapsed && (
        <span className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 group-hover/project:opacity-100">
          <button
            aria-label={`Settings for ${project.name}`}
            onClick={() => onOpenProjectSettings(project)}
            className="anim-hover cursor-pointer rounded p-1 text-ink-soft hover:text-ink"
          >
            <Settings size={13} />
          </button>
        </span>
      )}
    </div>
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
