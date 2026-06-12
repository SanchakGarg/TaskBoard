import { useCallback, useEffect, useState } from "react";
import { api } from "./lib/api";
import type { Project } from "./lib/types";
import { useAuth } from "./hooks/useAuth";
import { Login } from "./components/Login";
import { Sidebar, type View } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { Dashboard } from "./components/widgets/Dashboard";
import { KanbanBoard } from "./components/board/KanbanBoard";
import { MyTasksPage } from "./components/MyTasksPage";

export function App() {
  const { user, loading } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [view, setView] = useState<View>({ kind: "mytasks" });
  const [collapsed, setCollapsed] = useState(false);

  const loadProjects = useCallback(() => {
    if (user) api.get<Project[]>("/projects").then(setProjects);
  }, [user]);

  useEffect(loadProjects, [loadProjects]);

  if (loading) return <div className="graph-paper min-h-screen" />;
  if (!user) return <Login />;

  const createProject = async (name: string) => {
    const p = await api.post<Project>("/projects", { name });
    await api.get<Project[]>("/projects").then(setProjects);
    setView({ kind: "board", projectId: p.id });
  };

  const deleteProject = async (id: number) => {
    await api.delete(`/projects/${id}`);
    if (view.kind === "board" && view.projectId === id) setView({ kind: "mytasks" });
    loadProjects();
  };

  const title =
    view.kind === "mytasks"
      ? "My Tasks"
      : view.kind === "dashboard"
        ? "Dashboard"
        : projects.find((p) => p.id === view.projectId)?.name ?? "Board";

  return (
    <div className="graph-paper flex h-screen overflow-hidden">
      <Sidebar
        projects={projects}
        view={view}
        onNavigate={setView}
        onCreateProject={createProject}
        onDeleteProject={deleteProject}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title={title} />
        <main className="min-h-0 flex-1 overflow-y-auto">
          {view.kind === "mytasks" ? (
            <MyTasksPage />
          ) : view.kind === "dashboard" ? (
            <Dashboard />
          ) : (
            <KanbanBoard key={view.projectId} projectId={view.projectId} />
          )}
        </main>
      </div>
    </div>
  );
}
