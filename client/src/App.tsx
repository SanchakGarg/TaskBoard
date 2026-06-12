import { useCallback, useEffect, useState } from "react";
import { api } from "./lib/api";
import type { Project, Workspace } from "./lib/types";
import { useAuth } from "./hooks/useAuth";
import { Login } from "./components/Login";
import { Sidebar, type View } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { Dashboard } from "./components/widgets/Dashboard";
import { KanbanBoard } from "./components/board/KanbanBoard";
import { ListBoard } from "./components/board/ListBoard";
import { MyTasksPage } from "./components/MyTasksPage";
import { Tabs } from "./components/Tabs";
import { WorkspaceSettings } from "./components/WorkspaceSettings";
import { ProjectSettings } from "./components/ProjectSettings";

export function App() {
  const { user, loading } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [view, setView] = useState<View>({ kind: "mytasks" });
  const [activeWs, setActiveWs] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false); // mobile sidebar
  const [settingsWs, setSettingsWs] = useState<Workspace | null>(null);
  const [settingsProject, setSettingsProject] = useState<Project | null>(null);

  const loadAll = useCallback(async () => {
    if (!user) return;
    const [ws, ps] = await Promise.all([
      api.get<Workspace[]>("/workspaces"),
      api.get<Project[]>("/projects"),
    ]);
    setWorkspaces(ws);
    setProjects(ps);
    setActiveWs((prev) => prev ?? ws[0]?.id ?? null);
  }, [user]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  if (loading) return <div className="graph-paper min-h-screen" />;
  if (!user) return <Login />;

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

  const deleteWorkspace = async (id: number) => {
    await api.delete(`/workspaces/${id}`);
    if (view.kind === "board" && projects.find((p) => p.id === view.projectId)?.workspace_id === id)
      setView({ kind: "mytasks" });
    if (activeWs === id) setActiveWs(null);
    await loadAll();
  };

  const createProject = async (workspaceId: number, name: string, viewType: "kanban" | "list") => {
    const p = await api.post<Project>("/projects", { name, viewType, workspaceId });
    await loadAll();
    setActiveWs(workspaceId);
    setView({ kind: "board", projectId: p.id });
  };

  const deleteProject = async (id: number) => {
    await api.delete(`/projects/${id}`);
    if (view.kind === "board" && view.projectId === id) setView({ kind: "mytasks" });
    loadAll();
  };

  const reorderProjects = (ids: number[]) => {
    setProjects((prev) => [...prev].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)));
    api.patch("/projects/reorder", { ids });
  };

  const currentProject =
    view.kind === "board" ? projects.find((p) => p.id === view.projectId) : undefined;
  const currentRole = currentProject
    ? workspaces.find((w) => w.id === currentProject.workspace_id)?.role ?? "read"
    : "read";

  const title =
    view.kind === "mytasks"
      ? "My Tasks"
      : view.kind === "dashboard"
        ? "Dashboard"
        : currentProject?.name ?? "Board";

  const tabProjects = projects.filter((p) => p.workspace_id === activeWs);

  const sidebar = (
    <Sidebar
      workspaces={workspaces}
      projects={projects}
      view={view}
      onNavigate={navigate}
      onCreateWorkspace={createWorkspace}
      onDeleteWorkspace={deleteWorkspace}
      onCreateProject={createProject}
      onDeleteProject={deleteProject}
      onOpenSettings={(ws) => {
        setSettingsWs(ws);
        setDrawerOpen(false);
      }}
      onOpenProjectSettings={(p) => {
        setSettingsProject(p);
        setDrawerOpen(false);
      }}
      collapsed={collapsed}
      onToggle={() => setCollapsed((c) => !c)}
    />
  );

  return (
    <div className="graph-paper flex h-screen overflow-hidden">
      {/* desktop sidebar */}
      <div className="hidden md:block">{sidebar}</div>

      {/* mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="anim-backdrop absolute inset-0 bg-ink/40" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0">{sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title={title} onMenuClick={() => setDrawerOpen(true)} />
        {view.kind !== "dashboard" && (
          <Tabs
            projects={tabProjects}
            workspaceName={workspaces.find((w) => w.id === activeWs)?.name}
            view={view}
            onNavigate={navigate}
            onReorder={reorderProjects}
          />
        )}
        <main className="min-h-0 flex-1 overflow-y-auto">
          {view.kind === "mytasks" ? (
            <MyTasksPage />
          ) : view.kind === "dashboard" ? (
            <Dashboard />
          ) : currentProject?.view_type === "list" ? (
            <ListBoard key={view.projectId} projectId={view.projectId} role={currentRole} />
          ) : (
            <KanbanBoard key={view.projectId} projectId={view.projectId} role={currentRole} />
          )}
        </main>
      </div>

      {settingsWs && <WorkspaceSettings workspace={settingsWs} onClose={() => setSettingsWs(null)} />}
      {settingsProject && (
        <ProjectSettings
          project={settingsProject}
          role={workspaces.find((w) => w.id === settingsProject.workspace_id)?.role ?? "read"}
          onClose={() => setSettingsProject(null)}
        />
      )}
    </div>
  );
}
