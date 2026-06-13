import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config";

mkdirSync(dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath, { create: true });

db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA foreign_keys = ON");

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    subject TEXT NOT NULL,
    email TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    avatar_url TEXT NOT NULL DEFAULT '',
    theme_prefs TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (provider, subject)
  );

  CREATE TABLE IF NOT EXISTS workspaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
    view_type TEXT NOT NULL DEFAULT 'kanban' CHECK (view_type IN ('kanban','list')),
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS workspace_members (
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin','write','checker','read')),
    PRIMARY KEY (workspace_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    UNIQUE (workspace_id, name)
  );

  CREATE TABLE IF NOT EXISTS task_assignees (
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS project_managers (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS columns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    is_done INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- NULL column_id = personal task, not attached to any project
    column_id INTEGER REFERENCES columns(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
    due_date TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    position INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT 'yellow',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    due_date TEXT,
    done INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS widget_layouts (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    layout TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS focus (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    goal TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL DEFAULT (date('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_column ON tasks(column_id, position);
  CREATE INDEX IF NOT EXISTS idx_columns_project ON columns(project_id, position);
  CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at DESC);
`);

// ---------- migrations for databases created before these columns existed ----------

const hasColumn = (table: string, column: string): boolean =>
  !!db
    .query("SELECT 1 FROM pragma_table_info(?) WHERE name = ?")
    .get(table, column);

if (!hasColumn("projects", "view_type"))
  db.run("ALTER TABLE projects ADD COLUMN view_type TEXT NOT NULL DEFAULT 'kanban'");
if (!hasColumn("projects", "position"))
  db.run("ALTER TABLE projects ADD COLUMN position INTEGER NOT NULL DEFAULT 0");
if (!hasColumn("projects", "workspace_id"))
  db.run("ALTER TABLE projects ADD COLUMN workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE");
if (!hasColumn("users", "theme_prefs"))
  db.run("ALTER TABLE users ADD COLUMN theme_prefs TEXT NOT NULL DEFAULT '{}'");

// adopt orphan projects (created before workspaces) into a default workspace per owner
const orphanOwners = db
  .query<{ owner_id: number }, []>(
    "SELECT DISTINCT owner_id FROM projects WHERE workspace_id IS NULL"
  )
  .all();
for (const { owner_id } of orphanOwners) {
  const ws = db
    .query<{ id: number }, [number]>(
      "INSERT INTO workspaces (name, owner_id) VALUES ('My Workspace', ?) RETURNING id"
    )
    .get(owner_id)!;
  db.run("UPDATE projects SET workspace_id = ? WHERE owner_id = ? AND workspace_id IS NULL", [
    ws.id,
    owner_id,
  ]);
}

if (!hasColumn("columns", "is_done")) {
  db.run("ALTER TABLE columns ADD COLUMN is_done INTEGER NOT NULL DEFAULT 0");
  // best-effort: default kanban "Done" columns become the done column
  db.run("UPDATE columns SET is_done = 1 WHERE name = 'Done'");
}

// tasks.column_id used to be NOT NULL; personal tasks need it nullable.
const columnIdNotNull = db
  .query<{ nn: number }, []>(
    `SELECT "notnull" AS nn FROM pragma_table_info('tasks') WHERE name = 'column_id'`
  )
  .get();
if (columnIdNotNull?.nn) {
  db.run("PRAGMA foreign_keys = OFF");
  db.transaction(() => {
    db.run(`
      CREATE TABLE tasks_migrated (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        column_id INTEGER REFERENCES columns(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
        due_date TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        position INTEGER NOT NULL DEFAULT 0,
        completed_at TEXT,
        created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.run("INSERT INTO tasks_migrated SELECT * FROM tasks");
    db.run("DROP TABLE tasks");
    db.run("ALTER TABLE tasks_migrated RENAME TO tasks");
    db.run("CREATE INDEX IF NOT EXISTS idx_tasks_column ON tasks(column_id, position)");
  })();
  db.run("PRAGMA foreign_keys = ON");
}

// runs after the rebuild so old databases get the column on the new table
if (!hasColumn("tasks", "deadline_notified_for"))
  db.run("ALTER TABLE tasks ADD COLUMN deadline_notified_for TEXT");

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

export const upsertUser = (u: {
  provider: string;
  subject: string;
  email: string;
  name: string;
  avatar_url: string;
}): User =>
  db
    .query<User, [string, string, string, string, string]>(
      `INSERT INTO users (provider, subject, email, name, avatar_url)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (provider, subject)
       DO UPDATE SET email = excluded.email, name = excluded.name, avatar_url = excluded.avatar_url
       RETURNING *`
    )
    .get(u.provider, u.subject, u.email, u.name, u.avatar_url)!;

export const getUser = (id: number): User | null =>
  db.query<User, [number]>("SELECT * FROM users WHERE id = ?").get(id);

export const logActivity = (
  userId: number,
  projectId: number | null,
  action: string,
  detail = ""
) =>
  db.run(
    "INSERT INTO activity (user_id, project_id, action, detail) VALUES (?, ?, ?, ?)",
    [userId, projectId, action, detail]
  );
