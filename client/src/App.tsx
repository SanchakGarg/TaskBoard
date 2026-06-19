import { useCallback, useEffect, useState } from "react";
import { CheckSquare, FolderKanban, LayoutDashboard, Settings } from "lucide-react";
import { api, setPublicShareId } from "./lib/api";
import type { Project, Workspace, View, Column, Task, Folder } from "./lib/types";
import { useAuth } from "./hooks/useAuth";
import { Login } from "./components/Login";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { Dashboard } from "./components/widgets/Dashboard";
import { KanbanBoard } from "./components/board/KanbanBoard";
import { ListBoard } from "./components/board/ListBoard";
import { MilestonesBar } from "./components/board/MilestonesBar";
import { MyTasksPage } from "./components/MyTasksPage";
import { Tabs } from "./components/Tabs";
import { WorkspaceSettings } from "./components/WorkspaceSettings";
import { ProjectSettings } from "./components/ProjectSettings";
import { WorkspaceShareSettings } from "./components/WorkspaceShareSettings";
import { ProjectShareSettings } from "./components/ProjectShareSettings";
import { UserSettings } from "./components/UserSettings";
import { PageLoader } from "./illustrations";
import { setToastInstance, useToast } from "./components/ui/Toast";
import { PrivacyPolicy } from "./components/PrivacyPolicy";
import { About } from "./components/About";
import { TermsOfService } from "./components/TermsOfService";
import { ContextMenu } from "./components/ui";

// view survives reloads via the URL hash: #/mytasks, #/dashboard, #/board/uuid, #/public/uuid
const parseHash = (): View => {
  if (window.location.hash === "#/privacy") return { kind: "privacy" };
  if (window.location.hash === "#/about") return { kind: "about" };
  if (window.location.hash === "#/tos") return { kind: "tos" };
  const m = window.location.hash.match(/^#\/board\/([0-9a-f-]{36})$/);
  if (m) return { kind: "board", projectId: m[1] };
  const p = window.location.hash.match(/^#\/public\/([0-9a-f-]{36})$/);
  if (p) return { kind: "public", shareId: p[1] };
  if (window.location.hash === "#/dashboard") return { kind: "dashboard" };
  return { kind: "mytasks" };
};

const hashFor = (v: View) => {
  if (v.kind === "board") return `#/board/${v.projectId}`;
  if (v.kind === "public") return `#/public/${v.shareId}`;
  if (v.kind === "privacy") return `#/privacy`;
  if (v.kind === "about") return `#/about`;
  if (v.kind === "tos") return `#/tos`;
  return `#/${v.kind}`;
};

export function App() {
  const { user, loading } = useAuth();
  const toastCtx = useToast();
  setToastInstance(toastCtx);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [view, setViewState] = useState<View>(parseHash);
  const [activeWs, setActiveWs] = useState<string | null>(null);

  // For public projects
  const [publicData, setPublicData] = useState<{ project: Project; columns: Column[]; tasks: Task[] } | null>(null);

  useEffect(() => {
    const handleHash = () => setViewState(parseHash());
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const setView = (v: View) => {
    setViewState(v);
    window.history.replaceState(null, "", hashFor(v));
  };
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false); // mobile sidebar
  const [globalMenu, setGlobalMenu] = useState<{ x: number; y: number } | null>(null);
  const [settingsWs, setSettingsWs] = useState<Workspace | null>(null);
  const [settingsProject, setSettingsProject] = useState<Project | null>(null);
  const [sharingWs, setSharingWs] = useState<Workspace | null>(null);
  const [sharingProject, setSharingProject] = useState<Project | null>(null);
  const [settingsUser, setSettingsUser] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const loadAll = useCallback(async () => {
    if (!user) return;
    if (!hasLoadedOnce) setDataLoading(true);
    try {
      const [ws, ps] = await Promise.all([
        api.get<Workspace[]>("/workspaces"),
        api.get<Project[]>("/projects"),
      ]);
      setWorkspaces(ws);
      setProjects(ps);

      const folderPromises = ws.map((w) => api.get<Folder[]>(`/workspaces/${w.id}/folders`));
      const allFolders = await Promise.all(folderPromises);
      setFolders(allFolders.flat());

      setActiveWs((prev) => prev ?? ws[0]?.id ?? null);
      setHasLoadedOnce(true);
    } catch (e) {
      console.error("Failed to load initial data:", e);
    } finally {
      setDataLoading(false);
    }
  }, [user, hasLoadedOnce]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const loadPublic = useCallback(async (shareId: string) => {
    setDataLoading(true);
    setPublicShareId(shareId);
    try {
      const data = await api.get<{ project: Project; columns: Column[]; tasks: Task[] }>(`/public/projects/${shareId}`);
      setPublicData(data);
    } catch (e) {
      console.error("Failed to load public project:", e);
      setPublicShareId(null);
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view.kind === "public") {
      loadPublic(view.shareId);
    } else {
      setPublicShareId(null);
    }
  }, [view, loadPublic]);

  // after a reload onto a board, point the tab strip at that board's workspace
  useEffect(() => {
    if (view.kind === "board") {
      const ws = projects.find((p) => p.id === view.projectId)?.workspace_id;
      if (ws) setActiveWs(ws);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  const isPublic = view.kind === "public";
  const isPrivacy = view.kind === "privacy";
  const isAbout = view.kind === "about";
  const isTos = view.kind === "tos";

  if (loading && !isPublic && !isPrivacy && !isAbout && !isTos) return <PageLoader />;
  if (!user && !isPublic && !isPrivacy && !isAbout && !isTos) return <Login />;
  if (dataLoading && !hasLoadedOnce && !isPublic && !isPrivacy && !isAbout && !isTos) return <PageLoader />;

  const navigate = (v: View) => {
    if (v.kind === "board") {
      const ws = projects.find((p) => p.id === v.projectId)?.workspace_id;
      if (ws) setActiveWs(ws);
    }
    setView(v);
    setDrawerOpen(false);
  };

  const createWorkspace = async (name: string) => {
    const ws = await api.post<Workspace>("/workspaces", { name });
    await loadAll();
    setActiveWs(ws.id);
  };

  const createProject = async (workspaceId: string, name: string, viewType: "kanban" | "list", folderId?: string) => {
    const p = await api.post<Project>("/projects", { name, viewType, workspaceId, folderId });
    await loadAll();
    setActiveWs(workspaceId);
    setView({ kind: "board", projectId: p.id });
  };

  const createFolder = async (workspaceId: string, name: string, parentId?: string) => {
    await api.post(`/workspaces/${workspaceId}/folders`, { name, parentId });
    await loadAll();
  };

  const moveProject = async (projectId: string, workspaceId: string, folderId: string | null, position: number) => {
    try {
      await api.patch(`/projects/${projectId}`, { workspaceId, folderId, position });
    } finally {
      await loadAll();
    }
  };

  const moveFolder = async (folderId: string, parentId: string | null, position: number) => {
    await api.patch(`/folders/${folderId}`, { parentId, position });
    await loadAll();
  };

  const renameFolder = async (folderId: string, name: string) => {
    await api.patch(`/folders/${folderId}`, { name });
    await loadAll();
  };

  const deleteFolder = async (folderId: string) => {
    await api.delete(`/folders/${folderId}`);
    await loadAll();
  };

  const reorderProjects = (ids: string[]) => {
    setProjects((prev) => [...prev].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)));
    api.patch("/projects/reorder", { ids });
  };

  const currentProject =
    view.kind === "board" ? projects.find((p) => p.id === view.projectId) : undefined;
  
  const currentRole = 
    view.kind === "public" ? publicData?.project.share_role ?? "read" :
    currentProject ? (workspaces.find((w) => w.id === currentProject.workspace_id)?.role ?? "read") : "read";

  const title =
    view.kind === "mytasks"
      ? "My Tasks"
      : view.kind === "dashboard"
        ? "Dashboard"
        : view.kind === "public"
          ? publicData?.project.name ?? "Public Board"
          : currentProject?.name ?? "Board";

  const tabProjects = projects.filter((p) => p.workspace_id === activeWs);

  const sidebar = (
    <Sidebar
      workspaces={workspaces}
      folders={folders}
      projects={projects}
      view={view}
      onNavigate={navigate}
      onCreateWorkspace={createWorkspace}
      onCreateProject={createProject}
      onCreateFolder={createFolder}
      onMoveProject={moveProject}
      onMoveFolder={moveFolder}
      onRenameFolder={renameFolder}
      onDeleteFolder={deleteFolder}
      onOpenSettings={(ws) => {
        setSettingsWs(ws);
        setDrawerOpen(false);
      }}
      onOpenWorkspaceShare={(ws) => {
        setSharingWs(ws);
        setDrawerOpen(false);
      }}
      onOpenProjectSettings={(p) => {
        setSettingsProject(p);
        setDrawerOpen(false);
      }}
      onOpenProjectShare={(p) => {
        setSharingProject(p);
        setDrawerOpen(false);
      }}
      onOpenUserSettings={() => {
        setSettingsUser(true);
        setDrawerOpen(false);
      }}
      collapsed={collapsed}
      onToggle={() => setCollapsed((c) => !c)}
    />
  );

  return (
    <div className="graph-paper flex h-screen overflow-hidden">
      {/* desktop sidebar */}
      {(!isPublic && !isPrivacy && !isAbout && !isTos) && <div className="hidden md:block">{sidebar}</div>}

      {/* mobile drawer */}
      {drawerOpen && (!isPublic && !isPrivacy && !isAbout && !isTos) && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="anim-backdrop absolute inset-0 bg-ink/40" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0">{sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {(!isPublic && !isPrivacy && !isAbout && !isTos) && <TopBar title={title} onMenuClick={() => setDrawerOpen(true)} />}
        {(!isPublic && !isPrivacy && !isAbout && !isTos) && view.kind !== "dashboard" && (
          <Tabs
            projects={tabProjects}
            workspaceName={workspaces.find((w) => w.id === activeWs)?.name}
            view={view}
            onNavigate={navigate}
            onReorder={reorderProjects}
          />
        )}
        <main
          className="min-h-0 flex-1 overflow-y-auto"
          onContextMenu={(e) => {
            if (isPublic || isPrivacy || isAbout || isTos) return;
            e.preventDefault();
            setGlobalMenu({ x: e.clientX, y: e.clientY });
          }}
        >
          {view.kind === "privacy" ? (
            <PrivacyPolicy />
          ) : view.kind === "about" ? (
            <About />
          ) : view.kind === "tos" ? (
            <TermsOfService />
          ) : view.kind === "mytasks" ? (
            <MyTasksPage onNavigate={navigate} />
          ) : view.kind === "dashboard" ? (
            <Dashboard />
          ) : view.kind === "public" ? (
            publicData ? (
              publicData.project.view_type === "list" ? (
                <ListBoard key={view.shareId} projectId={publicData.project.id} role={currentRole} publicData={publicData} />
              ) : (
                <KanbanBoard key={view.shareId} projectId={publicData.project.id} role={currentRole} publicData={publicData} />
              )
            ) : <PageLoader />
          ) : currentProject ? (
            <>
              <MilestonesBar key={`mb-${view.projectId}`} projectId={view.projectId} role={currentRole} />
              {currentProject.view_type === "list" ? (
                <ListBoard key={view.projectId} projectId={view.projectId} role={currentRole} />
              ) : (
                <KanbanBoard key={view.projectId} projectId={view.projectId} role={currentRole} />
              )}
            </>
          ) : null}
        </main>
      </div>

      {globalMenu && (
        <ContextMenu
          x={globalMenu.x}
          y={globalMenu.y}
          onClose={() => setGlobalMenu(null)}
          items={[
            {
              label: "My Tasks",
              icon: <CheckSquare size={14} />,
              onClick: () => navigate({ kind: "mytasks" }),
            },
            {
              label: "Dashboard",
              icon: <LayoutDashboard size={14} />,
              onClick: () => navigate({ kind: "dashboard" }),
            },
            ...(currentProject
              ? [
                  {
                    label: `${currentProject.name} settings`,
                    icon: <Settings size={14} />,
                    onClick: () => setSettingsProject(currentProject),
                  },
                ]
              : []),
            ...(workspaces.length > 0 && view.kind !== "dashboard"
              ? [
                  {
                    label: "New project",
                    icon: <FolderKanban size={14} />,
                    onClick: () => {
                      const ws = workspaces.find((w) => w.id === activeWs) ?? workspaces[0];
                      if (ws) createProject(ws.id, "New project", "list");
                    },
                  },
                ]
              : []),
          ]}
        />
      )}

      {settingsWs && (
        <WorkspaceSettings
          workspace={workspaces.find((w) => w.id === settingsWs.id) ?? settingsWs}
          onClose={() => setSettingsWs(null)}
          onSaved={loadAll}
        />
      )}
      {settingsProject && (
        <ProjectSettings
          project={projects.find((p) => p.id === settingsProject.id) ?? settingsProject}
          role={currentRole}
          onClose={() => setSettingsProject(null)}
          onSaved={loadAll}
        />
      )}
      {sharingWs && (
        <WorkspaceShareSettings
          workspace={workspaces.find((w) => w.id === sharingWs.id) ?? sharingWs}
          onClose={() => setSharingWs(null)}
          onSaved={loadAll}
        />
      )}
      {sharingProject && (
        <ProjectShareSettings
          project={projects.find((p) => p.id === sharingProject.id) ?? sharingProject}
          role={
            workspaces.find(
              (w) => w.id === (projects.find((p) => p.id === sharingProject.id) ?? sharingProject).workspace_id
            )?.role ?? "read"
          }
          onClose={() => setSharingProject(null)}
          onSaved={loadAll}
        />
      )}
      {settingsUser && (
        <UserSettings onClose={() => setSettingsUser(false)} />
      )}
    </div>
  );
}
