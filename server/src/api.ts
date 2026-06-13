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

const NOW_TEXT = "to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS')";

// ---------- roles ----------

export type Role = "read" | "checker" | "write" | "admin";
const roleRank: Record<Role, number> = { read: 0, checker: 1, write: 2, admin: 3 };
const isRole = (v: unknown): v is Role => typeof v === "string" && v in roleRank;

const getRole = async (userId: number, workspaceId: number): Promise<Role | null> => {
  const ws = await db
    .query("SELECT owner_id FROM workspaces WHERE id = ?")
    .get(workspaceId);
  if (!ws) return null;
  if ((ws as { owner_id: number }).owner_id === userId) return "admin";
  const m = await db
    .query("SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?")
    .get(workspaceId, userId);
  return (m as { role: Role } | null)?.role ?? null;
};

const atLeast = (role: Role | null, min: Role): boolean =>
  role !== null && roleRank[role] >= roleRank[min];

const projectWorkspace = async (projectId: number): Promise<number | null> => {
  const row = (await db.query("SELECT workspace_id FROM projects WHERE id = ?").get(projectId)) as
    | { workspace_id: number }
    | null;
  return row?.workspace_id ?? null;
};

const columnWorkspace = async (
  columnId: number
): Promise<{ workspace_id: number; project_id: number } | null> =>
  (await db
    .query(
      `SELECT p.workspace_id, p.id AS project_id FROM columns c
       JOIN projects p ON p.id = c.project_id WHERE c.id = ?`
    )
    .get(columnId)) as { workspace_id: number; project_id: number } | null;

type TaskCtx = Task & { project_id: number | null; workspace_id: number | null };

const taskCtx = async (taskId: number): Promise<TaskCtx | null> =>
  (await db
    .query(
      `SELECT t.*, c.project_id, p.workspace_id FROM tasks t
       LEFT JOIN columns c ON c.id = t.column_id
       LEFT JOIN projects p ON p.id = c.project_id
       WHERE t.id = ?`
    )
    .get(taskId)) as TaskCtx | null;

const taskRole = async (req: unknown, t: TaskCtx): Promise<Role | null> => {
  if (t.workspace_id === null) return t.created_by === user(req).id ? "write" : null;
  return getRole(user(req).id, t.workspace_id);
};

// ---------- tag registry helpers ----------

const TAG_PALETTE = [
  "#2f5d9e",
  "#c0533e",
  "#4a7c59",
  "#c98a2d",
  "#7b5ea7",
  "#3e8e8c",
  "#b5527d",
  "#6b8e23",
  "#a0522d",
  "#4682b4",
  "#9e2f5d",
  "#5d9e2f",
];

const registerTags = async (workspaceId: number, names: string[]) => {
  for (const name of names) {
    const exists = await db
      .query("SELECT 1 FROM tags WHERE workspace_id = ? AND name = ?")
      .get(workspaceId, name);
    if (!exists) {
      const count = (await db
        .query("SELECT COUNT(*) AS c FROM tags WHERE workspace_id = ?")
        .get(workspaceId)) as { c: number };
      await db.run("INSERT INTO tags (workspace_id, name, color) VALUES (?, ?, ?)", [
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

const assigneesFor = async (taskIds: number[]): Promise<Map<number, Assignee[]>> => {
  const map = new Map<number, Assignee[]>();
  if (!taskIds.length) return map;
  const rows = (await db
    .query(
      `SELECT ta.task_id, u.id, u.name, u.avatar_url FROM task_assignees ta
       JOIN users u ON u.id = ta.user_id
       WHERE ta.task_id IN (${taskIds.map(() => "?").join(",")})`
    )
    .all(...taskIds)) as unknown as (Assignee & { task_id: number })[];
  for (const r of rows) {
    const list = map.get(r.task_id) ?? [];
    list.push({ id: r.id, name: r.name, avatar_url: r.avatar_url });
    map.set(r.task_id, list);
  }
  return map;
};

const setAssignees = async (taskId: number, workspaceId: number, userIds: unknown) => {
  if (!Array.isArray(userIds)) return;
  await db.run("DELETE FROM task_assignees WHERE task_id = ?", [taskId]);
  for (const uid of userIds.slice(0, 20)) {
    if (typeof uid !== "number") continue;
    if ((await getRole(uid, workspaceId)) === null) continue;
    await db.run("INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)", [taskId, uid]);
  }
};

const withAssignees = async <T extends { id: number }>(
  tasks: T[]
): Promise<(T & { assignees: Assignee[] })[]> => {
  const map = await assigneesFor(tasks.map((t) => t.id));
  return tasks.map((t) => ({ ...t, assignees: map.get(t.id) ?? [] }));
};

const emailsOf = async (userIds: number[]): Promise<string[]> =>
  userIds.length
    ? (
        (await db
          .query(`SELECT email FROM users WHERE id IN (${userIds.map(() => "?").join(",")})`)
          .all(...userIds)) as { email: string }[]
      ).map((u) => u.email)
    : [];

const memberIdsOnly = async (workspaceId: number, ids: unknown): Promise<number[]> =>
  Array.isArray(ids)
    ? (
        await Promise.all(
          [...new Set(ids.filter((n): n is number => typeof n === "number"))].map(async (id) =>
            (await getRole(id, workspaceId)) !== null ? id : null
          )
        )
      ).filter((id): id is number => id !== null)
    : [];

const projectName = async (projectId: number | null): Promise<string> =>
  projectId === null
    ? "Personal"
    : (
        (await db.query("SELECT name FROM projects WHERE id = ?").get(projectId)) as
          | { name: string }
          | null
      )?.name ?? "a project";

// ---------- workspaces ----------

apiRouter.get("/workspaces", async (req, res) => {
  const rows = await db
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

apiRouter.post("/workspaces", async (req, res) => {
  const name = str(req.body?.name, 100)?.trim();
  if (!name) return bad(res, "name required");
  const next = (await db
    .query("SELECT COALESCE(MAX(position) + 1, 0) AS p FROM workspaces WHERE owner_id = ?")
    .get(user(req).id)) as { p: number };
  const ws = (await db
    .query("INSERT INTO workspaces (name, owner_id, position) VALUES (?, ?, ?) RETURNING *")
    .get(name, user(req).id, next.p)) as { id: number };
  res.status(201).json({ ...ws, role: "admin" });
});

apiRouter.patch("/workspaces/:id", async (req, res) => {
  const id = Number(req.params.id);
  if ((await getRole(user(req).id, id)) !== "admin") return forbidden(res);
  const name = str(req.body?.name, 100)?.trim();
  if (!name) return bad(res, "name required");
  res.json((await db.query("UPDATE workspaces SET name = ? WHERE id = ? RETURNING *").get(name, id)));
});

apiRouter.delete("/workspaces/:id", async (req, res) => {
  const id = Number(req.params.id);
  if ((await getRole(user(req).id, id)) !== "admin") return forbidden(res);
  await db.run("DELETE FROM workspaces WHERE id = ?", [id]);
  res.json({ ok: true });
});

// ---------- workspace members ----------

apiRouter.get("/workspaces/:id/members", async (req, res) => {
  const id = Number(req.params.id);
  if (!atLeast(await getRole(user(req).id, id), "read")) return notFound(res);
  const owner = await db
    .query(
      `SELECT u.id, u.name, u.email, u.avatar_url, 'admin' AS role, 1 AS is_owner
       FROM workspaces w JOIN users u ON u.id = w.owner_id WHERE w.id = ?`
    )
    .get(id);
  const members = await db
    .query(
      `SELECT u.id, u.name, u.email, u.avatar_url, m.role, 0 AS is_owner
       FROM workspace_members m JOIN users u ON u.id = m.user_id
       WHERE m.workspace_id = ? ORDER BY u.name`
    )
    .all(id);
  res.json([owner, ...members].filter(Boolean));
});

apiRouter.post("/workspaces/:id/members", async (req, res) => {
  const id = Number(req.params.id);
  if ((await getRole(user(req).id, id)) !== "admin") return forbidden(res);
  const email = str(req.body?.email, 200)?.trim().toLowerCase();
  const role = req.body?.role;
  if (!email || !isRole(role)) return bad(res, "email and valid role required");
  const target = (await db.query("SELECT id FROM users WHERE lower(email) = ?").get(email)) as {
    id: number;
  } | null;
  if (!target) return res.status(404).json({ error: "no user with that email has signed in yet" });
  const ownerId = (
    (await db.query("SELECT owner_id FROM workspaces WHERE id = ?").get(id)) as {
      owner_id: number;
    }
  ).owner_id;
  if (target.id === ownerId) return bad(res, "owner is already an admin");
  await db.run(
    `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = excluded.role`,
    [id, target.id, role]
  );
  const ws = (await db.query("SELECT name FROM workspaces WHERE id = ?").get(id)) as { name: string };
  sendWorkspaceInvite({
    to: email,
    workspaceName: ws.name,
    role,
    invitedBy: user(req).name,
  });
  res.status(201).json({ ok: true });
});

apiRouter.patch("/workspaces/:id/members/:userId", async (req, res) => {
  const id = Number(req.params.id);
  if ((await getRole(user(req).id, id)) !== "admin") return forbidden(res);
  if (!isRole(req.body?.role)) return bad(res, "valid role required");
  await db.run("UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND user_id = ?", [
    req.body.role,
    id,
    Number(req.params.userId),
  ]);
  res.json({ ok: true });
});

apiRouter.delete("/workspaces/:id/members/:userId", async (req, res) => {
  const id = Number(req.params.id);
  if ((await getRole(user(req).id, id)) !== "admin") return forbidden(res);
  await db.run("DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?", [
    id,
    Number(req.params.userId),
  ]);
  res.json({ ok: true });
});

// ---------- workspace tags ----------

apiRouter.get("/workspaces/:id/tags", async (req, res) => {
  const id = Number(req.params.id);
  if (!atLeast(await getRole(user(req).id, id), "read")) return notFound(res);
  res.json(await db.query("SELECT * FROM tags WHERE workspace_id = ? ORDER BY name").all(id));
});

apiRouter.patch("/tags/:id", async (req, res) => {
  const tag = (await db.query("SELECT * FROM tags WHERE id = ?").get(Number(req.params.id))) as {
    id: number;
    workspace_id: number;
  } | null;
  if (!tag) return notFound(res);
  if ((await getRole(user(req).id, tag.workspace_id)) !== "admin") return forbidden(res);
  const color = str(req.body?.color, 20)?.trim();
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) return bad(res, "color must be #rrggbb");
  res.json((await db.query("UPDATE tags SET color = ? WHERE id = ? RETURNING *").get(color, tag.id)));
});

apiRouter.delete("/tags/:id", async (req, res) => {
  const tag = (await db.query("SELECT * FROM tags WHERE id = ?").get(Number(req.params.id))) as {
    id: number;
    workspace_id: number;
  } | null;
  if (!tag) return notFound(res);
  if ((await getRole(user(req).id, tag.workspace_id)) !== "admin") return forbidden(res);
  await db.run("DELETE FROM tags WHERE id = ?", [tag.id]);
  res.json({ ok: true });
});

// ---------- projects ----------

apiRouter.get("/projects", async (req, res) => {
  const rows = await db
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

apiRouter.post("/projects", async (req, res) => {
  const name = str(req.body?.name, 200)?.trim();
  if (!name) return bad(res, "name required");
  const workspaceId = Number(req.body?.workspaceId);
  if ((await getRole(user(req).id, workspaceId)) !== "admin") return forbidden(res);
  const viewType = req.body?.viewType === "list" ? "list" : "kanban";
  const nextPos = (await db
    .query("SELECT COALESCE(MAX(position) + 1, 0) AS p FROM projects WHERE workspace_id = ?")
    .get(workspaceId)) as { p: number };
  const project = (await db
    .query(
      "INSERT INTO projects (name, description, owner_id, workspace_id, view_type, position) VALUES (?, ?, ?, ?, ?, ?) RETURNING *"
    )
    .get(name, str(req.body?.description) ?? "", user(req).id, workspaceId, viewType, nextPos.p)) as {
    id: number;
  };
  const defaults =
    viewType === "list" ? [["Tasks", 0]] : [["Todo", 0], ["In Progress", 0], ["Done", 1]];
  for (const [i, entry] of defaults.entries()) {
    const [col, isDone] = entry as [string, number];
    await db.run("INSERT INTO columns (project_id, name, position, is_done) VALUES (?, ?, ?, ?)", [
      project.id,
      col,
      i,
      isDone,
    ]);
  }
  await logActivity(user(req).id, project.id, "created project", name);
  res.status(201).json(project);
});

apiRouter.patch("/projects/reorder", async (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "number"))
    return bad(res, "ids must be an array of numbers");
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.entries()) {
      const ws = await projectWorkspace(id);
      if (ws !== null && atLeast(await getRole(user(req).id, ws), "write")) {
        await tx.run("UPDATE projects SET position = ? WHERE id = ?", [i, id]);
      }
    }
  });
  res.json({ ok: true });
});

apiRouter.patch("/projects/:id", async (req, res) => {
  const id = Number(req.params.id);
  const ws = await projectWorkspace(id);
  if (ws === null) return notFound(res);
  if ((await getRole(user(req).id, ws)) !== "admin") return forbidden(res);
  const name = str(req.body?.name, 200)?.trim();
  if (!name) return bad(res, "name required");
  res.json((await db.query("UPDATE projects SET name = ? WHERE id = ? RETURNING *").get(name, id)));
});

apiRouter.delete("/projects/:id", async (req, res) => {
  const id = Number(req.params.id);
  const ws = await projectWorkspace(id);
  if (ws === null) return notFound(res);
  if ((await getRole(user(req).id, ws)) !== "admin") return forbidden(res);
  await db.run("DELETE FROM projects WHERE id = ?", [id]);
  res.json({ ok: true });
});

// ---------- project managers ----------

apiRouter.get("/projects/:id/managers", async (req, res) => {
  const projectId = Number(req.params.id);
  const ws = await projectWorkspace(projectId);
  if (ws === null || !atLeast(await getRole(user(req).id, ws), "read")) return notFound(res);
  res.json(
    await db
      .query(
        `SELECT u.id, u.name, u.email, u.avatar_url FROM project_managers pm
         JOIN users u ON u.id = pm.user_id WHERE pm.project_id = ? ORDER BY u.name`
      )
      .all(projectId)
  );
});

apiRouter.put("/projects/:id/managers", async (req, res) => {
  const projectId = Number(req.params.id);
  const ws = await projectWorkspace(projectId);
  if (ws === null) return notFound(res);
  if ((await getRole(user(req).id, ws)) !== "admin") return forbidden(res);
  const ids = await memberIdsOnly(ws, req.body?.userIds);
  await db.transaction(async (tx) => {
    await tx.run("DELETE FROM project_managers WHERE project_id = ?", [projectId]);
    for (const id of ids) {
      await tx.run("INSERT INTO project_managers (project_id, user_id) VALUES (?, ?)", [
        projectId,
        id,
      ]);
    }
  });
  res.json({ ok: true });
});

// ---------- board ----------

apiRouter.get("/projects/:id/board", async (req, res) => {
  const projectId = Number(req.params.id);
  const ws = await projectWorkspace(projectId);
  if (ws === null || !atLeast(await getRole(user(req).id, ws), "read")) return notFound(res);
  const columns = (await db
    .query("SELECT * FROM columns WHERE project_id = ? ORDER BY position")
    .all(projectId)) as unknown as { id: number }[];
  const tasks = columns.length
    ? ((await db
        .query(
          `SELECT * FROM tasks WHERE column_id IN (${columns.map(() => "?").join(",")})
           ORDER BY position`
        )
        .all(...columns.map((c) => c.id))) as unknown as Task[])
    : [];
  res.json({ columns, tasks: await withAssignees(tasks), workspaceId: ws });
});

apiRouter.post("/projects/:id/columns", async (req, res) => {
  const projectId = Number(req.params.id);
  const ws = await projectWorkspace(projectId);
  if (ws === null) return notFound(res);
  if ((await getRole(user(req).id, ws)) !== "admin") return forbidden(res);
  const name = str(req.body?.name, 100)?.trim();
  if (!name) return bad(res, "name required");
  const next = (await db
    .query("SELECT COALESCE(MAX(position) + 1, 0) AS p FROM columns WHERE project_id = ?")
    .get(projectId)) as { p: number };
  res.status(201).json(
    await db
      .query("INSERT INTO columns (project_id, name, position) VALUES (?, ?, ?) RETURNING *")
      .get(projectId, name, next.p)
  );
});

apiRouter.patch("/columns/:id/done", async (req, res) => {
  const ctx = await columnWorkspace(Number(req.params.id));
  if (!ctx) return notFound(res);
  if ((await getRole(user(req).id, ctx.workspace_id)) !== "admin") return forbidden(res);
  await db.transaction(async (tx) => {
    await tx.run("UPDATE columns SET is_done = 0 WHERE project_id = ?", [ctx.project_id]);
    await tx.run("UPDATE columns SET is_done = 1 WHERE id = ?", [Number(req.params.id)]);
    await tx.run(
      `UPDATE tasks SET completed_at = COALESCE(completed_at, ${NOW_TEXT})
       WHERE column_id = ?`,
      [Number(req.params.id)]
    );
    await tx.run(
      `UPDATE tasks SET completed_at = NULL
       WHERE column_id IN (SELECT id FROM columns WHERE project_id = ? AND is_done = 0)`,
      [ctx.project_id]
    );
  });
  res.json({ ok: true });
});

apiRouter.delete("/columns/:id", async (req, res) => {
  const ctx = await columnWorkspace(Number(req.params.id));
  if (!ctx) return notFound(res);
  if ((await getRole(user(req).id, ctx.workspace_id)) !== "admin") return forbidden(res);
  await db.run("DELETE FROM columns WHERE id = ?", [Number(req.params.id)]);
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

  const next = (
    columnId !== null
      ? await db
          .query("SELECT COALESCE(MAX(position) + 1, 0) AS p FROM tasks WHERE column_id = ?")
          .get(columnId)
      : await db
          .query(
            "SELECT COALESCE(MAX(position) + 1, 0) AS p FROM tasks WHERE column_id IS NULL AND created_by = ?"
          )
          .get(user(req).id)
  ) as { p: number };

  const task = (await db
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
    )) as unknown as Task;

  if (workspaceId !== null) {
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
  await logActivity(user(req).id, projectId, "created task", title);
  res.status(201).json((await withAssignees([task]))[0]);
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
    ? req.body.priority
    : existing.priority;
  const dueDate =
    req.body?.dueDate === null ? null : str(req.body?.dueDate, 30) ?? existing.due_date;
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

  const task = (await db
    .query(
      `UPDATE tasks SET title = ?, description = ?, priority = ?, due_date = ?, tags = ?,
       completed_at = ?, updated_at = ${NOW_TEXT} WHERE id = ? RETURNING *`
    )
    .get(title, description, priority, dueDate, tags, completedAt, existing.id)) as unknown as Task;

  if (
    existing.workspace_id !== null &&
    Array.isArray(req.body?.assignees) &&
    atLeast(role, "write")
  ) {
    const before = new Set(
      ((await assigneesFor([existing.id])).get(existing.id) ?? []).map((a) => a.id)
    );
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
  res.json((await withAssignees([task]))[0]);
});

apiRouter.patch("/tasks/:id/move", async (req, res) => {
  const existing = await taskCtx(Number(req.params.id));
  if (!existing || existing.workspace_id === null) return notFound(res);
  const role = await taskRole(req, existing);
  const toColumn = Number(req.body?.columnId);
  const toPosition = Number(req.body?.position);
  const target = (await db
    .query("SELECT is_done, project_id FROM columns WHERE id = ?")
    .get(toColumn)) as { is_done: number; project_id: number } | null;
  if (!target || Number.isNaN(toPosition)) return bad(res, "columnId and position required");
  const targetCtx = await columnWorkspace(toColumn);
  if (!targetCtx || targetCtx.workspace_id !== existing.workspace_id) return notFound(res);

  const source = (await db.query("SELECT is_done FROM columns WHERE id = ?").get(existing.column_id!)) as
    | { is_done: number }
    | null;
  const completionMove = !!target.is_done || !!source?.is_done;
  if (!atLeast(role, "write") && !(role === "checker" && completionMove)) return forbidden(res);

  await db.transaction(async (tx) => {
    await tx.run("UPDATE tasks SET position = position - 1 WHERE column_id = ? AND position > ?", [
      existing.column_id,
      existing.position,
    ]);
    await tx.run("UPDATE tasks SET position = position + 1 WHERE column_id = ? AND position >= ?", [
      toColumn,
      toPosition,
    ]);
    await tx.run(
      `UPDATE tasks SET column_id = ?, position = ?,
       completed_at = CASE WHEN ?4 = 1 THEN COALESCE(completed_at, ${NOW_TEXT}) ELSE NULL END,
       updated_at = ${NOW_TEXT} WHERE id = ?3`,
      [toColumn, toPosition, existing.id, target.is_done]
    );
  });
  if (target.is_done && !existing.completed_at)
    await logActivity(user(req).id, existing.project_id, "completed task", existing.title);
  res.json({ ok: true });
});

apiRouter.delete("/tasks/:id", async (req, res) => {
  const existing = await taskCtx(Number(req.params.id));
  if (!existing) return notFound(res);
  if (!atLeast(await taskRole(req, existing), "write")) return forbidden(res);
  await db.run("DELETE FROM tasks WHERE id = ?", [existing.id]);
  await logActivity(user(req).id, existing.project_id, "deleted task", existing.title);
  res.json({ ok: true });
});

apiRouter.get("/tasks/mine", async (req, res) => {
  const rows = (await db
    .query(
      `SELECT DISTINCT t.*, c.project_id FROM tasks t
       LEFT JOIN columns c ON c.id = t.column_id
       LEFT JOIN task_assignees ta ON ta.task_id = t.id
       WHERE (t.column_id IS NULL AND t.created_by = ?1) OR ta.user_id = ?1
       ORDER BY t.due_date IS NULL, t.due_date`
    )
    .all(user(req).id)) as unknown as Task[];
  res.json(await withAssignees(rows));
});

// ---------- milestones ----------

apiRouter.get("/projects/:id/milestones", async (req, res) => {
  const ws = await projectWorkspace(Number(req.params.id));
  if (ws === null || !atLeast(await getRole(user(req).id, ws), "read")) return notFound(res);
  res.json(
    await db
      .query("SELECT * FROM milestones WHERE project_id = ? ORDER BY position")
      .all(Number(req.params.id))
  );
});

apiRouter.post("/projects/:id/milestones", async (req, res) => {
  const projectId = Number(req.params.id);
  const ws = await projectWorkspace(projectId);
  if (ws === null) return notFound(res);
  if (!atLeast(await getRole(user(req).id, ws), "write")) return forbidden(res);
  const title = str(req.body?.title, 300)?.trim();
  if (!title) return bad(res, "title required");
  const next = (await db
    .query("SELECT COALESCE(MAX(position) + 1, 0) AS p FROM milestones WHERE project_id = ?")
    .get(projectId)) as { p: number };
  res.status(201).json(
    await db
      .query(
        "INSERT INTO milestones (project_id, title, due_date, position) VALUES (?, ?, ?, ?) RETURNING *"
      )
      .get(projectId, title, str(req.body?.dueDate, 30), next.p)
  );
});

apiRouter.patch("/milestones/:id", async (req, res) => {
  const m = (await db.query("SELECT project_id FROM milestones WHERE id = ?").get(Number(req.params.id))) as
    | { project_id: number }
    | null;
  if (!m) return notFound(res);
  const ws = await projectWorkspace(m.project_id);
  if (ws === null || !atLeast(await getRole(user(req).id, ws), "checker")) return forbidden(res);
  res.json(
    await db
      .query("UPDATE milestones SET done = ? WHERE id = ? RETURNING *")
      .get(req.body?.done ? 1 : 0, Number(req.params.id))
  );
});

apiRouter.delete("/milestones/:id", async (req, res) => {
  const m = (await db.query("SELECT project_id FROM milestones WHERE id = ?").get(Number(req.params.id))) as
    | { project_id: number }
    | null;
  if (!m) return notFound(res);
  const ws = await projectWorkspace(m.project_id);
  if (ws === null || !atLeast(await getRole(user(req).id, ws), "write")) return forbidden(res);
  await db.run("DELETE FROM milestones WHERE id = ?", [Number(req.params.id)]);
  res.json({ ok: true });
});

// ---------- notes, activity, focus, widgets (personal) ----------

apiRouter.get("/notes", async (req, res) => {
  res.json(await db.query("SELECT * FROM notes WHERE user_id = ? ORDER BY id").all(user(req).id));
});

apiRouter.post("/notes", async (req, res) => {
  res.status(201).json(
    await db
      .query("INSERT INTO notes (user_id, content, color) VALUES (?, ?, ?) RETURNING *")
      .get(user(req).id, str(req.body?.content, 5000) ?? "", str(req.body?.color, 20) ?? "yellow")
  );
});

apiRouter.patch("/notes/:id", async (req, res) => {
  const row = await db
    .query(
      `UPDATE notes SET content = ?, updated_at = ${NOW_TEXT}
       WHERE id = ? AND user_id = ? RETURNING *`
    )
    .get(str(req.body?.content, 5000) ?? "", Number(req.params.id), user(req).id);
  if (!row) return notFound(res);
  res.json(row);
});

apiRouter.delete("/notes/:id", async (req, res) => {
  await db.run("DELETE FROM notes WHERE id = ? AND user_id = ?", [Number(req.params.id), user(req).id]);
  res.json({ ok: true });
});

apiRouter.get("/activity", async (req, res) => {
  res.json(
    await db
      .query(
        `SELECT a.*, u.name AS user_name FROM activity a
         JOIN users u ON u.id = a.user_id
         WHERE a.user_id = ? ORDER BY a.created_at DESC LIMIT 30`
      )
      .all(user(req).id)
  );
});

apiRouter.get("/focus", async (req, res) => {
  const row = await db
    .query("SELECT goal, date FROM focus WHERE user_id = ? AND date = CURRENT_DATE::text")
    .get(user(req).id);
  res.json(row ?? { goal: "", date: null });
});

apiRouter.put("/focus", async (req, res) => {
  const goal = str(req.body?.goal, 500) ?? "";
  await db.run(
    `INSERT INTO focus (user_id, goal, date) VALUES (?, ?, CURRENT_DATE::text)
     ON CONFLICT (user_id) DO UPDATE SET goal = excluded.goal, date = excluded.date`,
    [user(req).id, goal]
  );
  res.json({ goal });
});

apiRouter.get("/widgets/layout", async (req, res) => {
  const row = (await db
    .query("SELECT layout FROM widget_layouts WHERE user_id = ?")
    .get(user(req).id)) as { layout: string } | null;
  res.json(row ? JSON.parse(row.layout) : null);
});

apiRouter.put("/widgets/layout", async (req, res) => {
  if (!Array.isArray(req.body)) return bad(res, "layout must be an array");
  await db.run(
    `INSERT INTO widget_layouts (user_id, layout, updated_at) VALUES (?, ?, ${NOW_TEXT})
     ON CONFLICT (user_id) DO UPDATE SET layout = excluded.layout, updated_at = excluded.updated_at`,
    [user(req).id, JSON.stringify(req.body.slice(0, 50))]
  );
  res.json({ ok: true });
});
