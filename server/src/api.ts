import { Router, type Response } from "express";
import { db, logActivity, type Task, type User } from "./db";
import { requireAuth, type AuthedRequest } from "./auth";

export const apiRouter = Router();
apiRouter.use(requireAuth);

const user = (req: unknown): User => (req as AuthedRequest).user;
const bad = (res: Response, msg: string) => res.status(400).json({ error: msg });

const str = (v: unknown, max = 2000): string | null =>
  typeof v === "string" && v.length <= max ? v : null;

// ---------- projects ----------

apiRouter.get("/projects", (req, res) => {
  const rows = db
    .query("SELECT * FROM projects WHERE owner_id = ? ORDER BY position, created_at")
    .all(user(req).id);
  res.json(rows);
});

apiRouter.post("/projects", (req, res) => {
  const name = str(req.body?.name, 200)?.trim();
  if (!name) return bad(res, "name required");
  const viewType = req.body?.viewType === "list" ? "list" : "kanban";
  const nextPos = db
    .query("SELECT COALESCE(MAX(position) + 1, 0) AS p FROM projects WHERE owner_id = ?")
    .get(user(req).id) as { p: number };
  const project = db
    .query(
      "INSERT INTO projects (name, description, owner_id, view_type, position) VALUES (?, ?, ?, ?, ?) RETURNING *"
    )
    .get(name, str(req.body?.description) ?? "", user(req).id, viewType, nextPos.p) as {
    id: number;
  };
  const defaults = viewType === "list" ? ["Tasks"] : ["Todo", "In Progress", "Done"];
  defaults.forEach((col, i) =>
    db.run("INSERT INTO columns (project_id, name, position) VALUES (?, ?, ?)", [
      project.id,
      col,
      i,
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
    ids.forEach((id, i) =>
      db.run("UPDATE projects SET position = ? WHERE id = ? AND owner_id = ?", [
        i,
        id,
        user(req).id,
      ])
    );
  });
  apply();
  res.json({ ok: true });
});

apiRouter.delete("/projects/:id", (req, res) => {
  db.run("DELETE FROM projects WHERE id = ? AND owner_id = ?", [
    Number(req.params.id),
    user(req).id,
  ]);
  res.json({ ok: true });
});

const ownsProject = (req: unknown, projectId: number): boolean =>
  !!db
    .query("SELECT 1 FROM projects WHERE id = ? AND owner_id = ?")
    .get(projectId, user(req).id);

// ---------- columns + board ----------

apiRouter.get("/projects/:id/board", (req, res) => {
  const projectId = Number(req.params.id);
  if (!ownsProject(req, projectId)) return res.status(404).json({ error: "not found" });
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
  res.json({ columns, tasks });
});

apiRouter.post("/projects/:id/columns", (req, res) => {
  const projectId = Number(req.params.id);
  if (!ownsProject(req, projectId)) return res.status(404).json({ error: "not found" });
  const name = str(req.body?.name, 100)?.trim();
  if (!name) return bad(res, "name required");
  const next = db
    .query("SELECT COALESCE(MAX(position) + 1, 0) AS p FROM columns WHERE project_id = ?")
    .get(projectId) as { p: number };
  const col = db
    .query("INSERT INTO columns (project_id, name, position) VALUES (?, ?, ?) RETURNING *")
    .get(projectId, name, next.p);
  res.status(201).json(col);
});

apiRouter.delete("/columns/:id", (req, res) => {
  db.run(
    `DELETE FROM columns WHERE id = ? AND project_id IN
     (SELECT id FROM projects WHERE owner_id = ?)`,
    [Number(req.params.id), user(req).id]
  );
  res.json({ ok: true });
});

// ---------- tasks ----------

const ownsColumn = (req: unknown, columnId: number): { project_id: number } | null =>
  db
    .query(
      `SELECT c.project_id FROM columns c
       JOIN projects p ON p.id = c.project_id
       WHERE c.id = ? AND p.owner_id = ?`
    )
    .get(columnId, user(req).id) as { project_id: number } | null;

const ownsTask = (
  req: unknown,
  taskId: number
): (Task & { project_id: number | null }) | null =>
  db
    .query(
      `SELECT t.*, c.project_id FROM tasks t
       LEFT JOIN columns c ON c.id = t.column_id
       LEFT JOIN projects p ON p.id = c.project_id
       WHERE t.id = ?
         AND (p.owner_id = ?2 OR (t.column_id IS NULL AND t.created_by = ?2))`
    )
    .get(taskId, user(req).id) as (Task & { project_id: number | null }) | null;

apiRouter.post("/tasks", (req, res) => {
  const columnId = req.body?.columnId == null ? null : Number(req.body.columnId);
  const title = str(req.body?.title, 500)?.trim();
  if (!title) return bad(res, "title required");

  let projectId: number | null = null;
  if (columnId !== null) {
    const owned = ownsColumn(req, columnId);
    if (!owned) return res.status(404).json({ error: "column not found" });
    projectId = owned.project_id;
  }

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
        : "medium",
      str(req.body?.dueDate, 30),
      JSON.stringify(Array.isArray(req.body?.tags) ? req.body.tags.slice(0, 20) : []),
      next.p,
      user(req).id
    );
  logActivity(user(req).id, projectId, "created task", title);
  res.status(201).json(task);
});

apiRouter.patch("/tasks/:id", (req, res) => {
  const existing = ownsTask(req, Number(req.params.id));
  if (!existing) return res.status(404).json({ error: "not found" });

  const title = str(req.body?.title, 500)?.trim() ?? existing.title;
  const description = str(req.body?.description, 10000) ?? existing.description;
  const priority = ["low", "medium", "high", "urgent"].includes(req.body?.priority)
    ? req.body.priority
    : existing.priority;
  const dueDate =
    req.body?.dueDate === null ? null : str(req.body?.dueDate, 30) ?? existing.due_date;
  const tags = Array.isArray(req.body?.tags)
    ? JSON.stringify(req.body.tags.slice(0, 20))
    : existing.tags;
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
    .get(title, description, priority, dueDate, tags, completedAt, existing.id);
  if (req.body?.completed === true && !existing.completed_at)
    logActivity(user(req).id, existing.project_id, "completed task", title);
  res.json(task);
});

apiRouter.patch("/tasks/:id/move", (req, res) => {
  const existing = ownsTask(req, Number(req.params.id));
  if (!existing) return res.status(404).json({ error: "not found" });
  const toColumn = Number(req.body?.columnId);
  const toPosition = Number(req.body?.position);
  if (!ownsColumn(req, toColumn) || Number.isNaN(toPosition))
    return bad(res, "columnId and position required");

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
      "UPDATE tasks SET column_id = ?, position = ?, updated_at = datetime('now') WHERE id = ?",
      [toColumn, toPosition, existing.id]
    );
  });
  move();
  res.json({ ok: true });
});

apiRouter.delete("/tasks/:id", (req, res) => {
  const existing = ownsTask(req, Number(req.params.id));
  if (!existing) return res.status(404).json({ error: "not found" });
  db.run("DELETE FROM tasks WHERE id = ?", [existing.id]);
  logActivity(user(req).id, existing.project_id, "deleted task", existing.title);
  res.json({ ok: true });
});

apiRouter.get("/tasks/mine", (req, res) => {
  const rows = db
    .query(
      `SELECT t.*, c.project_id FROM tasks t
       LEFT JOIN columns c ON c.id = t.column_id
       LEFT JOIN projects p ON p.id = c.project_id
       WHERE p.owner_id = ?1 OR (t.column_id IS NULL AND t.created_by = ?1)
       ORDER BY t.due_date IS NULL, t.due_date`
    )
    .all(user(req).id);
  res.json(rows);
});

apiRouter.get("/tags", (req, res) => {
  const rows = db
    .query(
      `SELECT t.tags FROM tasks t
       JOIN columns c ON c.id = t.column_id
       JOIN projects p ON p.id = c.project_id
       WHERE p.owner_id = ?`
    )
    .all(user(req).id) as { tags: string }[];
  const all = new Set<string>();
  for (const row of rows) {
    try {
      for (const tag of JSON.parse(row.tags)) if (typeof tag === "string") all.add(tag);
    } catch {
      /* malformed tags — skip */
    }
  }
  res.json([...all].sort());
});

// ---------- milestones ----------

apiRouter.get("/projects/:id/milestones", (req, res) => {
  const projectId = Number(req.params.id);
  if (!ownsProject(req, projectId)) return res.status(404).json({ error: "not found" });
  res.json(
    db.query("SELECT * FROM milestones WHERE project_id = ? ORDER BY position").all(projectId)
  );
});

apiRouter.post("/projects/:id/milestones", (req, res) => {
  const projectId = Number(req.params.id);
  if (!ownsProject(req, projectId)) return res.status(404).json({ error: "not found" });
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
  const row = db
    .query(
      `UPDATE milestones SET done = ? WHERE id = ? AND project_id IN
       (SELECT id FROM projects WHERE owner_id = ?) RETURNING *`
    )
    .get(req.body?.done ? 1 : 0, Number(req.params.id), user(req).id);
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(row);
});

apiRouter.delete("/milestones/:id", (req, res) => {
  db.run(
    `DELETE FROM milestones WHERE id = ? AND project_id IN
     (SELECT id FROM projects WHERE owner_id = ?)`,
    [Number(req.params.id), user(req).id]
  );
  res.json({ ok: true });
});

// ---------- notes ----------

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
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(row);
});

apiRouter.delete("/notes/:id", (req, res) => {
  db.run("DELETE FROM notes WHERE id = ? AND user_id = ?", [Number(req.params.id), user(req).id]);
  res.json({ ok: true });
});

// ---------- activity, focus, widgets ----------

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
