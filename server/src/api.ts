import { Router, type Request, type Response } from "express";
import { sql, logActivity, type Task, type User, type ProjectSheetLink } from "./db";
import { requireAuth, type AuthedRequest } from "./auth";
import { config } from "./config";
import { sendTaskAssigned, sendWorkspaceInvite, sendTestEmail, sendPendingInvite } from "./mailer";
import { createProjectSheet, createWorkspaceSheet, syncProjectToSheet, syncProjectToAllLinkedSheets, addStatusValidation, getGoogleAuth } from "./sheets";
import { google } from "googleapis";

export const apiRouter = Router();
apiRouter.use(requireAuth);

const user = (req: unknown): User | null => (req as AuthedRequest).user || null;

const bad = (res: Response, msg: string) => {
  console.warn(`Bad Request: ${msg}`);
  return res.status(400).json({ error: msg });
};
const notFound = (res: Response) => {
  console.warn("Not Found");
  return res.status(404).json({ error: "not found" });
};
const forbidden = (res: Response) => {
  console.warn("Forbidden");
  return res.status(403).json({ error: "forbidden" });
};

const str = (v: unknown, max = 2000): string | null =>
  typeof v === "string" && v.length <= max ? v : null;

const progressValue = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
};

// ---------- roles ----------

export type Role = "read" | "checker" | "write" | "admin";
const roleRank: Record<Role, number> = { read: 0, checker: 1, write: 2, admin: 3 };
const isRole = (v: unknown): v is Role =>
  typeof v === "string" && v in roleRank;

const getRole = async (userId: string | null, workspaceId: string): Promise<Role | null> => {
  if (!userId) return null;
  const [ws] = await sql<{ owner_id: string }[]>`SELECT owner_id FROM workspaces WHERE id = ${workspaceId}`;
  if (!ws) return null;
  if (ws.owner_id === userId) return "admin";
  const [m] = await sql<{ role: Role }[]>`
    SELECT role FROM workspace_members WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
  `;
  return m?.role ?? null;
};

const getProjectRole = async (req: Request, projectId: string): Promise<Role | null> => {
  const u = user(req);
  
  // 1. Check if authenticated user has access
  if (u) {
    const [p] = await sql<{ owner_id: string; workspace_id: string | null }[]>`
      SELECT owner_id, workspace_id FROM projects WHERE id = ${projectId}
    `;
    if (!p) return null;

    // Project owner is always an admin
    if (p.owner_id === u.id) return "admin";

    // Workspace-level permissions
    if (p.workspace_id) {
      const wsRole = await getRole(u.id, p.workspace_id);
      if (wsRole) return wsRole;
    }

    // Granular project-level permissions
    const [pm] = await sql<{ role: Role }[]>`
      SELECT role FROM project_members WHERE project_id = ${projectId} AND user_id = ${u.id}
    `;
    if (pm) return pm.role;
  }

  // 2. Check if project is public and share ID matches
  const shareId = req.headers["x-public-share-id"];
  if (shareId) {
    const [p] = await sql<{ share_role: Role; share_id: string }[]>`
      SELECT share_role, share_id FROM projects WHERE id = ${projectId}
    `;
    if (p && p.share_id === shareId && p.share_role && p.share_role !== "admin") 
      return p.share_role;
  }

  return null;
};

const atLeast = (role: Role | null, min: Role): boolean =>
  role !== null && roleRank[role] >= roleRank[min];

const projectWorkspace = async (projectId: string): Promise<string | null> => {
  const [row] = await sql<{ workspace_id: string }[]>`SELECT workspace_id FROM projects WHERE id = ${projectId}`;
  return row?.workspace_id ?? null;
};

const areNotificationsEnabled = async (workspaceId: string): Promise<boolean> => {
  const [row] = await sql<{ notifications_enabled: number }[]>`
    SELECT notifications_enabled FROM workspaces WHERE id = ${workspaceId}
  `;
  return row?.notifications_enabled === 1;
};

const columnWorkspace = async (columnId: string): Promise<{ workspace_id: string; project_id: string } | null> => {
  const [row] = await sql<{ workspace_id: string; project_id: string }[]>`
    SELECT p.workspace_id, p.id AS project_id FROM columns c
    JOIN projects p ON p.id = c.project_id WHERE c.id = ${columnId}
  `;
  return row ?? null;
};

type TaskCtx = Task & { project_id: string | null; workspace_id: string | null };

const taskCtx = async (taskId: string): Promise<TaskCtx | null> => {
  const [row] = await sql<TaskCtx[]>`
    SELECT t.*, c.project_id, p.workspace_id FROM tasks t
    LEFT JOIN columns c ON c.id = t.column_id
    LEFT JOIN projects p ON p.id = c.project_id
    WHERE t.id = ${taskId}
  `;
  return row ?? null;
};

const taskRole = async (req: Request, t: TaskCtx): Promise<Role | null> => {
  const u = user(req);
  if (t.workspace_id === null || t.project_id === null)
    return u && t.created_by === u.id ? "write" : null;
  
  if (u) {
    const [row] = await sql<{ count: string }[]>`
      SELECT COUNT(*) FROM task_assignees WHERE task_id = ${t.id} AND user_id = ${u.id}
    `;
    if (row && Number(row.count) > 0) return "write";
  }
  
  return getProjectRole(req, t.project_id);
};

// ---------- tag registry helpers ----------

const TAG_PALETTE = [
  "#2f5d9e", "#c0533e", "#4a7c59", "#c98a2d", "#7b5ea7", "#3e8e8c",
  "#b5527d", "#6b8e23", "#a0522d", "#4682b4", "#9e2f5d", "#5d9e2f",
];

const registerTags = async (workspaceId: string, names: string[]) => {
  if (!names.length) return;
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    // Check if tag already exists in this workspace
    const [exists] = await sql`SELECT 1 FROM tags WHERE workspace_id = ${workspaceId} AND name = ${trimmed}`;
    if (!exists) {
      // Get current tag count for color selection
      const [countRow] = await sql<{ c: string }[]>`SELECT COUNT(*)::int AS c FROM tags WHERE workspace_id = ${workspaceId}`;
      const c = Number(countRow?.c ?? 0);
      await sql`
        INSERT INTO tags (workspace_id, name, color) 
        VALUES (${workspaceId}, ${trimmed}, ${TAG_PALETTE[c % TAG_PALETTE.length]!})
        ON CONFLICT (workspace_id, name) DO NOTHING
      `;
    }
  }
};

// ---------- assignees ----------

interface Assignee {
  id?: string;
  name: string;
  avatar_url?: string;
  isGuest?: boolean;
}

const assigneesFor = async (taskIds: string[]): Promise<Map<string, Assignee[]>> => {
  const map = new Map<string, Assignee[]>();
  if (!taskIds.length) return map;
  const rows = await sql<(Assignee & { task_id: string; user_id: string })[]>`
    SELECT ta.task_id, u.id as user_id, u.name, u.avatar_url FROM task_assignees ta
    JOIN users u ON u.id = ta.user_id
    WHERE ta.task_id IN ${sql(taskIds)}
  `;
  for (const r of rows) {
    const list = map.get(r.task_id) ?? [];
    list.push({ id: r.user_id, name: r.name, avatar_url: r.avatar_url });
    map.set(r.task_id, list);
  }
  return map;
};

const setAssignees = async (taskId: string, projectId: string | null, workspaceId: string | null, userIds: unknown) => {
  if (!Array.isArray(userIds)) return;
  await sql`DELETE FROM task_assignees WHERE task_id = ${taskId}`;
  for (const uid of userIds.slice(0, 20)) {
    if (typeof uid !== "string") continue;
    let hasAccess = false;
    if (workspaceId && (await getRole(uid, workspaceId)) !== null) {
      hasAccess = true;
    } else if (projectId) {
      // Check project-level membership (e.g. for guests)
      const [pm] = await sql`SELECT role FROM project_members WHERE project_id = ${projectId} AND user_id = ${uid}`;
      if (pm) hasAccess = true;
    }
    if (hasAccess) {
      await sql`INSERT INTO task_assignees (task_id, user_id) VALUES (${taskId}, ${uid}) ON CONFLICT DO NOTHING`;
    }
  }
};

const withAssignees = async <T extends { id: string; external_assignees?: string }>(tasks: T[]): Promise<(T & { assignees: Assignee[] })[]> => {
  const map = await assigneesFor(tasks.map((t) => t.id));
  return tasks.map((t) => {
    const real = map.get(t.id) ?? [];
    const ext = JSON.parse(t.external_assignees || "[]") as string[];
    return {
      ...t,
      assignees: [
        ...real,
        ...ext.map((name) => ({ name, isGuest: true })),
      ],
    };
  });
};

const emailsOf = async (userIds: string[]): Promise<string[]> => {
  if (!userIds.length) return [];
  const rows = await sql<{ email: string }[]>`SELECT email FROM users WHERE id IN ${sql(userIds)}`;
  return rows.map((u) => u.email);
};

const memberIdsOnly = async (workspaceId: string, ids: unknown): Promise<string[]> => {
  if (!Array.isArray(ids)) return [];
  const unique = [...new Set(ids.filter((n): n is string => typeof n === "string"))];
  const results = await Promise.all(unique.map(async (id) => ({ id, role: await getRole(id, workspaceId) })));
  return results.filter((r) => r.role !== null).map((r) => r.id);
};

const projectName = async (projectId: string | null): Promise<string> => {
  if (projectId === null) return "Personal";
  const [row] = await sql<{ name: string }[]>`SELECT name FROM projects WHERE id = ${projectId}`;
  return row?.name ?? "a project";
};

// ---------- workspaces ----------

apiRouter.get("/workspaces", async (req, res) => {
  const u = user(req);
  if (!u) return forbidden(res);
  const rows = await sql`
    SELECT w.*, CASE WHEN w.owner_id = ${u.id} THEN 'admin' ELSE m.role END AS role
    FROM workspaces w
    LEFT JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = ${u.id}
    WHERE w.owner_id = ${u.id} OR m.user_id IS NOT NULL
    ORDER BY w.position, w.created_at
  `;
  res.json(rows);
});

apiRouter.post("/workspaces", async (req, res) => {
  const name = str(req.body?.name, 100)?.trim();
  if (!name) return bad(res, "name required");
  const u = user(req);
  if (!u) return forbidden(res);
  const [nextRow] = await sql<{ p: number }[]>`SELECT COALESCE(MAX(position) + 1, 0) AS p FROM workspaces WHERE owner_id = ${u.id}`;
  const [ws] = await sql`INSERT INTO workspaces (name, owner_id, position) VALUES (${name}, ${u.id}, ${nextRow?.p ?? 0}) RETURNING *`;
  res.status(201).json({ ...ws, role: "admin" });
});

apiRouter.patch("/workspaces/:id", async (req, res) => {
  const id = req.params.id;
  const u = user(req);
  if (!u || await getRole(u.id, id) !== "admin") return forbidden(res);
  
  const name = str(req.body?.name, 100)?.trim();
  const notificationsEnabled = typeof req.body?.notificationsEnabled === "boolean"
    ? (req.body.notificationsEnabled ? 1 : 0)
    : undefined;

  const [row] = await sql`
    UPDATE workspaces 
    SET 
      name = COALESCE(${name ?? null}, name),
      notifications_enabled = COALESCE(${notificationsEnabled ?? null}, notifications_enabled)
    WHERE id = ${id} 
    RETURNING *
  `;
  res.json(row);
});

apiRouter.delete("/workspaces/:id", async (req, res) => {
  const id = req.params.id;
  const u = user(req);
  if (!u || await getRole(u.id, id) !== "admin") return forbidden(res);
  await sql`DELETE FROM workspaces WHERE id = ${id}`;
  res.json({ ok: true });
});

// ---------- workspace folders ----------

apiRouter.get("/workspaces/:id/folders", async (req, res) => {
  const id = req.params.id;
  const u = user(req);
  if (!u || !atLeast(await getRole(u.id, id), "read")) return notFound(res);
  const rows = await sql`SELECT * FROM workspace_folders WHERE workspace_id = ${id} ORDER BY position, created_at`;
  res.json(rows);
});

apiRouter.post("/workspaces/:id/folders", async (req, res) => {
  const id = req.params.id;
  const u = user(req);
  if (!u || await getRole(u.id, id) !== "admin") return forbidden(res);
  const name = str(req.body?.name, 100)?.trim();
  if (!name) return bad(res, "name required");
  const parentId = str(req.body?.parentId) || null;

  try {
    const [nextRow] = await sql<{ p: number }[]>`
      SELECT COALESCE(MAX(position) + 1, 0) AS p
      FROM workspace_folders
      WHERE workspace_id = ${id} AND (parent_id IS NOT DISTINCT FROM ${parentId}::uuid)
    `;

    const [folder] = await sql`
      INSERT INTO workspace_folders (name, workspace_id, parent_id, position)
      VALUES (${name}, ${id}, ${parentId}::uuid, ${nextRow?.p ?? 0})
      RETURNING *
    `;
    res.status(201).json(folder);
  } catch (err: any) {
    console.error("Failed to create folder:", err);
    res.status(500).json({ error: err.message || "Failed to create folder" });
  }
});

apiRouter.patch("/folders/:id", async (req, res) => {
  const [folder] = await sql<{ workspace_id: string }[]>`SELECT workspace_id FROM workspace_folders WHERE id = ${req.params.id}`;
  if (!folder) return notFound(res);
  const u = user(req);
  if (!u || await getRole(u.id, folder.workspace_id) !== "admin") return forbidden(res);
  
  const name = str(req.body?.name, 100)?.trim();
  const parentId = req.body?.parentId === undefined ? undefined : str(req.body.parentId);
  const position = typeof req.body?.position === "number" ? req.body.position : undefined;

  const [row] = await (sql as any)`
    UPDATE workspace_folders 
    SET 
      name = COALESCE(${name ?? null}, name),
      parent_id = ${parentId === undefined ? sql`parent_id` : sql`${parentId}::uuid`},
      position = COALESCE(${position ?? null}, position)
    WHERE id = ${req.params.id} 
    RETURNING *
  `;
  res.json(row);
});

apiRouter.delete("/folders/:id", async (req, res) => {
  const [folder] = await sql<{ workspace_id: string }[]>`SELECT workspace_id FROM workspace_folders WHERE id = ${req.params.id}`;
  if (!folder) return notFound(res);
  const u = user(req);
  if (!u || await getRole(u.id, folder.workspace_id) !== "admin") return forbidden(res);
  await sql`DELETE FROM workspace_folders WHERE id = ${req.params.id}`;
  res.json({ ok: true });
});

// ---------- workspace members ----------

apiRouter.get("/workspaces/:id/members", async (req, res) => {
  const id = req.params.id;
  const u = user(req);
  if (!u || !atLeast(await getRole(u.id, id), "read")) return notFound(res);
  const [owner] = await sql`
    SELECT u.id, u.name, u.email, u.avatar_url, 'admin' AS role, true AS is_owner, false AS is_pending
    FROM workspaces w JOIN users u ON u.id = w.owner_id WHERE w.id = ${id}
  `;
  const members = await sql`
    SELECT u.id, u.name, u.email, u.avatar_url, m.role, false AS is_owner, false AS is_pending
    FROM workspace_members m JOIN users u ON u.id = m.user_id
    WHERE m.workspace_id = ${id} ORDER BY u.name
  `;
  const pending = await sql`
    SELECT email AS id, email AS name, email, '' AS avatar_url, role, false AS is_owner, true AS is_pending
    FROM pending_invitations WHERE target_id = ${id} AND target_type = 'workspace'
  `;
  res.json([owner, ...members, ...pending].filter(Boolean));
});

apiRouter.delete("/pending-invitations/:email", async (req, res) => {
  const email = req.params.email;
  const [inv] = await sql<{ target_id: string; target_type: string }[]>`DELETE FROM pending_invitations WHERE email = ${email} RETURNING *`;
  if (!inv) return notFound(res);
  const u = user(req);
  if (!u || (inv.target_type === 'workspace' ? await getRole(u.id, inv.target_id) : await getProjectRole(req, inv.target_id)) !== 'admin') return forbidden(res);
  res.json({ ok: true });
});

apiRouter.post("/workspaces/:id/members", async (req, res) => {
  const id = req.params.id;
  const u = user(req);
  if (!u || await getRole(u.id, id) !== "admin") return forbidden(res);
  const email = str(req.body?.email, 200)?.trim().toLowerCase();
  const role = req.body?.role;
  if (!email || !isRole(role)) return bad(res, "email and valid role required");
  const [target] = await sql<{ id: string }[]>`SELECT id FROM users WHERE lower(email) = ${email}`;
  if (!target) {
    await sql`INSERT INTO pending_invitations (email, target_id, target_type, role, invited_by) VALUES (${email}, ${id}, 'workspace', ${role}, ${u.id}) ON CONFLICT (email) DO UPDATE SET target_id = ${id}, target_type = 'workspace', role = ${role}, invited_by = ${u.id}`;
    const [ws] = await sql<{ name: string }[]>`SELECT name FROM workspaces WHERE id = ${id}`;
    sendPendingInvite({ to: email, workspaceName: ws?.name ?? "", role, invitedBy: u.name });
    return res.status(201).json({ ok: true, pending: true });
  }
  const [wsRow] = await sql<{ owner_id: string }[]>`SELECT owner_id FROM workspaces WHERE id = ${id}`;
  if (target.id === wsRow?.owner_id) return bad(res, "owner is already an admin");
  await sql`
    INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (${id}, ${target.id}, ${role})
    ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = excluded.role
  `;
  const [ws] = await sql<{ name: string; notifications_enabled: number }[]>`SELECT name, notifications_enabled FROM workspaces WHERE id = ${id}`;
  if (ws?.notifications_enabled === 1) {
    sendWorkspaceInvite({ to: email, workspaceName: ws?.name ?? "", role, invitedBy: u.name });
  }
  res.status(201).json({ ok: true });
});

apiRouter.patch("/workspaces/:id/members/:userId", async (req, res) => {
  const id = req.params.id;
  const u = user(req);
  if (!u || await getRole(u.id, id) !== "admin") return forbidden(res);
  if (!isRole(req.body?.role)) return bad(res, "valid role required");
  await sql`UPDATE workspace_members SET role = ${req.body.role} WHERE workspace_id = ${id} AND user_id = ${req.params.userId}`;
  res.json({ ok: true });
});

apiRouter.delete("/workspaces/:id/members/:userId", async (req, res) => {
  const id = req.params.id;
  const u = user(req);
  if (!u || await getRole(u.id, id) !== "admin") return forbidden(res);
  await sql`DELETE FROM workspace_members WHERE workspace_id = ${id} AND user_id = ${req.params.userId}`;
  res.json({ ok: true });
});

// ---------- workspace tags ----------

apiRouter.get("/workspaces/:id/tags", async (req, res) => {
  const id = req.params.id;
  const u = user(req);
  if (!u || !atLeast(await getRole(u.id, id), "read")) return notFound(res);
  const rows = await sql`SELECT * FROM tags WHERE workspace_id = ${id} ORDER BY name`;
  res.json(rows);
});

apiRouter.patch("/tags/:id", async (req, res) => {
  const [tag] = await sql<{ id: string; workspace_id: string }[]>`SELECT id, workspace_id FROM tags WHERE id = ${req.params.id}`;
  if (!tag) return notFound(res);
  const u = user(req);
  if (!u || await getRole(u.id, tag.workspace_id) !== "admin") return forbidden(res);
  const color = str(req.body?.color, 20)?.trim();
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) return bad(res, "color must be #rrggbb");
  const [row] = await sql`UPDATE tags SET color = ${color} WHERE id = ${tag.id} RETURNING *`;
  res.json(row);
});

apiRouter.delete("/tags/:id", async (req, res) => {
  const [tag] = await sql<{ id: string; workspace_id: string }[]>`SELECT id, workspace_id FROM tags WHERE id = ${req.params.id}`;
  if (!tag) return notFound(res);
  const u = user(req);
  if (!u || await getRole(u.id, tag.workspace_id) !== "admin") return forbidden(res);
  await sql`DELETE FROM tags WHERE id = ${tag.id}`;
  res.json({ ok: true });
});

// ---------- projects ----------

apiRouter.get("/projects", async (req, res) => {
  const u = user(req);
  if (!u) return forbidden(res);
  const rows = await sql`
    SELECT p.*, 
      CASE WHEN p.owner_id = ${u.id} OR w.owner_id = ${u.id} THEN 'admin' 
           ELSE COALESCE(m.role, pm.role, 'read') 
      END AS role
    FROM projects p
    JOIN workspaces w ON w.id = p.workspace_id
    LEFT JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = ${u.id}
    LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ${u.id}
    WHERE p.owner_id = ${u.id} OR w.owner_id = ${u.id} OR m.user_id IS NOT NULL OR pm.user_id IS NOT NULL
    ORDER BY p.position, p.created_at
  `;
  res.json(rows);
});

apiRouter.post("/projects", async (req, res) => {
  const name = str(req.body?.name, 200)?.trim();
  if (!name) return bad(res, "name required");
  const workspaceId = req.body?.workspaceId;
  const folderId = str(req.body?.folderId) || null;
  const u = user(req);
  if (!u || await getRole(u.id, workspaceId) !== "admin") return forbidden(res);
  const viewType = req.body?.viewType === "list" ? "list" : "kanban";
  const [nextRow] = await sql<{ p: number }[]>`SELECT COALESCE(MAX(position) + 1, 0) AS p FROM projects WHERE workspace_id = ${workspaceId}`;
  const [project] = await (sql as any)`
    INSERT INTO projects (name, description, owner_id, workspace_id, folder_id, view_type, position)
    VALUES (${name}, ${str(req.body?.description) ?? ""}, ${u.id}, ${workspaceId}, ${folderId}::uuid, ${viewType}, ${nextRow?.p ?? 0})
    RETURNING *
  `;
  const defaults: [string, number][] =
    viewType === "list" ? [["Tasks", 0]] : [["Todo", 0], ["In Progress", 0], ["Done", 1]];
  for (let i = 0; i < defaults.length; i++) {
    const [colName, isDone] = defaults[i]!;
    await sql`INSERT INTO columns (project_id, name, position, is_done) VALUES (${project!.id}, ${colName}, ${i}, ${isDone})`;
  }
  await logActivity(u.id, project!.id, "created project", name);
  // Creator is both the owner and a manager by default
  await sql`INSERT INTO project_managers (project_id, user_id) VALUES (${project!.id}, ${u.id})`;
  res.status(201).json(project);
});

apiRouter.patch("/projects/reorder", async (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string"))
    return bad(res, "ids must be an array of strings");
  const u = user(req);
  if (!u) return forbidden(res);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i] as string;
    const [p] = await sql<{ workspace_id: string }[]>`SELECT workspace_id FROM projects WHERE id = ${id}`;
    if (p && atLeast(await getRole(u.id, p.workspace_id), "write")) {
      await sql`UPDATE projects SET position = ${i} WHERE id = ${id}`;
    }
  }
  res.json({ ok: true });
});

apiRouter.patch("/projects/:id", async (req, res) => {
  const id = req.params.id;
  const [p] = await sql<{ workspace_id: string }[]>`SELECT workspace_id FROM projects WHERE id = ${id}`;
  if (!p) return notFound(res);
  const u = user(req);
  if (!u || await getRole(u.id, p.workspace_id) !== "admin") return forbidden(res);
  
  const name = str(req.body?.name, 200)?.trim();
  const workspaceId = str(req.body?.workspaceId);
  const folderId = req.body?.folderId === undefined ? undefined : (str(req.body.folderId) || null);
  const position = typeof req.body?.position === "number" ? req.body.position : undefined;

  const [row] = await (sql as any)`
    UPDATE projects 
    SET 
      name = COALESCE(${name ?? null}, name),
      workspace_id = COALESCE(${workspaceId ?? null}, workspace_id),
      folder_id = ${folderId === undefined ? sql`folder_id` : sql`${folderId}::uuid`},
      position = COALESCE(${position ?? null}, position)
    WHERE id = ${id} 
    RETURNING *
  `;
  res.json(row);
});

apiRouter.delete("/projects/:id", async (req, res) => {
  const id = req.params.id;
  const ws = await projectWorkspace(id);
  if (ws === null) return notFound(res);
  const u = user(req);
  if (!u || await getRole(u.id, ws) !== "admin") return forbidden(res);
  await sql`DELETE FROM projects WHERE id = ${id}`;
  res.json({ ok: true });
});

// ---------- project members ----------

apiRouter.get("/projects/:id/members", async (req, res) => {
  const id = req.params.id;
  const wsId = await projectWorkspace(id);
  if (!wsId || !atLeast(await getProjectRole(req, id), "read")) return notFound(res);
  
  const [owner] = await sql`
    SELECT u.id, u.name, u.email, u.avatar_url, 'admin' AS role, true AS is_owner, false AS is_pending
    FROM projects p JOIN users u ON u.id = p.owner_id WHERE p.id = ${id}
  `;
  const members = await sql`
    SELECT u.id, u.name, u.email, u.avatar_url, m.role, false AS is_owner, false AS is_pending
    FROM project_members m JOIN users u ON u.id = m.user_id
    WHERE m.project_id = ${id} ORDER BY u.name
  `;
  const pending = await sql`
    SELECT email AS id, email AS name, email, '' AS avatar_url, role, false AS is_owner, true AS is_pending
    FROM pending_invitations WHERE target_id = ${id} AND target_type = 'project'
  `;
  res.json([owner, ...members, ...pending].filter(Boolean));
});

apiRouter.post("/projects/:id/members", async (req, res) => {
  const id = req.params.id;
  const u = user(req);
  if (!u) return forbidden(res);
  const role = await getProjectRole(req, id);
  if (role !== "admin") return forbidden(res);
  const email = str(req.body?.email, 200)?.trim().toLowerCase();
  const targetRole = req.body?.role;
  if (!email || !isRole(targetRole)) return bad(res, "email and valid role required");
  const [target] = await sql<{ id: string }[]>`SELECT id FROM users WHERE lower(email) = ${email}`;
  if (!target) {
    await sql`INSERT INTO pending_invitations (email, target_id, target_type, role, invited_by) VALUES (${email}, ${id}, 'project', ${targetRole}, ${u.id}) ON CONFLICT (email) DO UPDATE SET target_id = ${id}, target_type = 'project', role = ${targetRole}, invited_by = ${u.id}`;
    
    const [pRow] = await sql<{ name: string }[]>`SELECT name FROM projects WHERE id = ${id}`;
    sendPendingInvite({ to: email, workspaceName: pRow?.name ?? "a project", role: targetRole, invitedBy: u.name });
    
    return res.status(201).json({ ok: true, pending: true });
  }
  
  const [pRow] = await sql<{ owner_id: string; name: string }[]>`SELECT owner_id, name FROM projects WHERE id = ${id}`;
  if (target.id === pRow?.owner_id) return bad(res, "owner is already an admin");
  
  await sql`
    INSERT INTO project_members (project_id, user_id, role) VALUES (${id}, ${target.id}, ${targetRole})
    ON CONFLICT (project_id, user_id) DO UPDATE SET role = excluded.role
  `;
  res.status(201).json({ ok: true });
});

apiRouter.patch("/projects/:id/members/:userId", async (req, res) => {
  const id = req.params.id;
  if (await getProjectRole(req, id) !== "admin") return forbidden(res);
  if (!isRole(req.body?.role)) return bad(res, "valid role required");
  await sql`UPDATE project_members SET role = ${req.body.role} WHERE project_id = ${id} AND user_id = ${req.params.userId}`;
  res.json({ ok: true });
});

apiRouter.delete("/projects/:id/members/:userId", async (req, res) => {
  const id = req.params.id;
  if (await getProjectRole(req, id) !== "admin") return forbidden(res);
  await sql`DELETE FROM project_members WHERE project_id = ${id} AND user_id = ${req.params.userId}`;
  res.json({ ok: true });
});

apiRouter.get("/projects/:id/managers", async (req, res) => {
  const projectId = req.params.id;
  const ws = await projectWorkspace(projectId);
  if (ws === null || !atLeast(await getProjectRole(req, projectId), "read")) return notFound(res);
  
  // Include project owner automatically as a manager
  const rows = await sql`
    SELECT u.id, u.name, u.email, u.avatar_url FROM users u
    WHERE u.id IN (
      SELECT user_id FROM project_managers WHERE project_id = ${projectId}
      UNION
      SELECT owner_id FROM projects WHERE id = ${projectId}
    )
    ORDER BY u.name
  `;
  res.json(rows);
});

apiRouter.put("/projects/:id/managers", async (req, res) => {
  const projectId = req.params.id;
  const ws = await projectWorkspace(projectId);
  if (ws === null) return notFound(res);
  const u = user(req);
  if (!u || await getRole(u.id, ws) !== "admin") return forbidden(res);
  const ids = await memberIdsOnly(ws, req.body?.userIds);
  await sql`DELETE FROM project_managers WHERE project_id = ${projectId}`;
  for (const id of ids) {
    await sql`INSERT INTO project_managers (project_id, user_id) VALUES (${projectId}, ${id})`;
  }
  res.json({ ok: true });
});

// ---------- project sheets ----------

if (config.sheetsSyncEnabled) {
  apiRouter.get("/projects/:id/sheet-link", async (req, res) => {
    const projectId = req.params.id;
    const u = user(req);
    if (!u) return forbidden(res);
    const [link] = await sql`SELECT * FROM project_sheet_links WHERE project_id = ${projectId} AND user_id = ${u.id}`;
    res.json(link || null);
  });

  apiRouter.post("/projects/:id/sheet-link", async (req, res) => {
    const projectId = req.params.id;
    const u = user(req);
    if (!u) return forbidden(res);
    
    const [project] = await sql<{ name: string }[]>`SELECT name FROM projects WHERE id = ${projectId}`;
    if (!project) return notFound(res);

    try {
      const sheetInfo = await createProjectSheet(u.id, project.name, projectId);
      const syncToken = Math.random().toString(36).substring(2);
      
      const [link] = await (sql as any)`
        INSERT INTO project_sheet_links 
          (user_id, project_id, spreadsheet_id, spreadsheet_url, sheet_id, tab_name, sync_token)
        VALUES 
          (${u.id}, ${projectId}, ${sheetInfo.spreadsheetId}, ${sheetInfo.spreadsheetUrl}, ${sheetInfo.sheetId}, ${sheetInfo.tabName}, ${syncToken})
        RETURNING *
      `;
      
      await addStatusValidation(u.id, projectId, link.spreadsheet_id, link.sheet_id);
      await syncProjectToSheet(u.id, projectId, link.spreadsheet_id, link.tab_name);
      
      res.status(201).json(link);
    } catch (err: any) {
      console.error("Failed to link sheet:", err);
      res.status(500).json({ error: err.message || "Failed to link sheet" });
    }
  });

  apiRouter.delete("/projects/:id/sheet-link", async (req, res) => {
    const projectId = req.params.id;
    const u = user(req);
    if (!u) return forbidden(res);
    
    const [link] = await sql<ProjectSheetLink[]>`SELECT * FROM project_sheet_links WHERE project_id = ${projectId} AND user_id = ${u.id}`;
    if (link) {
      try {
        const auth = await getGoogleAuth(u.id);
        const drive = google.drive({ version: "v3", auth: auth as any });
        await drive.files.delete({ fileId: link.spreadsheet_id });
      } catch (err) {
        console.error("Failed to delete drive file during unlink:", err);
      }
      await sql`DELETE FROM project_sheet_links WHERE project_id = ${projectId} AND user_id = ${u.id}`;
    }
    res.json({ ok: true });
  });
}

// ---------- workspace sheets ----------

if (config.sheetsSyncEnabled) {
  apiRouter.get("/workspaces/:id/sheet-links", async (req, res) => {
  const workspaceId = req.params.id;
  const u = user(req);
  if (!u) return forbidden(res);
  const rows = await sql`
    SELECT * FROM project_sheet_links
    WHERE linked_at_workspace_id = ${workspaceId} AND user_id = ${u.id}
  `;
  res.json(rows);
});

apiRouter.post("/workspaces/:id/sheet-links", async (req, res) => {
  const workspaceId = req.params.id;
  const u = user(req);
  if (!u) return forbidden(res);
  
  const projectIds = req.body?.projectIds;
  const layoutMode = req.body?.layoutMode === 'stacked' ? 'stacked' : 'single';
  
  if (!Array.isArray(projectIds) || projectIds.length === 0) {
    return bad(res, "projectIds required");
  }

  const [workspace] = await sql<{ name: string }[]>`SELECT name FROM workspaces WHERE id = ${workspaceId}`;
  if (!workspace) return notFound(res);

  const projects = await sql<{ id: string, name: string }[]>`
    SELECT id, name FROM projects WHERE id IN ${sql(projectIds)} AND workspace_id = ${workspaceId}
  `;

  try {
    const sheetInfo = await createWorkspaceSheet(u.id, workspace.name, projects, layoutMode);
    const syncToken = Math.random().toString(36).substring(2);
    
    for (const linkInfo of sheetInfo.links) {
      await (sql as any)`
        INSERT INTO project_sheet_links 
          (user_id, project_id, spreadsheet_id, spreadsheet_url, sheet_id, tab_name, layout_mode, sync_token, linked_at_workspace_id)
        VALUES 
          (${u.id}, ${linkInfo.projectId}, ${sheetInfo.spreadsheetId}, ${sheetInfo.spreadsheetUrl}, ${linkInfo.sheetId}, ${linkInfo.tabName}, ${layoutMode}, ${syncToken}, ${workspaceId})
        ON CONFLICT (user_id, project_id, spreadsheet_id, tab_name) DO UPDATE SET
          spreadsheet_url = EXCLUDED.spreadsheet_url,
          sheet_id = EXCLUDED.sheet_id,
          layout_mode = EXCLUDED.layout_mode,
          sync_token = EXCLUDED.sync_token,
          linked_at_workspace_id = EXCLUDED.linked_at_workspace_id
      `;
      
      await addStatusValidation(u.id, linkInfo.projectId, sheetInfo.spreadsheetId, linkInfo.sheetId);
      await syncProjectToSheet(u.id, linkInfo.projectId, sheetInfo.spreadsheetId, linkInfo.tabName);
    }
    
    res.status(201).json({ ok: true });
  } catch (err: any) {
    console.error("Failed to link workspace sheets:", err);
    res.status(500).json({ error: err.message || "Failed to link workspace sheets" });
  }
});

apiRouter.delete("/workspaces/:id/sheet-links", async (req, res) => {
  const workspaceId = req.params.id;
  const u = user(req);
  if (!u) return forbidden(res);

  const links = await sql<ProjectSheetLink[]>`
    SELECT * FROM project_sheet_links
    WHERE linked_at_workspace_id = ${workspaceId} AND user_id = ${u.id}
  `;

  if (links.length > 0) {
    try {
      const auth = await getGoogleAuth(u.id);
      const drive = google.drive({ version: "v3", auth: auth as any });
      const uniqueSheetIds = [...new Set(links.map(l => l.spreadsheet_id))];

      for (const fileId of uniqueSheetIds) {
        await drive.files.delete({ fileId }).catch(err => {
          console.error(`Failed to delete drive file ${fileId}:`, err);
        });
      }
    } catch (err) {
      console.error("Failed to delete drive files during workspace unlink:", err);
    }

    await sql`
      DELETE FROM project_sheet_links
      WHERE user_id = ${u.id} AND project_id IN (SELECT id FROM projects WHERE workspace_id = ${workspaceId})
    `;
  }
  res.json({ ok: true });
  });
  }

  // ---------- board ----------
apiRouter.get("/projects/:id/board", async (req, res) => {
  const projectId = req.params.id;
  const ws = await projectWorkspace(projectId);
  if (ws === null || !atLeast(await getProjectRole(req, projectId), "read")) return notFound(res);
  const columns = await sql<{ id: string }[]>`SELECT * FROM columns WHERE project_id = ${projectId} ORDER BY position`;
  const tasks = columns.length
    ? await sql<Task[]>`SELECT * FROM tasks WHERE column_id IN ${sql(columns.map((c) => c.id))} ORDER BY position`
    : [];
  res.json({ columns, tasks: await withAssignees(tasks), workspaceId: ws });
});

apiRouter.patch("/projects/:id/columns/reorder", async (req, res) => {
  const projectId = req.params.id;
  const ws = await projectWorkspace(projectId);
  if (ws === null) return notFound(res);
  const u = user(req);
  if (!u || !atLeast(await getRole(u.id, ws), "write")) return forbidden(res);
  
  const ids = req.body?.ids;
  if (!Array.isArray(ids)) return bad(res, "ids array required");
  
  await sql.begin(async (sql) => {
    for (let i = 0; i < ids.length; i++) {
      await sql`UPDATE columns SET position = ${i} WHERE id = ${ids[i]} AND project_id = ${projectId}`;
    }
  });
  
  syncProjectToAllLinkedSheets(projectId);
  res.json({ ok: true });
});

apiRouter.post("/projects/:id/columns", async (req, res) => {
  const projectId = req.params.id;
  const ws = await projectWorkspace(projectId);
  if (ws === null) return notFound(res);
  const u = user(req);
  if (!u || await getRole(u.id, ws) !== "admin") return forbidden(res);
  const name = str(req.body?.name, 100)?.trim();
  if (!name) return bad(res, "name required");
  const [nextRow] = await sql<{ p: number }[]>`SELECT COALESCE(MAX(position) + 1, 0) AS p FROM columns WHERE project_id = ${projectId}`;
  const [col] = await sql`INSERT INTO columns (project_id, name, position) VALUES (${projectId}, ${name}, ${nextRow?.p ?? 0}) RETURNING *`;
  
  syncProjectToAllLinkedSheets(projectId);
  res.status(201).json(col);
});

apiRouter.patch("/columns/:id/done", async (req, res) => {
  const ctx = await columnWorkspace(req.params.id);
  if (!ctx) return notFound(res);
  const u = user(req);
  if (!u || await getRole(u.id, ctx.workspace_id) !== "admin") return forbidden(res);
  await sql`UPDATE columns SET is_done = 0 WHERE project_id = ${ctx.project_id}`;
  await sql`UPDATE columns SET is_done = 1 WHERE id = ${req.params.id}`;
  await sql`UPDATE tasks SET completed_at = COALESCE(completed_at::timestamp, CURRENT_TIMESTAMP::timestamp) WHERE column_id = ${req.params.id}`;
  await sql`UPDATE tasks SET completed_at = NULL WHERE column_id IN (SELECT id FROM columns WHERE project_id = ${ctx.project_id} AND is_done = 0)`;
  
  syncProjectToAllLinkedSheets(ctx.project_id);
  res.json({ ok: true });
});

apiRouter.patch("/columns/:id", async (req, res) => {
  const ctx = await columnWorkspace(req.params.id);
  if (!ctx) return notFound(res);
  const u = user(req);
  if (!u || !atLeast(await getRole(u.id, ctx.workspace_id), "write")) return forbidden(res);
  
  const name = str(req.body?.name, 100)?.trim();
  if (!name) return bad(res, "name required");

  const [row] = await sql`UPDATE columns SET name = ${name} WHERE id = ${req.params.id} RETURNING *`;
  
  syncProjectToAllLinkedSheets(ctx.project_id);
  res.json(row);
});

apiRouter.delete("/columns/:id", async (req, res) => {
  const ctx = await columnWorkspace(req.params.id);
  if (!ctx) return notFound(res);
  const u = user(req);
  if (!u || await getRole(u.id, ctx.workspace_id) !== "admin") return forbidden(res);
  await sql`DELETE FROM columns WHERE id = ${req.params.id}`;
  
  syncProjectToAllLinkedSheets(ctx.project_id);
  res.json({ ok: true });
});

// ---------- tasks ----------

apiRouter.post("/tasks", async (req, res) => {
  const columnId = req.body?.columnId;
  const title = str(req.body?.title, 500)?.trim();
  if (!title) return bad(res, "title required");

  let projectId: string | null = null;
  let workspaceId: string | null = null;
  let assigneeIds: string[] = [];
  const u = user(req);
  if (!u) {
    // Check for public access
    const shareId = req.headers["x-public-share-id"];
    if (columnId && shareId) {
       const ctx = await columnWorkspace(columnId);
       if (!ctx) return notFound(res);
       if (atLeast(await getProjectRole(req, ctx.project_id), "write")) {
         projectId = ctx.project_id;
         workspaceId = ctx.workspace_id;
       }
    }
    if (!projectId) return forbidden(res);
  } else {
    if (columnId) {
      const ctx = await columnWorkspace(columnId);
      if (!ctx) return notFound(res);
      if (!atLeast(await getProjectRole(req, ctx.project_id), "write")) return forbidden(res);
      projectId = ctx.project_id;
      workspaceId = ctx.workspace_id;
      assigneeIds = await memberIdsOnly(workspaceId, req.body?.assignees);
    }
  }

  const tags: string[] = Array.isArray(req.body?.tags)
    ? req.body.tags.filter((t: unknown) => typeof t === "string").slice(0, 20)
    : [];
  if (workspaceId !== null) await registerTags(workspaceId, tags);

  const [nextRow] = columnId
    ? await sql<{ p: number }[]>`SELECT COALESCE(MAX(position) + 1, 0) AS p FROM tasks WHERE column_id = ${columnId}`
    : await sql<{ p: number }[]>`SELECT COALESCE(MAX(position) + 1, 0) AS p FROM tasks WHERE column_id IS NULL AND created_by = ${u?.id ?? '00000000-0000-0000-0000-000000000000'}`;

  const priority = ["low", "medium", "high", "urgent"].includes(req.body?.priority)
    ? req.body.priority : "low";
  const progress = progressValue(req.body?.progress);

  const creatorId = u?.id ?? '00000000-0000-0000-0000-000000000000';

  const externalAssignees = Array.isArray(req.body?.externalAssignees)
    ? JSON.stringify(req.body.externalAssignees.filter((n: any) => typeof n === "string").map((n: string) => n.trim()).filter(Boolean))
    : "[]";

  const [colInfo] = columnId ? await sql<{ is_done: number }[]>`SELECT is_done FROM columns WHERE id = ${columnId}` : [null];
  const completedAt = colInfo?.is_done ? new Date().toISOString() : null;

  const [task] = await sql<Task[]>`
    INSERT INTO tasks (column_id, title, description, progress, priority, due_date, tags, position, created_by, external_assignees, completed_at)
    VALUES (${columnId ?? null}, ${title}, ${str(req.body?.description, 10000) ?? ""}, ${progress}, ${priority},
            ${str(req.body?.dueDate, 30) ?? null}::timestamp, ${JSON.stringify(tags)}, ${nextRow?.p ?? 0}, ${creatorId}, ${externalAssignees}, ${completedAt}::timestamp)
    RETURNING *
  `;

  if (workspaceId !== null && task && u) {
    await setAssignees(task.id, projectId, workspaceId, assigneeIds);
    const notify = await emailsOf(assigneeIds);
    if (notify.length && (await areNotificationsEnabled(workspaceId)))
      sendTaskAssigned({
        to: notify,
        taskTitle: task.title,
        description: task.description,
        projectName: await projectName(projectId),
        dueDate: task.due_date,
        priority: task.priority,
        assignedBy: u.name,
      });
  }
  if (task) {
    await logActivity(creatorId, projectId, "created task", title);
    if (projectId) syncProjectToAllLinkedSheets(projectId);
  }
  res.status(201).json(task ? (await withAssignees([task]))[0] : null);
});

apiRouter.patch("/tasks/:id", async (req, res) => {
  const existing = await taskCtx(req.params.id);
  if (!existing) return notFound(res);
  const role = await taskRole(req, existing);
  if (!atLeast(role, "checker")) return forbidden(res);

  const keys = Object.keys(req.body ?? {});
  const completionOnly = keys.every((k) => k === "completed");
  if (!atLeast(role, "write") && !completionOnly) return forbidden(res);

  const title = str(req.body?.title, 500)?.trim() ?? existing.title;
  const description = str(req.body?.description, 10000) ?? existing.description;
  const progress = req.body?.progress === undefined ? existing.progress : progressValue(req.body.progress, existing.progress);
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

        const externalAssignees = Array.isArray(req.body?.externalAssignees)
        ? JSON.stringify(req.body.externalAssignees.filter((n: any) => typeof n === "string").map((n: string) => n.trim()).filter(Boolean))
        : existing.external_assignees;

        const [task] = await sql<Task[]>`
        UPDATE tasks SET title = ${title}, description = ${description}, progress = ${progress}, priority = ${priority},
        due_date = ${dueDate ?? null}::timestamp, tags = ${tags}, external_assignees = ${externalAssignees}, 
        completed_at = ${completedAt ?? null}::timestamp, updated_at = CURRENT_TIMESTAMP WHERE id = ${existing.id} RETURNING *
        `;
  const u = user(req);
  if (existing.workspace_id !== null && Array.isArray(req.body?.assignees) && atLeast(role, "write") && u) {
    const before = new Set(((await assigneesFor([existing.id])).get(existing.id) ?? []).map((a) => a.id));
    const after = await memberIdsOnly(existing.workspace_id, req.body.assignees);
    await setAssignees(existing.id, existing.project_id, existing.workspace_id, after);
    const added = after.filter((id) => !before.has(id));
    const notify = await emailsOf(added);
    if (notify.length && (await areNotificationsEnabled(existing.workspace_id)))
      sendTaskAssigned({
        to: notify,
        taskTitle: title,
        description,
        projectName: await projectName(existing.project_id),
        dueDate,
        priority,
        assignedBy: u.name,
      });
  }

  if (req.body?.completed === true && !existing.completed_at && u)
    await logActivity(u.id, existing.project_id, "completed task", title);
  
  if (existing.project_id) syncProjectToAllLinkedSheets(existing.project_id);
  
  res.json(task ? (await withAssignees([task]))[0] : null);
});

apiRouter.patch("/tasks/:id/move", async (req, res) => {
  const taskId = req.params.id;
  const toColumn = req.body?.columnId;
  const toPosition = Number(req.body?.position);

  if (!taskId || !toColumn || Number.isNaN(toPosition)) {
    return bad(res, "taskId, columnId and position are required");
  }

  const existing = await taskCtx(taskId);
  if (!existing || existing.workspace_id === null) return notFound(res);
  const role = await taskRole(req, existing);

  const [target] = await sql<{ is_done: number; project_id: string }[]>`SELECT is_done, project_id FROM columns WHERE id = ${toColumn}`;
  if (!target) return bad(res, "target column not found");
  
  const targetCtx = await columnWorkspace(toColumn);
  if (!targetCtx || targetCtx.workspace_id !== existing.workspace_id) return notFound(res);

  const [source] = await sql<{ is_done: number }[]>`SELECT is_done FROM columns WHERE id = ${existing.column_id!}`;
  const completionMove = !!target.is_done || !!source?.is_done;
  if (!atLeast(role, "write") && !(role === "checker" && completionMove)) return forbidden(res);

  try {
    await sql.begin(async (sql) => {
      const sourceCol = existing.column_id!;
      // Re-order source column (closing the gap)
      await sql`UPDATE tasks SET position = position - 1 WHERE column_id = ${sourceCol} AND position > ${existing.position}`;
      // Re-order target column (making space)
      await sql`UPDATE tasks SET position = position + 1 WHERE column_id = ${toColumn} AND position >= ${toPosition}`;
      // Move the task
      await sql`
        UPDATE tasks SET column_id = ${toColumn}, position = ${toPosition},
        completed_at = CASE WHEN ${target.is_done}::int = 1 THEN COALESCE(completed_at, CURRENT_TIMESTAMP) ELSE NULL END,
        updated_at = CURRENT_TIMESTAMP WHERE id = ${existing.id}
      `;
    });

    const u = user(req);
    if (target.is_done && !existing.completed_at && u)
      await logActivity(u.id, existing.project_id, "completed task", existing.title);
    
    if (existing.project_id) syncProjectToAllLinkedSheets(existing.project_id);
    
    res.json({ ok: true });
  } catch (err: any) {
    console.error("Move task failed:", err);
    res.status(500).json({ error: "failed to move task: " + (err.message || String(err)) });
  }
});

apiRouter.delete("/tasks/:id", async (req, res) => {
  const existing = await taskCtx(req.params.id);
  if (!existing) return notFound(res);
  if (!atLeast(await taskRole(req, existing), "write")) return forbidden(res);
  await sql`DELETE FROM tasks WHERE id = ${existing.id}`;
  const u = user(req);
  if (u) await logActivity(u.id, existing.project_id, "deleted task", existing.title);
  if (existing.project_id) syncProjectToAllLinkedSheets(existing.project_id);
  res.json({ ok: true });
});

apiRouter.get("/tasks/mine", async (req, res) => {
  const u = user(req);
  if (!u) return forbidden(res);
  const rows = await sql<Task[]>`
    SELECT t.*, c.project_id FROM tasks t
    LEFT JOIN columns c ON c.id = t.column_id
    LEFT JOIN task_assignees ta ON ta.task_id = t.id
    WHERE (t.column_id IS NULL AND t.created_by = ${u.id}) OR ta.user_id = ${u.id}
    ORDER BY t.due_date IS NULL, t.due_date
  `;
  res.json(await withAssignees(rows));
});

// ---------- milestones ----------

apiRouter.get("/projects/:id/milestones", async (req, res) => {
  const ws = await projectWorkspace(req.params.id);
  if (ws === null || !atLeast(await getProjectRole(req, req.params.id), "read")) return notFound(res);
  const rows = await sql`SELECT * FROM milestones WHERE project_id = ${req.params.id} ORDER BY position`;
  res.json(rows);
});

apiRouter.post("/projects/:id/milestones", async (req, res) => {
  const projectId = req.params.id;
  const ws = await projectWorkspace(projectId);
  if (ws === null) return notFound(res);
  if (!atLeast(await getProjectRole(req, projectId), "write")) return forbidden(res);
  const title = str(req.body?.title, 300)?.trim();
  if (!title) return bad(res, "title required");
  const [nextRow] = await sql<{ p: number }[]>`SELECT COALESCE(MAX(position) + 1, 0) AS p FROM milestones WHERE project_id = ${projectId}`;
  const [row] = await sql`
    INSERT INTO milestones (project_id, title, due_date, position)
    VALUES (${projectId}, ${title}, ${str(req.body?.dueDate, 30) ?? null}::timestamp, ${nextRow?.p ?? 0}) RETURNING *
  `;
  res.status(201).json(row);
});

apiRouter.patch("/milestones/:id", async (req, res) => {
  const [m] = await sql<{ project_id: string }[]>`SELECT project_id FROM milestones WHERE id = ${req.params.id}`;
  if (!m) return notFound(res);
  const role = await getProjectRole(req, m.project_id);
  if (!atLeast(role, "checker")) return forbidden(res);
  const [row] = await sql`UPDATE milestones SET done = ${req.body?.done ? 1 : 0} WHERE id = ${req.params.id} RETURNING *`;
  res.json(row);
});

apiRouter.delete("/milestones/:id", async (req, res) => {
  const [m] = await sql<{ project_id: string }[]>`SELECT project_id FROM milestones WHERE id = ${req.params.id}`;
  if (!m) return notFound(res);
  const role = await getProjectRole(req, m.project_id);
  if (!atLeast(role, "write")) return forbidden(res);
  await sql`DELETE FROM milestones WHERE id = ${req.params.id}`;
  res.json({ ok: true });
});

// ---------- notes, activity, focus, widgets (personal) ----------

apiRouter.get("/notes", async (req, res) => {
  const u = user(req);
  if (!u) return forbidden(res);
  const rows = await sql`SELECT * FROM notes WHERE user_id = ${u.id} ORDER BY updated_at DESC`;
  res.json(rows);
});

apiRouter.post("/notes", async (req, res) => {
  const u = user(req);
  if (!u) return forbidden(res);
  const [row] = await sql`
    INSERT INTO notes (user_id, content, color)
    VALUES (${u.id}, ${str(req.body?.content, 5000) ?? ""}, ${str(req.body?.color, 20) ?? "yellow"}) RETURNING *
  `;
  res.status(201).json(row);
});

apiRouter.patch("/notes/:id", async (req, res) => {
  const u = user(req);
  if (!u) return forbidden(res);
  const [row] = await sql`
    UPDATE notes SET content = ${str(req.body?.content, 5000) ?? ""}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${req.params.id} AND user_id = ${u.id} RETURNING *
  `;
  if (!row) return notFound(res);
  res.json(row);
});

apiRouter.delete("/notes/:id", async (req, res) => {
  const u = user(req);
  if (!u) return forbidden(res);
  await sql`DELETE FROM notes WHERE id = ${req.params.id} AND user_id = ${u.id}`;
  res.json({ ok: true });
});

// ---------- public sharing ----------

apiRouter.patch("/projects/:id/share", async (req, res) => {
  const id = req.params.id;
  const ws = await projectWorkspace(id);
  const u = user(req);
  if (!u || !ws || await getRole(u.id, ws) !== "admin") return forbidden(res);
  
  const enabled = req.body?.enabled === true;
  const role = isRole(req.body?.role) ? req.body.role : "read";
  
  const [row] = await sql`
    UPDATE projects SET share_role = ${enabled ? role : null} WHERE id = ${id} RETURNING *
  `;
  res.json(row);
});

export const publicApiRouter = Router();

publicApiRouter.get("/projects/:shareId", async (req, res) => {
  const shareId = req.params.shareId;
  const [project] = await sql<any[]>`
    SELECT p.*, p.share_role as role FROM projects p WHERE p.share_id = ${shareId} AND p.share_role IS NOT NULL
  `;
  if (!project) return res.status(404).json({ error: "project not found or not public" });

  const columns = await sql<{ id: string }[]>`SELECT * FROM columns WHERE project_id = ${project.id} ORDER BY position`;
  const tasks = columns.length
    ? await sql<Task[]>`SELECT * FROM tasks WHERE column_id IN ${sql(columns.map((c) => c.id))} ORDER BY position`
    : [];
  
  res.json({ project, columns, tasks: await withAssignees(tasks) });
});

apiRouter.get("/activity", async (req, res) => {
  const u = user(req);
  if (!u) return forbidden(res);
  const rows = await sql`
    SELECT a.*, u.name AS user_name FROM activity a
    JOIN users u ON u.id = a.user_id
    WHERE a.user_id = ${u.id} ORDER BY a.created_at DESC LIMIT 30
  `;
  res.json(rows);
});

apiRouter.get("/focus", async (req, res) => {
  const u = user(req);
  if (!u) return forbidden(res);
  const [row] = await sql`SELECT goal, date FROM focus WHERE user_id = ${u.id} AND date = CURRENT_DATE`;
  res.json(row ?? { goal: "", date: null });
});

apiRouter.put("/focus", async (req, res) => {
  const u = user(req);
  if (!u) return forbidden(res);
  const goal = str(req.body?.goal, 500) ?? "";
  await sql`
    INSERT INTO focus (user_id, goal, date) VALUES (${u.id}, ${goal}, CURRENT_DATE)
    ON CONFLICT (user_id) DO UPDATE SET goal = excluded.goal, date = excluded.date
  `;
  res.json({ goal });
});

apiRouter.get("/widgets/layout", async (req, res) => {
  const u = user(req);
  if (!u) return forbidden(res);
  const [row] = await sql<{ layout: string }[]>`SELECT layout FROM widget_layouts WHERE user_id = ${u.id}`;
  res.json(row ? JSON.parse(row.layout) : null);
});

apiRouter.put("/widgets/layout", async (req, res) => {
  const u = user(req);
  if (!u) return forbidden(res);
  if (!Array.isArray(req.body)) return bad(res, "layout must be an array");
  const layout = JSON.stringify(req.body.slice(0, 50));
  await sql`
    INSERT INTO widget_layouts (user_id, layout, updated_at) VALUES (${u.id}, ${layout}, CURRENT_TIMESTAMP)
    ON CONFLICT (user_id) DO UPDATE SET layout = excluded.layout, updated_at = excluded.updated_at
  `;
  res.json({ ok: true });
});

apiRouter.post("/test-mailer", async (req, res) => {
  const u = user(req);
  if (!u || u.email.toLowerCase() !== "sanchakgargss@gmail.com") {
    return bad(res, "Unauthorized. Test mailer is only available to the admin.");
  }
  
  try {
    await sendTestEmail({ to: u.email });
    res.json({ ok: true });
  } catch (err: any) {
    if (err.message?.toLowerCase().includes("timeout") || err.code === "ETIMEDOUT") {
      return res.status(500).json({ 
        error: "Connection Timeout. Note: Render's Free tier strictly blocks outbound SMTP ports (25, 465, 587) to prevent spam. You must upgrade to a paid Render account, or use an HTTP-based email API (like Resend/SendGrid) instead of raw SMTP." 
      });
    }
    res.status(500).json({ error: err.message || "Failed to send email" });
  }
});
