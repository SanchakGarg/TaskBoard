export interface User {
  id: number;
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
  id: number;
  name: string;
  position: number;
  created_at: string;
  role: Role;
}

export interface Member {
  id: number;
  name: string;
  email: string;
  avatar_url: string;
  role: Role;
  is_owner: number;
}

export interface TagDef {
  id: number;
  workspace_id: number;
  name: string;
  color: string;
}

export interface Assignee {
  id: number;
  name: string;
  avatar_url: string;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  workspace_id: number;
  view_type: "kanban" | "list";
  position: number;
  created_at: string;
}

export interface Column {
  id: number;
  project_id: number;
  name: string;
  position: number;
  is_done: number;
}

export type Priority = "low" | "medium" | "high" | "urgent";

export interface Task {
  id: number;
  column_id: number | null;
  title: string;
  description: string;
  priority: Priority;
  due_date: string | null;
  tags: string;
  position: number;
  completed_at: string | null;
  created_at: string;
  project_id?: number | null;
  assignees?: Assignee[];
}

export interface Milestone {
  id: number;
  project_id: number;
  title: string;
  due_date: string | null;
  done: number;
  position: number;
}

export interface Note {
  id: number;
  content: string;
  color: string;
  updated_at: string;
}

export interface Activity {
  id: number;
  user_name: string;
  action: string;
  detail: string;
  created_at: string;
}

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
