import postgres from "postgres";
import { config } from "./config";

export const sql = postgres(config.databaseUrl, {
  max: 10,
  idle_timeout: 20,
});

export const initDb = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
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
    CREATE TABLE IF NOT EXISTS workspaces (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
      view_type TEXT NOT NULL DEFAULT 'kanban' CHECK (view_type IN ('kanban','list')),
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('admin','write','checker','read')),
      PRIMARY KEY (workspace_id, user_id)
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS tags (
      id SERIAL PRIMARY KEY,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      UNIQUE (workspace_id, name)
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS columns (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      is_done INTEGER NOT NULL DEFAULT 0
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      column_id INTEGER REFERENCES columns(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
      due_date TIMESTAMP,
      tags TEXT NOT NULL DEFAULT '[]',
      assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      position INTEGER NOT NULL DEFAULT 0,
      completed_at TIMESTAMP,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deadline_notified_for TIMESTAMP
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS task_assignees (
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (task_id, user_id)
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS project_managers (
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (project_id, user_id)
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS notes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT 'yellow',
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS milestones (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      due_date TIMESTAMP,
      done INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS activity (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS widget_layouts (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      layout TEXT NOT NULL DEFAULT '[]',
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS focus (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      goal TEXT NOT NULL DEFAULT '',
      date DATE NOT NULL DEFAULT CURRENT_DATE
    );
  `;

  // Indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_tasks_column ON tasks(column_id, position)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_columns_project ON columns(project_id, position)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at DESC)`;

  // Migrations logic
  const hasColumn = async (table: string, column: string): Promise<boolean> => {
    const result = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = ${table} AND column_name = ${column}
    `;
    return result.length > 0;
  };

  if (!(await hasColumn("projects", "view_type"))) {
    await sql`ALTER TABLE projects ADD COLUMN view_type TEXT NOT NULL DEFAULT 'kanban'`;
  }
  if (!(await hasColumn("projects", "position"))) {
    await sql`ALTER TABLE projects ADD COLUMN position INTEGER NOT NULL DEFAULT 0`;
  }
  if (!(await hasColumn("projects", "workspace_id"))) {
    await sql`ALTER TABLE projects ADD COLUMN workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE`;
  }
  if (!(await hasColumn("users", "theme_prefs"))) {
    await sql`ALTER TABLE users ADD COLUMN theme_prefs TEXT NOT NULL DEFAULT '{}'`;
  }

  // Adopt orphan projects
  const orphanOwners = await sql<{ owner_id: number }[]>`SELECT DISTINCT owner_id FROM projects WHERE workspace_id IS NULL`;
  for (const { owner_id } of orphanOwners) {
    const [ws] = await sql<{ id: number }[]>`
      INSERT INTO workspaces (name, owner_id) VALUES ('My Workspace', ${owner_id}) RETURNING id
    `;
    if (!ws) continue;
    await sql`UPDATE projects SET workspace_id = ${ws.id} WHERE owner_id = ${owner_id} AND workspace_id IS NULL`;
  }

  if (!(await hasColumn("columns", "is_done"))) {
    await sql`ALTER TABLE columns ADD COLUMN is_done INTEGER NOT NULL DEFAULT 0`;
    await sql`UPDATE columns SET is_done = 1 WHERE name = 'Done'`;
  }
  
  if (!(await hasColumn("tasks", "deadline_notified_for"))) {
    await sql`ALTER TABLE tasks ADD COLUMN deadline_notified_for TIMESTAMP`;
  }
};

export interface User {
  id: number;
  provider: string;
  subject: string;
  email: string;
  name: string;
  avatar_url: string;
  theme_prefs: string;
}

export interface Task {
  id: number;
  column_id: number | null;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
  due_date: string | null;
  tags: string;
  assignee_id: number | null;
  position: number;
  completed_at: string | null;
  created_by: number;
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
  return user!;
};

export const getUser = async (id: number): Promise<User | null> => {
  const [user] = await sql<User[]>`SELECT * FROM users WHERE id = ${id}`;
  return user || null;
};

export const logActivity = async (
  userId: number,
  projectId: number | null,
  action: string,
  detail = ""
) => {
  await sql`
    INSERT INTO activity (user_id, project_id, action, detail)
    VALUES (${userId}, ${projectId}, ${action}, ${detail})
  `;
};
