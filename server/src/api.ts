import { Router, type Response } from "express";
import { db, logActivity, type Task, type User } from "./db";
import { requireAuth, type AuthedRequest } from "./auth";
import { sendTaskAssigned, sendWorkspaceInvite } from "./mailer";

export const apiRouter = Router();
apiRouter.use(requireAuth);

const user = (req: unknown): User => (req as AuthedRequest).user;
const bad = (res: Response, msg: string) => res.status(400).json({ error: msg });
const notFound = (res: Response) => res.status(404).json({ error: "not found" });
const forbidden = (res: Response) => res.status(403).json({ error: "forbidden" });

const str = (v: unknown, max = 2000): string | null =>
  typeof v === "string" && v.length <= max ? v : null;

// ---------- roles ----------

export type Role = "read" | "checker" | "write" | "admin";
const roleRank: Record<Role, number> = { read: 0, checker: 1, write: 2, admin: 3 };
const isRole = (v: unknown): v is Role =>
  typeof v === "string" && v in roleRank;

const getRole = (userId: number, workspaceId: number): Role | null => {
  const ws = db
    .query("SELECT owner_id FROM workspaces WHERE id = ?")
    .get(workspaceId) as { owner_id: number } | null;
  if (!ws) return null;
  if (ws.owner_id === userId) return "admin";
  const m = db
    .query("SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?")
    .get(workspaceId, userId) as { role: Role } | null;
  return m?.role ?? null;
};

const atLeast = (role: Role | null, min: Role): boolean =>
  role !== null && roleRank[role] >= roleRank[min];

const projectWorkspace = (projectId: number): number | null =>
  (db.query("SELECT workspace_id FROM projects WHERE id = ?").get(projectId) as {
    workspace_id: number;
  } | null)?.workspace_id ?? null;

const columnWorkspace = (columnId: number): { workspace_id: number; project_id: number } | null =>
  db
    .query(
      `SELECT p.workspace_id, p.id AS project_id FROM columns c
       JOIN projects p ON p.id = c.project_id WHERE c.id = ?`
    )
    .get(columnId) as { workspace_id: number; project_id: number } | null;

type TaskCtx = Task & { project_id: number | null; workspace_id: number | null };

const taskCtx = (taskId: number): TaskCtx | null =>
  db
    .query(
      `SELECT t.*, c.project_id, p.workspace_id FROM tasks t
       LEFT JOIN columns c ON c.id = t.column_id
       LEFT JOIN projects p ON p.id = c.project_id
       WHERE t.id = ?`
    )
    .get(taskId) as TaskCtx | null;

// role for a task: workspace role, or implicit write on own personal tasks
const taskRole = (req: unknown, t: TaskCtx): Role | null => {
  if (t.workspace_id === null)
    return t.created_by === user(req).id ? "write" : null;
  return getRole(user(req).id, t.workspace_id);
};

// ---------- tag registry helpers ----------

const TAG_PALETTE = [
  "#2f5d9e", "#c0533e", "#4a7c59", "#c98a2d", "#7b5ea7", "#3e8e8c",
  "#b5527d", "#6b8e23", "#a0522d", "#4682b4", "#9e2f5d", "#5d9e2f",
];

const registerTags = (workspaceId: number, names: string[]) => {
  for (const name of names) {
    const exists = db
      .query("SELECT 1 FROM tags WHERE workspace_id = ? AND name = ?")
      .get(workspaceId, name);
    if (!exists) {
      const count = db
        .query("SELECT COUNT(*) AS c FROM tags WHERE workspace_id = ?")
        .get(workspaceId) as { c: number };
      db.run("INSERT INTO tags (workspace_id, name, color) VALUES (?, ?, ?)", [
        workspaceId,
        name,
        TAG_PALETTE[count.c % TAG_PALETTE.length]!,
      ]);
    }
  }
};

// ---------- assignees ----------

interface Assignee {
  id: number;
  name: string;
  avatar_url: string;
}

const assigneesFor = (taskIds: number[]): Map<number, Assignee[]> => {
  const map = new Map<number, Assignee[]>();
  if (!taskIds.length) return map;
  const rows = db
    .query(
      `SELECT ta.task_id, u.id, u.name, u.avatar_url FROM task_assignees ta
       JOIN users u ON u.id = ta.user_id
       WHERE ta.task_id IN (${taskIds.map(() => "?").join(",")})`
    )
    .all(...taskIds) as (Assignee & { task_id: number })[];
  for (const r of rows) {
    const list = map.get(r.task_id) ?? [];
    list.push({ id: r.id, name: r.name, avatar_url: r.avatar_url });
    map.set(r.task_id, list);
  }
  return map;
};

const setAssignees = (taskId: number, workspaceId: number, userIds: unknown) => {
  if (!Array.isArray(userIds)) return;
  db.run("DELETE FROM task_assignees WHERE task_id = ?", [taskId]);
  for (const uid of userIds.slice(0, 20)) {
    if (typeof uid !== "number") continue;
    if (getRole(uid, workspaceId) === null) continue; // only workspace members
    db.run("INSERT OR IGNORE INTO task_assignees (task_id, user_id) VALUES (?, ?)", [taskId, uid]);
  }
};

const withAssignees = <T extends { id: number }>(tasks: T[]): (T & { assignees: Assignee[] })[] => {
  const map = assigneesFor(tasks.map((t) => t.id));
  return tasks.map((t) => ({ ...t, assignees: map.get(t.id) ?? [] }));
};

const emailsOf = (userIds: number[]): string[] =>
  userIds.length
    ? (
        db
          .query(`SELECT email FROM users WHERE id IN (${userIds.map(() => "?").join(",")})`)
          .all(...userIds) as { email: string }[]
      ).map((u) => u.email)
    : [];

const memberIdsOnly = (workspaceId: number, ids: unknown): number[] =>
  Array.isArray(ids)
    ? [...new Set(ids.filter((n): n is number => typeof n === "number"))].filter(
        (id) => getRole(id, workspaceId) !== null
      )
    : [];

const projectName = (projectId: number | null): string =>
  projectId === null
    ? "Personal"
    : ((db.query("SELECT name FROM projects WHERE id = ?").get(projectId) as {
        name: string;
      } | null)?.name ?? "a project");

// ---------- workspaces ----------

apiRouter.get("/workspaces", (req, res) => {
  const rows = db
    .query(
      `SELECT w.*,
        CASE WHEN w.owner_id = ?1 THEN 'admin' ELSE m.role END AS role
       FROM workspaces w
       LEFT JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = ?1
       WHERE w.owner_id = ?1 OR m.user_id IS NOT NULL
       ORDER BY w.position, w.created_at`
    )
    .all(user(req).id);
  res.json(rows);
});

apiRouter.post("/workspaces", (req, res) => {
  const name = str(req.body?.name, 100)?.trim();
  if (!name) return bad(res, "name required");
  const next = db
    .query("SELECT COALESCE(MAX(position) + 1, 0) AS p FROM workspaces WHERE owner_id = ?")
    .get(user(req).id) as { p: number };
  const ws = db
    .query("INSERT INTO workspaces (name, owner_id, position) VALUES (?, ?, ?) RETURNING *")
    .get(name, user(req).id, next.p) as { id: number };
  res.status(201).json({ ...ws, role: "admin" });
});

apiRouter.patch("/workspaces/:id", (req, res) => {
  const id = Number(req.params.id);
  if (getRole(user(req).id, id) !== "admin") return forbidden(res);
  const name = str(req.body?.name, 100)?.trim();
  if (!name) return bad(res, "name required");
  res.json(db.query("UPDATE workspaces SET name = ? WHERE id = ? RETURNING *").get(name, id));
});

apiRouter.delete("/workspaces/:id", (req, res) => {
  const id = Number(req.params.id);
  if (getRole(user(req).id, id) !== "admin") return forbidden(res);
  db.run("DELETE FROM workspaces WHERE id = ?", [id]);
  res.json({ ok: true });
});

// ---------- workspace members ----------

apiRouter.get("/workspaces/:id/members", (req, res) => {
  const id = Number(req.params.id);
  if (!atLeast(getRole(user(req).id, id), "read")) return notFound(res);
  const owner = db
    .query(
      `SELECT u.id, u.name, u.email, u.avatar_url, 'admin' AS role, 1 AS is_owner
       FROM workspaces w JOIN users u ON u.id = w.owner_id WHERE w.id = ?`
    )
    .get(id);
  const members = db
    .query(
      `SELECT u.id, u.name, u.email, u.avatar_url, m.role, 0 AS is_owner
       FROM workspace_members m JOIN users u ON u.id = m.user_id
       WHERE m.workspace_id = ? ORDER BY u.name`
    )
    .all(id);
  res.json([owner, ...members].filter(Boolean));
});

apiRouter.post("/workspaces/:id/members", (req, res) => {
  const id = Number(req.params.id);
  if (getRole(user(req).id, id) !== "admin") return forbidden(res);
  const email = str(req.body?.email, 200)?.trim().toLowerCase();
  const role = req.body?.role;
  if (!email || !isRole(role)) return bad(res, "email and valid role required");
  const target = db.query("SELECT id FROM users WHERE lower(email) = ?").get(email) as {
    id: number;
  } | null;
  if (!target)
    return res.status(404).json({ error: "no user with that email has signed in yet" });
  const ownerId = (db.query("SELECT owner_id FROM workspaces WHERE id = ?").get(id) as {
    owner_id: number;
  }).owner_id;
  if (target.id === ownerId) return bad(res, "owner is already an admin");
  db.run(
    `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = excluded.role`,
    [id, target.id, role]
  );
  const ws = db.query("SELECT name FROM workspaces WHERE id = ?").get(id) as { name: string };
  sendWorkspaceInvite({
    to: email,
    workspaceName: ws.name,
    role,
    invitedBy: user(req).name,
  });
  res.status(201).json({ ok: true });
});

apiRouter.patch("/workspaces/:id/members/:userId", (req, res) => {
  const id = Number(req.params.id);
  if (getRole(user(req).id, id) !== "admin") return forbidden(res);
  if (!isRole(req.body?.role)) return bad(res, "valid role required");
  db.run("UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND user_id = ?", [
    req.body.role,
    id,
    Number(req.params.userId),
  ]);
  res.json({ ok: true });
});

apiRouter.delete("/workspaces/:id/members/:userId", (req, res) => {
  const id = Number(req.params.id);
  if (getRole(user(req).id, id) !== "admin") return forbidden(res);
  db.run("DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?", [
    id,
    Number(req.params.userId),
  ]);
  res.json({ ok: true });
});

// ---------- workspace tags ----------

apiRouter.get("/workspaces/:id/tags", (req, res) => {
  const id = Number(req.params.id);
  if (!atLeast(getRole(user(req).id, id), "read")) return notFound(res);
  res.json(db.query("SELECT * FROM tags WHERE workspace_id = ? ORDER BY name").all(id));
});

apiRouter.patch("/tags/:id", (req, res) => {
  const tag = db.query("SELECT * FROM tags WHERE id = ?").get(Number(req.params.id)) as {
    id: number;
    workspace_id: number;
  } | null;
  if (!tag) return notFound(res);
  if (getRole(user(req).id, tag.workspace_id) !== "admin") return forbidden(res);
  const color = str(req.body?.color, 20)?.trim();
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) return bad(res, "color must be #rrggbb");
  res.json(db.query("UPDATE tags SET color = ? WHERE id = ? RETURNING *").get(color, tag.id));
});

apiRouter.delete("/tags/:id", (req, res) => {
  const tag = db.query("SELECT * FROM tags WHERE id = ?").get(Number(req.params.id)) as {
    id: number;
    workspace_id: number;
  } | null;
  if (!tag) return notFound(res);
  if (getRole(user(req).id, tag.workspace_id) !== "admin") return forbidden(res);
  db.run("DELETE FROM tags WHERE id = ?", [tag.id]);
  res.json({ ok: true });
});

// ---------- projects ----------

apiRouter.get("/projects", (req, res) => {
  const rows = db
    .query(
      `SELECT p.* FROM projects p
       JOIN workspaces w ON w.id = p.workspace_id
       LEFT JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = ?1
       WHERE w.owner_id = ?1 OR m.user_id IS NOT NULL
       ORDER BY p.position, p.created_at`
    )
    .all(user(req).id);
  res.json(rows);
});

apiRouter.post("/projects", (req, res) => {
  const name = str(req.body?.name, 200)?.trim();
  if (!name) return bad(res, "name required");
  const workspaceId = Number(req.body?.workspaceId);
  if (getRole(user(req).id, workspaceId) !== "admin") return forbidden(res);
  const viewType = req.body?.viewType === "list" ? "list" : "kanban";
  const nextPos = db
    .query("SELECT COALESCE(MAX(position) + 1, 0) AS p FROM projects WHERE workspace_id = ?")
    .get(workspaceId) as { p: number };
  const project = db
    .query(
      "INSERT INTO projects (name, description, owner_id, workspace_id, view_type, position) VALUES (?, ?, ?, ?, ?, ?) RETURNING *"
    )
    .get(
      name,
      str(req.body?.description) ?? "",
      user(req).id,
      workspaceId,
      viewType,
      nextPos.p
    ) as { id: number };
  const defaults =
    viewType === "list" ? [["Tasks", 0]] : [["Todo", 0], ["In Progress", 0], ["Done", 1]];
  defaults.forEach(([col, isDone], i) =>
    db.run("INSERT INTO columns (project_id, name, position, is_done) VALUES (?, ?, ?, ?)", [
      project.id,
      col as string,
      i,
      isDone as number,
    ])
  );
  logActivity(user(req).id, project.id, "created project", name);
  res.status(201).json(project);
});

apiRouter.patch("/projects/reorder", (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "number"))
    return bad(res, "ids must be an array of numbers");
  const apply = db.transaction(() => {
    ids.forEach((id, i) => {
      const ws = projectWorkspace(id);
      if (ws !== null && atLeast(getRole(user(req).id, ws), "write"))
        db.run("UPDATE projects SET position = ? WHERE id = ?", [i, id]);
    });
  });
  apply();
  res.json({ ok: true });
});

apiRouter.patch("/projects/:id", (req, res) => {
  const id = Number(req.params.id);
  const ws = projectWorkspace(id);
  if (ws === null) return notFound(res);
  if (getRole(user(req).id, ws) !== "admin") return forbidden(res);
  const name = str(req.body?.name, 200)?.trim();
  if (!name) return bad(res, "name required");
  res.json(db.query("UPDATE projects SET name = ? WHERE id = ? RETURNING *").get(name, id));
});

apiRouter.delete("/projects/:id", (req, res) => {
  const id = Number(req.params.id);
  const ws = projectWorkspace(id);
  if (ws === null) return notFound(res);
  if (getRole(user(req).id, ws) !== "admin") return forbidden(res);
  db.run("DELETE FROM projects WHERE id = ?", [id]);
  res.json({ ok: true });
});

// ---------- project managers ----------

apiRouter.get("/projects/:id/managers", (req, res) => {
  const projectId = Number(req.params.id);
  const ws = projectWorkspace(projectId);
  if (ws === null || !atLeast(getRole(user(req).id, ws), "read")) return notFound(res);
  res.json(
    db
      .query(
        `SELECT u.id, u.name, u.email, u.avatar_url FROM project_managers pm
         JOIN users u ON u.id = pm.user_id WHERE pm.project_id = ? ORDER BY u.name`
      )
      .all(projectId)
  );
});

apiRouter.put("/projects/:id/managers", (req, res) => {
  const projectId = Number(req.params.id);
  const ws = projectWorkspace(projectId);
  if (ws === null) return notFound(res);
  if (getRole(user(req).id, ws) !== "admin") return forbidden(res);
  const ids = memberIdsOnly(ws, req.body?.userIds);
  const apply = db.transaction(() => {
    db.run("DELETE FROM project_managers WHERE project_id = ?", [projectId]);
    for (const id of ids)
      db.run("INSERT INTO project_managers (project_id, user_id) VALUES (?, ?)", [projectId, id]);
  });
  apply();
  res.json({ ok: true });
});

// ---------- board ----------

apiRouter.get("/projects/:id/board", (req, res) => {
  const projectId = Number(req.params.id);
  const ws = projectWorkspace(projectId);
  if (ws === null || !atLeast(getRole(user(req).id, ws), "read")) return notFound(res);
  const columns = db
    .query("SELECT * FROM columns WHERE project_id = ? ORDER BY position")
    .all(projectId) as { id: number }[];
  const tasks = columns.length
    ? (db
        .query(
          `SELECT * FROM tasks WHERE column_id IN (${columns.map(() => "?").join(",")})
           ORDER BY position`
        )
        .all(...columns.map((c) => c.id)) as Task[])
    : [];
  res.json({ columns, tasks: withAssignees(tasks), workspaceId: ws });
});

apiRouter.post("/projects/:id/columns", (req, res) => {
  const projectId = Number(req.params.id);
  const ws = projectWorkspace(projectId);
  if (ws === null) return notFound(res);
  if (getRole(user(req).id, ws) !== "admin") return forbidden(res);
  const name = str(req.body?.name, 100)?.trim();
  if (!name) return bad(res, "name required");
  const next = db
    .query("SELECT COALESCE(MAX(position) + 1, 0) AS p FROM columns WHERE project_id = ?")
    .get(projectId) as { p: number };
  res.status(201).json(
    db
      .query("INSERT INTO columns (project_id, name, position) VALUES (?, ?, ?) RETURNING *")
      .get(projectId, name, next.p)
  );
});

// designate a column as the "done" column (one per project)
apiRouter.patch("/columns/:id/done", (req, res) => {
  const ctx = columnWorkspace(Number(req.params.id));
  if (!ctx) return notFound(res);
  if (getRole(user(req).id, ctx.workspace_id) !== "admin") return forbidden(res);
  const makeDone = db.transaction(() => {
    db.run("UPDATE columns SET is_done = 0 WHERE project_id = ?", [ctx.project_id]);
    db.run("UPDATE columns SET is_done = 1 WHERE id = ?", [Number(req.params.id)]);
    // everything already in the column counts as completed
    db.run(
      `UPDATE tasks SET completed_at = COALESCE(completed_at, datetime('now'))
       WHERE column_id = ?`,
      [Number(req.params.id)]
    );
    db.run(
      `UPDATE tasks SET completed_at = NULL
       WHERE column_id IN (SELECT id FROM columns WHERE project_id = ? AND is_done = 0)`,
      [ctx.project_id]
    );
  });
  makeDone();
  res.json({ ok: true });
});

apiRouter.delete("/columns/:id", (req, res) => {
  const ctx = columnWorkspace(Number(req.params.id));
  if (!ctx) return notFound(res);
  if (getRole(user(req).id, ctx.workspace_id) !== "admin") return forbidden(res);
  db.run("DELETE FROM columns WHERE id = ?", [Number(req.params.id)]);
  res.json({ ok: true });
});

// ---------- tasks ----------

apiRouter.post("/tasks", (req, res) => {
  const columnId = req.body?.columnId == null ? null : Number(req.body.columnId);
  const title = str(req.body?.title, 500)?.trim();
  if (!title) return bad(res, "title required");

  let projectId: number | null = null;
  let workspaceId: number | null = null;
  let assigneeIds: number[] = [];
  if (columnId !== null) {
    const ctx = columnWorkspace(columnId);
    if (!ctx) return notFound(res);
    if (!atLeast(getRole(user(req).id, ctx.workspace_id), "write")) return forbidden(res);
    projectId = ctx.project_id;
    workspaceId = ctx.workspace_id;
    assigneeIds = memberIdsOnly(workspaceId, req.body?.assignees);
    if (assigneeIds.length === 0)
      return bad(res, "assign at least one workspace member to the task");
  }

  const tags: string[] = Array.isArray(req.body?.tags)
    ? req.body.tags.filter((t: unknown) => typeof t === "string").slice(0, 20)
    : [];
  if (workspaceId !== null) registerTags(workspaceId, tags);

  const next = (
    columnId !== null
      ? db
          .query("SELECT COALESCE(MAX(position) + 1, 0) AS p FROM tasks WHERE column_id = ?")
          .get(columnId)
      : db
          .query(
            "SELECT COALESCE(MAX(position) + 1, 0) AS p FROM tasks WHERE column_id IS NULL AND created_by = ?"
          )
          .get(user(req).id)
  ) as { p: number };

  const task = db
    .query(
      `INSERT INTO tasks (column_id, title, description, priority, due_date, tags, position, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
    )
    .get(
      columnId,
      title,
      str(req.body?.description, 10000) ?? "",
      ["low", "medium", "high", "urgent"].includes(req.body?.priority)
        ? req.body.priority
        : "low",
      str(req.body?.dueDate, 30),
      JSON.stringify(tags),
      next.p,
      user(req).id
    ) as Task;

  if (workspaceId !== null) {
    setAssignees(task.id, workspaceId, assigneeIds);
    const notify = emailsOf(assigneeIds.filter((id) => id !== user(req).id));
    if (notify.length)
      sendTaskAssigned({
        to: notify,
        taskTitle: task.title,
        description: task.description,
        projectName: projectName(projectId),
        dueDate: task.due_date,
        priority: task.priority,
        assignedBy: user(req).name,
      });
  }
  logActivity(user(req).id, projectId, "created task", title);
  res.status(201).json(withAssignees([task])[0]);
});

apiRouter.patch("/tasks/:id", (req, res) => {
  const existing = taskCtx(Number(req.params.id));
  if (!existing) return notFound(res);
  const role = taskRole(req, existing);
  if (!atLeast(role, "checker")) return forbidden(res);

  const keys = Object.keys(req.body ?? {});
  const completionOnly = keys.every((k) => k === "completed");
  if (!atLeast(role, "write") && !completionOnly) return forbidden(res);

  const title = str(req.body?.title, 500)?.trim() ?? existing.title;
  const description = str(req.body?.description, 10000) ?? existing.description;
  const priority = ["low", "medium", "high", "urgent"].includes(req.body?.priority)
    ? req.body.priority
    : existing.priority;
  const dueDate =
    req.body?.dueDate === null ? null : str(req.body?.dueDate, 30) ?? existing.due_date;
  let tags = existing.tags;
  if (Array.isArray(req.body?.tags)) {
    const names = req.body.tags.filter((t: unknown) => typeof t === "string").slice(0, 20);
    tags = JSON.stringify(names);
    if (existing.workspace_id !== null) registerTags(existing.workspace_id, names);
  }
  const completedAt =
    req.body?.completed === true
      ? existing.completed_at ?? new Date().toISOString()
      : req.body?.completed === false
        ? null
        : existing.completed_at;

  const task = db
    .query(
      `UPDATE tasks SET title = ?, description = ?, priority = ?, due_date = ?, tags = ?,
       completed_at = ?, updated_at = datetime('now') WHERE id = ? RETURNING *`
    )
    .get(title, description, priority, dueDate, tags, completedAt, existing.id) as Task;

  if (
    existing.workspace_id !== null &&
    Array.isArray(req.body?.assignees) &&
    atLeast(role, "write")
  ) {
    const before = new Set((assigneesFor([existing.id]).get(existing.id) ?? []).map((a) => a.id));
    const after = memberIdsOnly(existing.workspace_id, req.body.assignees);
    setAssignees(existing.id, existing.workspace_id, after);
    const added = after.filter((id) => !before.has(id) && id !== user(req).id);
    const notify = emailsOf(added);
    if (notify.length)
      sendTaskAssigned({
        to: notify,
        taskTitle: title,
        description,
        projectName: projectName(existing.project_id),
        dueDate,
        priority,
        assignedBy: user(req).name,
      });
  }

  if (req.body?.completed === true && !existing.completed_at)
    logActivity(user(req).id, existing.project_id, "completed task", title);
  res.json(withAssignees([task])[0]);
});

apiRouter.patch("/tasks/:id/move", (req, res) => {
  const existing = taskCtx(Number(req.params.id));
  if (!existing || existing.workspace_id === null) return notFound(res);
  const role = taskRole(req, existing);
  const toColumn = Number(req.body?.columnId);
  const toPosition = Number(req.body?.position);
  const target = db
    .query("SELECT is_done, project_id FROM columns WHERE id = ?")
    .get(toColumn) as { is_done: number; project_id: number } | null;
  if (!target || Number.isNaN(toPosition)) return bad(res, "columnId and position required");
  const targetCtx = columnWorkspace(toColumn);
  if (!targetCtx || targetCtx.workspace_id !== existing.workspace_id) return notFound(res);

  // checker may only move tasks into or out of the done column
  const source = db
    .query("SELECT is_done FROM columns WHERE id = ?")
    .get(existing.column_id!) as { is_done: number } | null;
  const completionMove = !!target.is_done || !!source?.is_done;
  if (!atLeast(role, "write") && !(role === "checker" && completionMove)) return forbidden(res);

  const move = db.transaction(() => {
    db.run("UPDATE tasks SET position = position - 1 WHERE column_id = ? AND position > ?", [
      existing.column_id,
      existing.position,
    ]);
    db.run("UPDATE tasks SET position = position + 1 WHERE column_id = ? AND position >= ?", [
      toColumn,
      toPosition,
    ]);
    db.run(
      `UPDATE tasks SET column_id = ?, position = ?,
       completed_at = CASE WHEN ?4 = 1 THEN COALESCE(completed_at, datetime('now')) ELSE NULL END,
       updated_at = datetime('now') WHERE id = ?3`,
      [toColumn, toPosition, existing.id, target.is_done]
    );
  });
  move();
  if (target.is_done && !existing.completed_at)
    logActivity(user(req).id, existing.project_id, "completed task", existing.title);
  res.json({ ok: true });
});

apiRouter.delete("/tasks/:id", (req, res) => {
  const existing = taskCtx(Number(req.params.id));
  if (!existing) return notFound(res);
  if (!atLeast(taskRole(req, existing), "write")) return forbidden(res);
  db.run("DELETE FROM tasks WHERE id = ?", [existing.id]);
  logActivity(user(req).id, existing.project_id, "deleted task", existing.title);
  res.json({ ok: true });
});

// personal tasks + tasks assigned to me
apiRouter.get("/tasks/mine", (req, res) => {
  const rows = db
    .query(
      `SELECT DISTINCT t.*, c.project_id FROM tasks t
       LEFT JOIN columns c ON c.id = t.column_id
       LEFT JOIN task_assignees ta ON ta.task_id = t.id
       WHERE (t.column_id IS NULL AND t.created_by = ?1) OR ta.user_id = ?1
       ORDER BY t.due_date IS NULL, t.due_date`
    )
    .all(user(req).id) as Task[];
  res.json(withAssignees(rows));
});

// ---------- milestones ----------

apiRouter.get("/projects/:id/milestones", (req, res) => {
  const ws = projectWorkspace(Number(req.params.id));
  if (ws === null || !atLeast(getRole(user(req).id, ws), "read")) return notFound(res);
  res.json(
    db
      .query("SELECT * FROM milestones WHERE project_id = ? ORDER BY position")
      .all(Number(req.params.id))
  );
});

apiRouter.post("/projects/:id/milestones", (req, res) => {
  const projectId = Number(req.params.id);
  const ws = projectWorkspace(projectId);
  if (ws === null) return notFound(res);
  if (!atLeast(getRole(user(req).id, ws), "write")) return forbidden(res);
  const title = str(req.body?.title, 300)?.trim();
  if (!title) return bad(res, "title required");
  const next = db
    .query("SELECT COALESCE(MAX(position) + 1, 0) AS p FROM milestones WHERE project_id = ?")
    .get(projectId) as { p: number };
  res.status(201).json(
    db
      .query(
        "INSERT INTO milestones (project_id, title, due_date, position) VALUES (?, ?, ?, ?) RETURNING *"
      )
      .get(projectId, title, str(req.body?.dueDate, 30), next.p)
  );
});

apiRouter.patch("/milestones/:id", (req, res) => {
  const m = db
    .query("SELECT project_id FROM milestones WHERE id = ?")
    .get(Number(req.params.id)) as { project_id: number } | null;
  if (!m) return notFound(res);
  const ws = projectWorkspace(m.project_id);
  if (ws === null || !atLeast(getRole(user(req).id, ws), "checker")) return forbidden(res);
  res.json(
    db
      .query("UPDATE milestones SET done = ? WHERE id = ? RETURNING *")
      .get(req.body?.done ? 1 : 0, Number(req.params.id))
  );
});

apiRouter.delete("/milestones/:id", (req, res) => {
  const m = db
    .query("SELECT project_id FROM milestones WHERE id = ?")
    .get(Number(req.params.id)) as { project_id: number } | null;
  if (!m) return notFound(res);
  const ws = projectWorkspace(m.project_id);
  if (ws === null || !atLeast(getRole(user(req).id, ws), "write")) return forbidden(res);
  db.run("DELETE FROM milestones WHERE id = ?", [Number(req.params.id)]);
  res.json({ ok: true });
});

// ---------- notes, activity, focus, widgets (personal) ----------

apiRouter.get("/notes", (req, res) => {
  res.json(db.query("SELECT * FROM notes WHERE user_id = ? ORDER BY id").all(user(req).id));
});

apiRouter.post("/notes", (req, res) => {
  res.status(201).json(
    db
      .query("INSERT INTO notes (user_id, content, color) VALUES (?, ?, ?) RETURNING *")
      .get(user(req).id, str(req.body?.content, 5000) ?? "", str(req.body?.color, 20) ?? "yellow")
  );
});

apiRouter.patch("/notes/:id", (req, res) => {
  const row = db
    .query(
      `UPDATE notes SET content = ?, updated_at = datetime('now')
       WHERE id = ? AND user_id = ? RETURNING *`
    )
    .get(str(req.body?.content, 5000) ?? "", Number(req.params.id), user(req).id);
  if (!row) return notFound(res);
  res.json(row);
});

apiRouter.delete("/notes/:id", (req, res) => {
  db.run("DELETE FROM notes WHERE id = ? AND user_id = ?", [Number(req.params.id), user(req).id]);
  res.json({ ok: true });
});

apiRouter.get("/activity", (req, res) => {
  res.json(
    db
      .query(
        `SELECT a.*, u.name AS user_name FROM activity a
         JOIN users u ON u.id = a.user_id
         WHERE a.user_id = ? ORDER BY a.created_at DESC LIMIT 30`
      )
      .all(user(req).id)
  );
});

apiRouter.get("/focus", (req, res) => {
  const row = db
    .query("SELECT goal, date FROM focus WHERE user_id = ? AND date = date('now')")
    .get(user(req).id);
  res.json(row ?? { goal: "", date: null });
});

apiRouter.put("/focus", (req, res) => {
  const goal = str(req.body?.goal, 500) ?? "";
  db.run(
    `INSERT INTO focus (user_id, goal, date) VALUES (?, ?, date('now'))
     ON CONFLICT (user_id) DO UPDATE SET goal = excluded.goal, date = excluded.date`,
    [user(req).id, goal]
  );
  res.json({ goal });
});

apiRouter.get("/widgets/layout", (req, res) => {
  const row = db
    .query("SELECT layout FROM widget_layouts WHERE user_id = ?")
    .get(user(req).id) as { layout: string } | null;
  res.json(row ? JSON.parse(row.layout) : null);
});

apiRouter.put("/widgets/layout", (req, res) => {
  if (!Array.isArray(req.body)) return bad(res, "layout must be an array");
  db.run(
    `INSERT INTO widget_layouts (user_id, layout, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT (user_id) DO UPDATE SET layout = excluded.layout, updated_at = excluded.updated_at`,
    [user(req).id, JSON.stringify(req.body.slice(0, 50))]
  );
  res.json({ ok: true });
});
