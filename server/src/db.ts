import postgres from "postgres";
import { config } from "./config";

export const sql = postgres(config.databaseUrl, {
  max: 10,
  idle_timeout: 20,
});

export const initDb = async () => {
  await sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`;

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider TEXT NOT NULL,
      subject TEXT NOT NULL,
      email TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      avatar_url TEXT NOT NULL DEFAULT '',
      theme_prefs TEXT NOT NULL DEFAULT '{}',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (provider, subject)
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS pending_invitations (
      email TEXT PRIMARY KEY,
      target_id UUID NOT NULL,
      target_type TEXT NOT NULL CHECK (target_type IN ('workspace','project')),
      role TEXT NOT NULL CHECK (role IN ('admin','write','checker','read')),
      invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS workspaces (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      notifications_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
      view_type TEXT NOT NULL DEFAULT 'kanban' CHECK (view_type IN ('kanban','list')),
      position INTEGER NOT NULL DEFAULT 0,
      share_id UUID UNIQUE DEFAULT gen_random_uuid(),
      share_role TEXT CHECK (share_role IN ('admin','write','checker','read')),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('admin','write','checker','read')),
      PRIMARY KEY (workspace_id, user_id)
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS project_members (
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('admin','write','checker','read')),
      PRIMARY KEY (project_id, user_id)
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS tags (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      UNIQUE (workspace_id, name)
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS columns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      is_done INTEGER NOT NULL DEFAULT 0
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      column_id UUID REFERENCES columns(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
      due_date TIMESTAMP,
      tags TEXT NOT NULL DEFAULT '[]',
      position INTEGER NOT NULL DEFAULT 0,
      completed_at TIMESTAMP,
      created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deadline_notified_for TIMESTAMP
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS task_assignees (
      task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (task_id, user_id)
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS project_managers (
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (project_id, user_id)
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT 'yellow',
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS milestones (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      due_date TIMESTAMP,
      done INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS activity (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS widget_layouts (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      layout TEXT NOT NULL DEFAULT '[]',
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS focus (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      goal TEXT NOT NULL DEFAULT '',
      date DATE NOT NULL DEFAULT CURRENT_DATE
    );
  `;

  // Indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_tasks_column ON tasks(column_id, position)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_columns_project ON columns(project_id, position)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at DESC)`;
};

export interface User {
  id: string;
  provider: string;
  subject: string;
  email: string;
  name: string;
  avatar_url: string;
  theme_prefs: string;
}

export interface Task {
  id: string;
  column_id: string | null;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
  due_date: string | null;
  tags: string;
  position: number;
  completed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export const upsertUser = async (u: {
  provider: string;
  subject: string;
  email: string;
  name: string;
  avatar_url: string;
}): Promise<User> => {
  const [user] = await sql<User[]>`
    INSERT INTO users (provider, subject, email, name, avatar_url)
    VALUES (${u.provider}, ${u.subject}, ${u.email}, ${u.name}, ${u.avatar_url})
    ON CONFLICT (provider, subject)
    DO UPDATE SET email = excluded.email, name = excluded.name, avatar_url = excluded.avatar_url
    RETURNING *
  `;

  // Process pending invitations
  const pending = await sql<any[]>`SELECT * FROM pending_invitations WHERE email = ${u.email}`;
  for (const p of pending) {
    if (p.target_type === 'workspace') {
       await sql`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (${p.target_id}, ${user!.id}, ${p.role}) ON CONFLICT DO NOTHING`;
    } else {
       await sql`INSERT INTO project_members (project_id, user_id, role) VALUES (${p.target_id}, ${user!.id}, ${p.role}) ON CONFLICT DO NOTHING`;
    }
  }
  await sql`DELETE FROM pending_invitations WHERE email = ${u.email}`;

  return user!;
};

export const getUser = async (id: string): Promise<User | null> => {
  const [user] = await sql<User[]>`SELECT * FROM users WHERE id = ${id}`;
  return user || null;
};

export const logActivity = async (
  userId: string,
  projectId: string | null,
  action: string,
  detail = ""
) => {
  await sql`
    INSERT INTO activity (user_id, project_id, action, detail)
    VALUES (${userId}, ${projectId}, ${action}, ${detail})
  `;
};
