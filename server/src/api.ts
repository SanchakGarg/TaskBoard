import { Router, type Response } from "express";
import { sql, logActivity, type Task, type User } from "./db";
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

const getRole = async (userId: number, workspaceId: number): Promise<Role | null> => {
  const [ws] = await sql<{ owner_id: number }[]>`SELECT owner_id FROM workspaces WHERE id = ${workspaceId}`;
  if (!ws) return null;
  if (ws.owner_id === userId) return "admin";
  const [m] = await sql<{ role: Role }[]>`
    SELECT role FROM workspace_members WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
  `;
  return m?.role ?? null;
};

const atLeast = (role: Role | null, min: Role): boolean =>
  role !== null && roleRank[role] >= roleRank[min];

const projectWorkspace = async (projectId: number): Promise<number | null> => {
  const [row] = await sql<{ workspace_id: number }[]>`SELECT workspace_id FROM projects WHERE id = ${projectId}`;
  return row?.workspace_id ?? null;
};

const columnWorkspace = async (columnId: number): Promise<{ workspace_id: number; project_id: number } | null> => {
  const [row] = await sql<{ workspace_id: number; project_id: number }[]>`
    SELECT p.workspace_id, p.id AS project_id FROM columns c
    JOIN projects p ON p.id = c.project_id WHERE c.id = ${columnId}
  `;
  return row ?? null;
};

type TaskCtx = Task & { project_id: number | null; workspace_id: number | null };

const taskCtx = async (taskId: number): Promise<TaskCtx | null> => {
  const [row] = await sql<TaskCtx[]>`
    SELECT t.*, c.project_id, p.workspace_id FROM tasks t
    LEFT JOIN columns c ON c.id = t.column_id
    LEFT JOIN projects p ON p.id = c.project_id
    WHERE t.id = ${taskId}
  `;
  return row ?? null;
};

const taskRole = async (req: unknown, t: TaskCtx): Promise<Role | null> => {
  if (t.workspace_id === null)
    return t.created_by === user(req).id ? "write" : null;
  return getRole(user(req).id, t.workspace_id);
};

// ---------- tag registry helpers ----------

const TAG_PALETTE = [
  "#2f5d9e", "#c0533e", "#4a7c59", "#c98a2d", "#7b5ea7", "#3e8e8c",
  "#b5527d", "#6b8e23", "#a0522d", "#4682b4", "#9e2f5d", "#5d9e2f",
];

const registerTags = async (workspaceId: number, names: string[]) => {
  for (const name of names) {
    const [exists] = await sql`SELECT 1 FROM tags WHERE workspace_id = ${workspaceId} AND name = ${name}`;
    if (!exists) {
      const [countRow] = await sql<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM tags WHERE workspace_id = ${workspaceId}`;
      const c = countRow?.c ?? 0;
      await sql`INSERT INTO tags (workspace_id, name, color) VALUES (${workspaceId}, ${name}, ${TAG_PALETTE[c % TAG_PALETTE.length]!})
        ON CONFLICT (workspace_id, name) DO NOTHING`;
    }
  }
};

// ---------- assignees ----------

interface Assignee {
  id: number;
  name: string;
  avatar_url: string;
}

const assigneesFor = async (taskIds: number[]): Promise<Map<number, Assignee[]>> => {
  const map = new Map<number, Assignee[]>();
  if (!taskIds.length) return map;
  const rows = await sql<(Assignee & { task_id: number })[]>`
    SELECT ta.task_id, u.id, u.name, u.avatar_url FROM task_assignees ta
    JOIN users u ON u.id = ta.user_id
    WHERE ta.task_id IN ${sql(taskIds)}
  `;
  for (const r of rows) {
    const list = map.get(r.task_id) ?? [];
    list.push({ id: r.id, name: r.name, avatar_url: r.avatar_url });
    map.set(r.task_id, list);
  }
  return map;
};

const setAssignees = async (taskId: number, workspaceId: number, userIds: unknown) => {
  if (!Array.isArray(userIds)) return;
  await sql`DELETE FROM task_assignees WHERE task_id = ${taskId}`;
  for (const uid of userIds.slice(0, 20)) {
    if (typeof uid !== "number") continue;
    if (await getRole(uid, workspaceId) === null) continue;
    await sql`INSERT INTO task_assignees (task_id, user_id) VALUES (${taskId}, ${uid}) ON CONFLICT DO NOTHING`;
  }
};

const withAssignees = async <T extends { id: number }>(tasks: T[]): Promise<(T & { assignees: Assignee[] })[]> => {
  const map = await assigneesFor(tasks.map((t) => t.id));
  return tasks.map((t) => ({ ...t, assignees: map.get(t.id) ?? [] }));
};

const emailsOf = async (userIds: number[]): Promise<string[]> => {
  if (!userIds.length) return [];
  const rows = await sql<{ email: string }[]>`SELECT email FROM users WHERE id IN ${sql(userIds)}`;
  return rows.map((u) => u.email);
};

const memberIdsOnly = async (workspaceId: number, ids: unknown): Promise<number[]> => {
  if (!Array.isArray(ids)) return [];
  const unique = [...new Set(ids.filter((n): n is number => typeof n === "number"))];
  const results = await Promise.all(unique.map(async (id) => ({ id, role: await getRole(id, workspaceId) })));
  return results.filter((r) => r.role !== null).map((r) => r.id);
};

const projectName = async (projectId: number | null): Promise<string> => {
  if (projectId === null) return "Personal";
  const [row] = await sql<{ name: string }[]>`SELECT name FROM projects WHERE id = ${projectId}`;
  return row?.name ?? "a project";
};

// ---------- workspaces ----------

apiRouter.get("/workspaces", async (req, res) => {
  const rows = await sql`
    SELECT w.*, CASE WHEN w.owner_id = ${user(req).id} THEN 'admin' ELSE m.role END AS role
    FROM workspaces w
    LEFT JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = ${user(req).id}
    WHERE w.owner_id = ${user(req).id} OR m.user_id IS NOT NULL
    ORDER BY w.position, w.created_at
  `;
  res.json(rows);
});

apiRouter.post("/workspaces", async (req, res) => {
  const name = str(req.body?.name, 100)?.trim();
  if (!name) return bad(res, "name required");
  const [nextRow] = await sql<{ p: number }[]>`SELECT COALESCE(MAX(position) + 1, 0) AS p FROM workspaces WHERE owner_id = ${user(req).id}`;
  const [ws] = await sql`INSERT INTO workspaces (name, owner_id, position) VALUES (${name}, ${user(req).id}, ${nextRow?.p ?? 0}) RETURNING *`;
  res.status(201).json({ ...ws, role: "admin" });
});

apiRouter.patch("/workspaces/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (await getRole(user(req).id, id) !== "admin") return forbidden(res);
  const name = str(req.body?.name, 100)?.trim();
  if (!name) return bad(res, "name required");
  const [row] = await sql`UPDATE workspaces SET name = ${name} WHERE id = ${id} RETURNING *`;
  res.json(row);
});

apiRouter.delete("/workspaces/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (await getRole(user(req).id, id) !== "admin") return forbidden(res);
  await sql`DELETE FROM workspaces WHERE id = ${id}`;
  res.json({ ok: true });
});

// ---------- workspace members ----------

apiRouter.get("/workspaces/:id/members", async (req, res) => {
  const id = Number(req.params.id);
  if (!atLeast(await getRole(user(req).id, id), "read")) return notFound(res);
  const [owner] = await sql`
    SELECT u.id, u.name, u.email, u.avatar_url, 'admin' AS role, true AS is_owner
    FROM workspaces w JOIN users u ON u.id = w.owner_id WHERE w.id = ${id}
  `;
  const members = await sql`
    SELECT u.id, u.name, u.email, u.avatar_url, m.role, false AS is_owner
    FROM workspace_members m JOIN users u ON u.id = m.user_id
    WHERE m.workspace_id = ${id} ORDER BY u.name
  `;
  res.json([owner, ...members].filter(Boolean));
});

apiRouter.post("/workspaces/:id/members", async (req, res) => {
  const id = Number(req.params.id);
  if (await getRole(user(req).id, id) !== "admin") return forbidden(res);
  const email = str(req.body?.email, 200)?.trim().toLowerCase();
  const role = req.body?.role;
  if (!email || !isRole(role)) return bad(res, "email and valid role required");
  const [target] = await sql<{ id: number }[]>`SELECT id FROM users WHERE lower(email) = ${email}`;
  if (!target) return res.status(404).json({ error: "no user with that email has signed in yet" });
  const [wsRow] = await sql<{ owner_id: number }[]>`SELECT owner_id FROM workspaces WHERE id = ${id}`;
  if (target.id === wsRow?.owner_id) return bad(res, "owner is already an admin");
  await sql`
    INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (${id}, ${target.id}, ${role})
    ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = excluded.role
  `;
  const [ws] = await sql<{ name: string }[]>`SELECT name FROM workspaces WHERE id = ${id}`;
  sendWorkspaceInvite({ to: email, workspaceName: ws?.name ?? "", role, invitedBy: user(req).name });
  res.status(201).json({ ok: true });
});

apiRouter.patch("/workspaces/:id/members/:userId", async (req, res) => {
  const id = Number(req.params.id);
  if (await getRole(user(req).id, id) !== "admin") return forbidden(res);
  if (!isRole(req.body?.role)) return bad(res, "valid role required");
  await sql`UPDATE workspace_members SET role = ${req.body.role} WHERE workspace_id = ${id} AND user_id = ${Number(req.params.userId)}`;
  res.json({ ok: true });
});

apiRouter.delete("/workspaces/:id/members/:userId", async (req, res) => {
  const id = Number(req.params.id);
  if (await getRole(user(req).id, id) !== "admin") return forbidden(res);
  await sql`DELETE FROM workspace_members WHERE workspace_id = ${id} AND user_id = ${Number(req.params.userId)}`;
  res.json({ ok: true });
});

// ---------- workspace tags ----------

apiRouter.get("/workspaces/:id/tags", async (req, res) => {
  const id = Number(req.params.id);
  if (!atLeast(await getRole(user(req).id, id), "read")) return notFound(res);
  const rows = await sql`SELECT * FROM tags WHERE workspace_id = ${id} ORDER BY name`;
  res.json(rows);
});

apiRouter.patch("/tags/:id", async (req, res) => {
  const [tag] = await sql<{ id: number; workspace_id: number }[]>`SELECT id, workspace_id FROM tags WHERE id = ${Number(req.params.id)}`;
  if (!tag) return notFound(res);
  if (await getRole(user(req).id, tag.workspace_id) !== "admin") return forbidden(res);
  const color = str(req.body?.color, 20)?.trim();
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) return bad(res, "color must be #rrggbb");
  const [row] = await sql`UPDATE tags SET color = ${color} WHERE id = ${tag.id} RETURNING *`;
  res.json(row);
});

apiRouter.delete("/tags/:id", async (req, res) => {
  const [tag] = await sql<{ id: number; workspace_id: number }[]>`SELECT id, workspace_id FROM tags WHERE id = ${Number(req.params.id)}`;
  if (!tag) return notFound(res);
  if (await getRole(user(req).id, tag.workspace_id) !== "admin") return forbidden(res);
  await sql`DELETE FROM tags WHERE id = ${tag.id}`;
  res.json({ ok: true });
});

// ---------- projects ----------

apiRouter.get("/projects", async (req, res) => {
  const rows = await sql`
    SELECT p.* FROM projects p
    JOIN workspaces w ON w.id = p.workspace_id
    LEFT JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = ${user(req).id}
    WHERE w.owner_id = ${user(req).id} OR m.user_id IS NOT NULL
    ORDER BY p.position, p.created_at
  `;
  res.json(rows);
});

apiRouter.post("/projects", async (req, res) => {
  const name = str(req.body?.name, 200)?.trim();
  if (!name) return bad(res, "name required");
  const workspaceId = Number(req.body?.workspaceId);
  if (await getRole(user(req).id, workspaceId) !== "admin") return forbidden(res);
  const viewType = req.body?.viewType === "list" ? "list" : "kanban";
  const [nextRow] = await sql<{ p: number }[]>`SELECT COALESCE(MAX(position) + 1, 0) AS p FROM projects WHERE workspace_id = ${workspaceId}`;
  const [project] = await sql<{ id: number }[]>`
    INSERT INTO projects (name, description, owner_id, workspace_id, view_type, position)
    VALUES (${name}, ${str(req.body?.description) ?? ""}, ${user(req).id}, ${workspaceId}, ${viewType}, ${nextRow?.p ?? 0})
    RETURNING *
  `;
  const defaults: [string, number][] =
    viewType === "list" ? [["Tasks", 0]] : [["Todo", 0], ["In Progress", 0], ["Done", 1]];
  for (let i = 0; i < defaults.length; i++) {
    const [colName, isDone] = defaults[i]!;
    await sql`INSERT INTO columns (project_id, name, position, is_done) VALUES (${project!.id}, ${colName}, ${i}, ${isDone})`;
  }
  await logActivity(user(req).id, project!.id, "created project", name);
  res.status(201).json(project);
});

apiRouter.patch("/projects/reorder", async (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "number"))
    return bad(res, "ids must be an array of numbers");
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i] as number;
    const ws = await projectWorkspace(id);
    if (ws !== null && atLeast(await getRole(user(req).id, ws), "write")) {
      await sql`UPDATE projects SET position = ${i} WHERE id = ${id}`;
    }
  }
  res.json({ ok: true });
});

apiRouter.patch("/projects/:id", async (req, res) => {
  const id = Number(req.params.id);
  const ws = await projectWorkspace(id);
  if (ws === null) return notFound(res);
  if (await getRole(user(req).id, ws) !== "admin") return forbidden(res);
  const name = str(req.body?.name, 200)?.trim();
  if (!name) return bad(res, "name required");
  const [row] = await sql`UPDATE projects SET name = ${name} WHERE id = ${id} RETURNING *`;
  res.json(row);
});

apiRouter.delete("/projects/:id", async (req, res) => {
  const id = Number(req.params.id);
  const ws = await projectWorkspace(id);
  if (ws === null) return notFound(res);
  if (await getRole(user(req).id, ws) !== "admin") return forbidden(res);
  await sql`DELETE FROM projects WHERE id = ${id}`;
  res.json({ ok: true });
});

// ---------- project managers ----------

apiRouter.get("/projects/:id/managers", async (req, res) => {
  const projectId = Number(req.params.id);
  const ws = await projectWorkspace(projectId);
  if (ws === null || !atLeast(await getRole(user(req).id, ws), "read")) return notFound(res);
  const rows = await sql`
    SELECT u.id, u.name, u.email, u.avatar_url FROM project_managers pm
    JOIN users u ON u.id = pm.user_id WHERE pm.project_id = ${projectId} ORDER BY u.name
  `;
  res.json(rows);
});

apiRouter.put("/projects/:id/managers", async (req, res) => {
  const projectId = Number(req.params.id);
  const ws = await projectWorkspace(projectId);
  if (ws === null) return notFound(res);
  if (await getRole(user(req).id, ws) !== "admin") return forbidden(res);
  const ids = await memberIdsOnly(ws, req.body?.userIds);
  await sql`DELETE FROM project_managers WHERE project_id = ${projectId}`;
  for (const id of ids) {
    await sql`INSERT INTO project_managers (project_id, user_id) VALUES (${projectId}, ${id})`;
  }
  res.json({ ok: true });
});

// ---------- board ----------

apiRouter.get("/projects/:id/board", async (req, res) => {
  const projectId = Number(req.params.id);
  const ws = await projectWorkspace(projectId);
  if (ws === null || !atLeast(await getRole(user(req).id, ws), "read")) return notFound(res);
  const columns = await sql<{ id: number }[]>`SELECT * FROM columns WHERE project_id = ${projectId} ORDER BY position`;
  const tasks = columns.length
    ? await sql<Task[]>`SELECT * FROM tasks WHERE column_id IN ${sql(columns.map((c) => c.id))} ORDER BY position`
    : [];
  res.json({ columns, tasks: await withAssignees(tasks), workspaceId: ws });
});

apiRouter.post("/projects/:id/columns", async (req, res) => {
  const projectId = Number(req.params.id);
  const ws = await projectWorkspace(projectId);
  if (ws === null) return notFound(res);
  if (await getRole(user(req).id, ws) !== "admin") return forbidden(res);
  const name = str(req.body?.name, 100)?.trim();
  if (!name) return bad(res, "name required");
  const [nextRow] = await sql<{ p: number }[]>`SELECT COALESCE(MAX(position) + 1, 0) AS p FROM columns WHERE project_id = ${projectId}`;
  const [col] = await sql`INSERT INTO columns (project_id, name, position) VALUES (${projectId}, ${name}, ${nextRow?.p ?? 0}) RETURNING *`;
  res.status(201).json(col);
});

apiRouter.patch("/columns/:id/done", async (req, res) => {
  const ctx = await columnWorkspace(Number(req.params.id));
  if (!ctx) return notFound(res);
  if (await getRole(user(req).id, ctx.workspace_id) !== "admin") return forbidden(res);
  await sql`UPDATE columns SET is_done = 0 WHERE project_id = ${ctx.project_id}`;
  await sql`UPDATE columns SET is_done = 1 WHERE id = ${Number(req.params.id)}`;
  await sql`UPDATE tasks SET completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP) WHERE column_id = ${Number(req.params.id)}`;
  await sql`UPDATE tasks SET completed_at = NULL WHERE column_id IN (SELECT id FROM columns WHERE project_id = ${ctx.project_id} AND is_done = 0)`;
  res.json({ ok: true });
});

apiRouter.delete("/columns/:id", async (req, res) => {
  const ctx = await columnWorkspace(Number(req.params.id));
  if (!ctx) return notFound(res);
  if (await getRole(user(req).id, ctx.workspace_id) !== "admin") return forbidden(res);
  await sql`DELETE FROM columns WHERE id = ${Number(req.params.id)}`;
  res.json({ ok: true });
});

// ---------- tasks ----------

apiRouter.post("/tasks", async (req, res) => {
  const columnId = req.body?.columnId == null ? null : Number(req.body.columnId);
  const title = str(req.body?.title, 500)?.trim();
  if (!title) return bad(res, "title required");

  let projectId: number | null = null;
  let workspaceId: number | null = null;
  let assigneeIds: number[] = [];
  if (columnId !== null) {
    const ctx = await columnWorkspace(columnId);
    if (!ctx) return notFound(res);
    if (!atLeast(await getRole(user(req).id, ctx.workspace_id), "write")) return forbidden(res);
    projectId = ctx.project_id;
    workspaceId = ctx.workspace_id;
    assigneeIds = await memberIdsOnly(workspaceId, req.body?.assignees);
    if (assigneeIds.length === 0)
      return bad(res, "assign at least one workspace member to the task");
  }

  const tags: string[] = Array.isArray(req.body?.tags)
    ? req.body.tags.filter((t: unknown) => typeof t === "string").slice(0, 20)
    : [];
  if (workspaceId !== null) await registerTags(workspaceId, tags);

  const [nextRow] = columnId !== null
    ? await sql<{ p: number }[]>`SELECT COALESCE(MAX(position) + 1, 0) AS p FROM tasks WHERE column_id = ${columnId}`
    : await sql<{ p: number }[]>`SELECT COALESCE(MAX(position) + 1, 0) AS p FROM tasks WHERE column_id IS NULL AND created_by = ${user(req).id}`;

  const priority = ["low", "medium", "high", "urgent"].includes(req.body?.priority)
    ? req.body.priority : "low";

  const [task] = await sql<Task[]>`
    INSERT INTO tasks (column_id, title, description, priority, due_date, tags, position, created_by)
    VALUES (${columnId}, ${title}, ${str(req.body?.description, 10000) ?? ""}, ${priority},
            ${str(req.body?.dueDate, 30) ?? null}, ${JSON.stringify(tags)}, ${nextRow?.p ?? 0}, ${user(req).id})
    RETURNING *
  `;

  if (workspaceId !== null && task) {
    await setAssignees(task.id, workspaceId, assigneeIds);
    const notify = await emailsOf(assigneeIds.filter((id) => id !== user(req).id));
    if (notify.length)
      sendTaskAssigned({
        to: notify,
        taskTitle: task.title,
        description: task.description,
        projectName: await projectName(projectId),
        dueDate: task.due_date,
        priority: task.priority,
        assignedBy: user(req).name,
      });
  }
  if (task) await logActivity(user(req).id, projectId, "created task", title);
  res.status(201).json(task ? (await withAssignees([task]))[0] : null);
});

apiRouter.patch("/tasks/:id", async (req, res) => {
  const existing = await taskCtx(Number(req.params.id));
  if (!existing) return notFound(res);
  const role = await taskRole(req, existing);
  if (!atLeast(role, "checker")) return forbidden(res);

  const keys = Object.keys(req.body ?? {});
  const completionOnly = keys.every((k) => k === "completed");
  if (!atLeast(role, "write") && !completionOnly) return forbidden(res);

  const title = str(req.body?.title, 500)?.trim() ?? existing.title;
  const description = str(req.body?.description, 10000) ?? existing.description;
  const priority = ["low", "medium", "high", "urgent"].includes(req.body?.priority)
    ? req.body.priority : existing.priority;
  const dueDate = req.body?.dueDate === null ? null : str(req.body?.dueDate, 30) ?? existing.due_date;
  let tags = existing.tags;
  if (Array.isArray(req.body?.tags)) {
    const names = req.body.tags.filter((t: unknown) => typeof t === "string").slice(0, 20);
    tags = JSON.stringify(names);
    if (existing.workspace_id !== null) await registerTags(existing.workspace_id, names);
  }
  const completedAt =
    req.body?.completed === true
      ? existing.completed_at ?? new Date().toISOString()
      : req.body?.completed === false
        ? null
        : existing.completed_at;

  const [task] = await sql<Task[]>`
    UPDATE tasks SET title = ${title}, description = ${description}, priority = ${priority},
    due_date = ${dueDate ?? null}, tags = ${tags}, completed_at = ${completedAt ?? null},
    updated_at = CURRENT_TIMESTAMP WHERE id = ${existing.id} RETURNING *
  `;

  if (existing.workspace_id !== null && Array.isArray(req.body?.assignees) && atLeast(role, "write")) {
    const before = new Set(((await assigneesFor([existing.id])).get(existing.id) ?? []).map((a) => a.id));
    const after = await memberIdsOnly(existing.workspace_id, req.body.assignees);
    await setAssignees(existing.id, existing.workspace_id, after);
    const added = after.filter((id) => !before.has(id) && id !== user(req).id);
    const notify = await emailsOf(added);
    if (notify.length)
      sendTaskAssigned({
        to: notify,
        taskTitle: title,
        description,
        projectName: await projectName(existing.project_id),
        dueDate,
        priority,
        assignedBy: user(req).name,
      });
  }

  if (req.body?.completed === true && !existing.completed_at)
    await logActivity(user(req).id, existing.project_id, "completed task", title);
  res.json(task ? (await withAssignees([task]))[0] : null);
});

apiRouter.patch("/tasks/:id/move", async (req, res) => {
  const existing = await taskCtx(Number(req.params.id));
  if (!existing || existing.workspace_id === null) return notFound(res);
  const role = await taskRole(req, existing);
  const toColumn = Number(req.body?.columnId);
  const toPosition = Number(req.body?.position);
  const [target] = await sql<{ is_done: number; project_id: number }[]>`SELECT is_done, project_id FROM columns WHERE id = ${toColumn}`;
  if (!target || Number.isNaN(toPosition)) return bad(res, "columnId and position required");
  const targetCtx = await columnWorkspace(toColumn);
  if (!targetCtx || targetCtx.workspace_id !== existing.workspace_id) return notFound(res);

  const [source] = await sql<{ is_done: number }[]>`SELECT is_done FROM columns WHERE id = ${existing.column_id!}`;
  const completionMove = !!target.is_done || !!source?.is_done;
  if (!atLeast(role, "write") && !(role === "checker" && completionMove)) return forbidden(res);

  await sql`UPDATE tasks SET position = position - 1 WHERE column_id = ${existing.column_id!} AND position > ${existing.position}`;
  await sql`UPDATE tasks SET position = position + 1 WHERE column_id = ${toColumn} AND position >= ${toPosition}`;
  await sql`
    UPDATE tasks SET column_id = ${toColumn}, position = ${toPosition},
    completed_at = CASE WHEN ${target.is_done} = 1 THEN COALESCE(completed_at, CURRENT_TIMESTAMP) ELSE NULL END,
    updated_at = CURRENT_TIMESTAMP WHERE id = ${existing.id}
  `;

  if (target.is_done && !existing.completed_at)
    await logActivity(user(req).id, existing.project_id, "completed task", existing.title);
  res.json({ ok: true });
});

apiRouter.delete("/tasks/:id", async (req, res) => {
  const existing = await taskCtx(Number(req.params.id));
  if (!existing) return notFound(res);
  if (!atLeast(await taskRole(req, existing), "write")) return forbidden(res);
  await sql`DELETE FROM tasks WHERE id = ${existing.id}`;
  await logActivity(user(req).id, existing.project_id, "deleted task", existing.title);
  res.json({ ok: true });
});

apiRouter.get("/tasks/mine", async (req, res) => {
  const rows = await sql<Task[]>`
    SELECT DISTINCT t.*, c.project_id FROM tasks t
    LEFT JOIN columns c ON c.id = t.column_id
    LEFT JOIN task_assignees ta ON ta.task_id = t.id
    WHERE (t.column_id IS NULL AND t.created_by = ${user(req).id}) OR ta.user_id = ${user(req).id}
    ORDER BY t.due_date IS NULL, t.due_date
  `;
  res.json(await withAssignees(rows));
});

// ---------- milestones ----------

apiRouter.get("/projects/:id/milestones", async (req, res) => {
  const ws = await projectWorkspace(Number(req.params.id));
  if (ws === null || !atLeast(await getRole(user(req).id, ws), "read")) return notFound(res);
  const rows = await sql`SELECT * FROM milestones WHERE project_id = ${Number(req.params.id)} ORDER BY position`;
  res.json(rows);
});

apiRouter.post("/projects/:id/milestones", async (req, res) => {
  const projectId = Number(req.params.id);
  const ws = await projectWorkspace(projectId);
  if (ws === null) return notFound(res);
  if (!atLeast(await getRole(user(req).id, ws), "write")) return forbidden(res);
  const title = str(req.body?.title, 300)?.trim();
  if (!title) return bad(res, "title required");
  const [nextRow] = await sql<{ p: number }[]>`SELECT COALESCE(MAX(position) + 1, 0) AS p FROM milestones WHERE project_id = ${projectId}`;
  const [row] = await sql`
    INSERT INTO milestones (project_id, title, due_date, position)
    VALUES (${projectId}, ${title}, ${str(req.body?.dueDate, 30) ?? null}, ${nextRow?.p ?? 0}) RETURNING *
  `;
  res.status(201).json(row);
});

apiRouter.patch("/milestones/:id", async (req, res) => {
  const [m] = await sql<{ project_id: number }[]>`SELECT project_id FROM milestones WHERE id = ${Number(req.params.id)}`;
  if (!m) return notFound(res);
  const ws = await projectWorkspace(m.project_id);
  if (ws === null || !atLeast(await getRole(user(req).id, ws), "checker")) return forbidden(res);
  const [row] = await sql`UPDATE milestones SET done = ${req.body?.done ? 1 : 0} WHERE id = ${Number(req.params.id)} RETURNING *`;
  res.json(row);
});

apiRouter.delete("/milestones/:id", async (req, res) => {
  const [m] = await sql<{ project_id: number }[]>`SELECT project_id FROM milestones WHERE id = ${Number(req.params.id)}`;
  if (!m) return notFound(res);
  const ws = await projectWorkspace(m.project_id);
  if (ws === null || !atLeast(await getRole(user(req).id, ws), "write")) return forbidden(res);
  await sql`DELETE FROM milestones WHERE id = ${Number(req.params.id)}`;
  res.json({ ok: true });
});

// ---------- notes, activity, focus, widgets (personal) ----------

apiRouter.get("/notes", async (req, res) => {
  const rows = await sql`SELECT * FROM notes WHERE user_id = ${user(req).id} ORDER BY id`;
  res.json(rows);
});

apiRouter.post("/notes", async (req, res) => {
  const [row] = await sql`
    INSERT INTO notes (user_id, content, color)
    VALUES (${user(req).id}, ${str(req.body?.content, 5000) ?? ""}, ${str(req.body?.color, 20) ?? "yellow"}) RETURNING *
  `;
  res.status(201).json(row);
});

apiRouter.patch("/notes/:id", async (req, res) => {
  const [row] = await sql`
    UPDATE notes SET content = ${str(req.body?.content, 5000) ?? ""}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${Number(req.params.id)} AND user_id = ${user(req).id} RETURNING *
  `;
  if (!row) return notFound(res);
  res.json(row);
});

apiRouter.delete("/notes/:id", async (req, res) => {
  await sql`DELETE FROM notes WHERE id = ${Number(req.params.id)} AND user_id = ${user(req).id}`;
  res.json({ ok: true });
});

apiRouter.get("/activity", async (req, res) => {
  const rows = await sql`
    SELECT a.*, u.name AS user_name FROM activity a
    JOIN users u ON u.id = a.user_id
    WHERE a.user_id = ${user(req).id} ORDER BY a.created_at DESC LIMIT 30
  `;
  res.json(rows);
});

apiRouter.get("/focus", async (req, res) => {
  const [row] = await sql`SELECT goal, date FROM focus WHERE user_id = ${user(req).id} AND date = CURRENT_DATE`;
  res.json(row ?? { goal: "", date: null });
});

apiRouter.put("/focus", async (req, res) => {
  const goal = str(req.body?.goal, 500) ?? "";
  await sql`
    INSERT INTO focus (user_id, goal, date) VALUES (${user(req).id}, ${goal}, CURRENT_DATE)
    ON CONFLICT (user_id) DO UPDATE SET goal = excluded.goal, date = excluded.date
  `;
  res.json({ goal });
});

apiRouter.get("/widgets/layout", async (req, res) => {
  const [row] = await sql<{ layout: string }[]>`SELECT layout FROM widget_layouts WHERE user_id = ${user(req).id}`;
  res.json(row ? JSON.parse(row.layout) : null);
});

apiRouter.put("/widgets/layout", async (req, res) => {
  if (!Array.isArray(req.body)) return bad(res, "layout must be an array");
  const layout = JSON.stringify(req.body.slice(0, 50));
  await sql`
    INSERT INTO widget_layouts (user_id, layout, updated_at) VALUES (${user(req).id}, ${layout}, CURRENT_TIMESTAMP)
    ON CONFLICT (user_id) DO UPDATE SET layout = excluded.layout, updated_at = excluded.updated_at
  `;
  res.json({ ok: true });
});
