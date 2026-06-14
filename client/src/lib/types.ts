export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  provider: string;
  themePrefs?: Record<string, string>;
}

export type Role = "read" | "checker" | "write" | "admin";

export const roleRank: Record<Role, number> = { read: 0, checker: 1, write: 2, admin: 3 };
export const atLeast = (role: Role | null | undefined, min: Role): boolean =>
  !!role && roleRank[role] >= roleRank[min];

export interface Workspace {
  id: string;
  name: string;
  position: number;
  created_at: string;
  role: Role;
  notifications_enabled: number;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  avatar_url: string;
  role: Role;
  is_owner: number;
}

export interface TagDef {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
}

export interface Assignee {
  id: string;
  name: string;
  avatar_url: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  workspace_id: string;
  view_type: "kanban" | "list";
  position: number;
  created_at: string;
  share_id?: string;
  share_role?: Role;
}

export interface Column {
  id: string;
  project_id: string;
  name: string;
  position: number;
  is_done: number;
}

export type Priority = "low" | "medium" | "high" | "urgent";

export interface Task {
  id: string;
  column_id: string | null;
  title: string;
  description: string;
  priority: Priority;
  due_date: string | null;
  tags: string;
  position: number;
  completed_at: string | null;
  created_at: string;
  project_id?: string | null;
  assignees?: Assignee[];
}

export interface Milestone {
  id: string;
  project_id: string;
  title: string;
  due_date: string | null;
  done: number;
  position: number;
}

export interface Note {
  id: string;
  content: string;
  color: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  user_name: string;
  action: string;
  detail: string;
  created_at: string;
}

export type View =
  | { kind: "mytasks" }
  | { kind: "dashboard" }
  | { kind: "board"; projectId: string }
  | { kind: "public"; shareId: string };

export interface WidgetInstance {
  id: string;
  type: string;
  collapsed?: boolean;
  height?: number; // px height of widget body; undefined = auto
  cols?: number; // 1-3 column span
}

export const parseTags = (tags: string): string[] => {
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
