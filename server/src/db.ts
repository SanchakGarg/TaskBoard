import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { config } from "./config";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

const toPgSql = (sql: string): string => {
  let i = 0;
  return sql.replace(/\?(\d+)?/g, (_match, n: string | undefined) =>
    n ? `$${Number(n)}` : `$${++i}`
  );
};

class DbHandle {
  constructor(private readonly client: Queryable) {}

  query<T extends QueryResultRow = Record<string, unknown>>(sql: string) {
    const text = toPgSql(sql);
    return {
      get: async (...params: unknown[]): Promise<T | null> => {
        const { rows } = await this.client.query<T>(text, params as any[]);
        return rows[0] ?? null;
      },
      all: async (...params: unknown[]): Promise<T[]> => {
        const { rows } = await this.client.query<T>(text, params as any[]);
        return rows;
      },
      run: async (...params: unknown[]): Promise<void> => {
        await this.client.query(text, params as any[]);
      },
    };
  }

  run(sql: string, params: unknown[] = []) {
    return this.query(sql).run(...params);
  }
}

class PgDb extends DbHandle {
  private readonly pool: Pool;

  constructor() {
    const pool = new Pool({
      connectionString: config.databaseUrl,
    });
    super(pool);
    this.pool = pool;
  }

  async transaction<T>(fn: (tx: DbHandle) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const tx = new DbHandle(client);
      const result = await fn(tx);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}

export const db = new PgDb();

const timestampText = "to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS')";

const columnExists = async (table: string, column: string): Promise<boolean> =>
  !!(
    await db
      .query(
        `SELECT 1
         FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = ?
           AND column_name = ?`
      )
      .get(table, column)
  );

const ensureColumn = async (table: string, definition: string): Promise<void> => {
  await db.run(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${definition}`);
};

export async function initDatabase() {
  await db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      provider TEXT NOT NULL,
      subject TEXT NOT NULL,
      email TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      avatar_url TEXT NOT NULL DEFAULT '',
      password_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (${timestampText}),
      UNIQUE (provider, subject)
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (${timestampText})
    );

    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
      view_type TEXT NOT NULL DEFAULT 'kanban' CHECK (view_type IN ('kanban','list')),
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (${timestampText})
    );

    CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('admin','write','checker','read')),
      PRIMARY KEY (workspace_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS tags (
      id SERIAL PRIMARY KEY,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      UNIQUE (workspace_id, name)
    );

    CREATE TABLE IF NOT EXISTS project_managers (
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (project_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS columns (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      is_done INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
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
      created_at TEXT NOT NULL DEFAULT (${timestampText}),
      updated_at TEXT NOT NULL DEFAULT (${timestampText}),
      deadline_notified_for TEXT
    );

    CREATE TABLE IF NOT EXISTS task_assignees (
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (task_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS notes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT 'yellow',
      updated_at TEXT NOT NULL DEFAULT (${timestampText})
    );

    CREATE TABLE IF NOT EXISTS milestones (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      due_date TEXT,
      done INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS activity (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (${timestampText})
    );

    CREATE TABLE IF NOT EXISTS widget_layouts (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      layout TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL DEFAULT (${timestampText})
    );

    CREATE TABLE IF NOT EXISTS focus (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      goal TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT (CURRENT_DATE::text)
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_column ON tasks(column_id, position);
    CREATE INDEX IF NOT EXISTS idx_columns_project ON columns(project_id, position);
    CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users ((lower(email)));
  `);

  if (!(await columnExists("users", "password_hash"))) {
    await ensureColumn("users", "password_hash TEXT");
  }
  if (!(await columnExists("tasks", "deadline_notified_for"))) {
    await ensureColumn("tasks", "deadline_notified_for TEXT");
  }
  if (!(await columnExists("projects", "view_type"))) {
    await ensureColumn("projects", "view_type TEXT NOT NULL DEFAULT 'kanban'");
  }
  if (!(await columnExists("projects", "position"))) {
    await ensureColumn("projects", "position INTEGER NOT NULL DEFAULT 0");
  }
  if (!(await columnExists("projects", "workspace_id"))) {
    await ensureColumn("projects", "workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE");
  }
  if (!(await columnExists("columns", "is_done"))) {
    await ensureColumn("columns", "is_done INTEGER NOT NULL DEFAULT 0");
  }

  // If a legacy Postgres install ever had non-null task column IDs, relax it for personal tasks.
  const columnNullability = await db
    .query<{ is_nullable: "YES" | "NO" }>(
      `SELECT is_nullable
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'tasks'
         AND column_name = 'column_id'`
    )
    .get();
  if (columnNullability?.is_nullable === "NO") {
    await db.run("ALTER TABLE tasks ALTER COLUMN column_id DROP NOT NULL");
  }
}

export interface User {
  id: number;
  provider: string;
  subject: string;
  email: string;
  name: string;
  avatar_url: string;
  password_hash: string | null;
  created_at: string;
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
  deadline_notified_for?: string | null;
}

export const upsertUser = async (u: {
  provider: string;
  subject: string;
  email: string;
  name: string;
  avatar_url: string;
  password_hash?: string | null;
}): Promise<User> =>
  (
    await db
      .query<User>(
        `INSERT INTO users (provider, subject, email, name, avatar_url, password_hash)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (provider, subject)
         DO UPDATE SET email = excluded.email,
                       name = excluded.name,
                       avatar_url = excluded.avatar_url
         RETURNING *`
      )
      .get(u.provider, u.subject, u.email, u.name, u.avatar_url, u.password_hash ?? null)
  )!;

export const createLocalUser = async (u: {
  email: string;
  name: string;
  avatar_url?: string;
  password_hash: string;
}): Promise<User> =>
  (
    await db
      .query<User>(
        `INSERT INTO users (provider, subject, email, name, avatar_url, password_hash)
         VALUES ('local', ?, ?, ?, ?, ?)
         RETURNING *`
      )
      .get(u.email.toLowerCase(), u.email.toLowerCase(), u.name, u.avatar_url ?? "", u.password_hash)
  )!;

export const getUser = async (id: number): Promise<User | null> =>
  db.query<User>("SELECT * FROM users WHERE id = ?").get(id);

export const getUserByEmail = async (email: string): Promise<User | null> =>
  db.query<User>("SELECT * FROM users WHERE lower(email) = lower(?) ORDER BY id LIMIT 1").get(email);

export const getLocalUserByEmail = async (email: string): Promise<User | null> =>
  db
    .query<User>("SELECT * FROM users WHERE provider = 'local' AND lower(email) = lower(?) LIMIT 1")
    .get(email);

export const logActivity = async (
  userId: number,
  projectId: number | null,
  action: string,
  detail = ""
) =>
  db.run("INSERT INTO activity (user_id, project_id, action, detail) VALUES (?, ?, ?, ?)", [
    userId,
    projectId,
    action,
    detail,
  ]);
