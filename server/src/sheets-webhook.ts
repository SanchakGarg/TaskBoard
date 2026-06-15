import { Router } from "express";
import { sql, type Task } from "./db";
import { syncProjectToAllLinkedSheets, getGoogleAuth } from "./sheets";
import { google } from "googleapis";

export const sheetsWebhookRouter = Router();

sheetsWebhookRouter.post("/:syncToken", async (req, res) => {
  const { syncToken } = req.params;
  const { spreadsheetId, sheetId, row } = req.body;

  console.log(`Webhook triggered: token=${syncToken}, spreadsheet=${spreadsheetId}, row=${row}`);

  if (!syncToken) return res.status(400).json({ error: "syncToken required" });

  const [link] = await sql<any[]>`SELECT * FROM project_sheet_links WHERE sync_token = ${syncToken} AND spreadsheet_id = ${spreadsheetId}`;
  if (!link) {
    console.warn(`No link found for token ${syncToken} and spreadsheet ${spreadsheetId}`);
    return res.status(404).json({ error: "link not found" });
  }

  console.log(`Matched project ${link.project_id}, user ${link.user_id}, tab ${link.tab_name}`);

  try {
    const auth = await getGoogleAuth(link.user_id);
    const sheets = google.sheets({ version: "v4", auth: auth as any });

    // Fetch the updated row
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${link.tab_name}!A${row}:J${row}`,
    });

    const values = response.data.values?.[0];
    if (!values || values.length < 2) return res.json({ ok: true, msg: "row empty or invalid" });

    const [taskIdRaw, title, description, progressRaw, assigneesRaw, statusName, dueDateRaw, priority, tagsRaw, versionRaw] = values;

    console.log(`Row data: taskId=${taskIdRaw}, title=${title}, status=${statusName}`);

    // 1. Resolve Status (Column)
    const columns = await sql<{ id: string; name: string; is_done: number }[]>`SELECT id, name, is_done FROM columns WHERE project_id = ${link.project_id} ORDER BY position`;
    let targetColumn = columns.find(c => c.name.toLowerCase() === statusName?.toLowerCase());
    if (!targetColumn && columns.length > 0) {
      console.log(`Status "${statusName}" not found in project columns. Available: ${columns.map(c => c.name).join(", ")}`);
      targetColumn = columns[0]; // Default to first column
    }

    // 2. Prepare Update/Create
    const progress = Math.max(0, Math.min(100, parseInt(progressRaw) || 0));
    const tagsArr = (tagsRaw || "").split(",").map((s: string) => s.trim()).filter(Boolean);
    const tags = JSON.stringify(tagsArr);
    const dueDate = dueDateRaw ? new Date(dueDateRaw).toISOString() : null;
    const priorityClean = ["low", "medium", "high", "urgent"].includes(priority?.toLowerCase()) ? priority.toLowerCase() : "medium";

    // 3. Resolve Assignees
    const assigneesArr = (assigneesRaw || "").split(",").map((s: string) => s.trim()).filter(Boolean);
    const projectMembers = await sql<{ user_id: string; name: string }[]>`
      SELECT pm.user_id, u.name FROM project_members pm
      JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = ${link.project_id}
    `;
    
    const realIds: string[] = [];
    const extNames: string[] = [];
    
    for (const name of assigneesArr) {
      const member = projectMembers.find(m => m.name.toLowerCase() === name.toLowerCase());
      if (member) {
        realIds.push(member.user_id);
      } else {
        extNames.push(name);
      }
    }
    const externalAssignees = JSON.stringify(extNames);

    if (!taskIdRaw || taskIdRaw.trim() === "") {
      // Create new task
      const [nextRow] = await sql<{ p: number }[]>`SELECT COALESCE(MAX(position) + 1, 0) AS p FROM tasks WHERE column_id = ${targetColumn?.id}`;
      
      const [newTask] = await sql<Task[]>`
        INSERT INTO tasks (column_id, title, description, progress, priority, due_date, tags, position, created_by, external_assignees)
        VALUES (${targetColumn?.id || null}, ${title || "Untitled Task"}, ${description || ""}, ${progress}, ${priorityClean},
                ${dueDate ? sql`${dueDate}::timestamp` : null}, ${tags}, ${nextRow?.p ?? 0}, ${link.user_id}, ${externalAssignees})
        RETURNING *
      `;
      
      if (realIds.length > 0) {
        for (const uid of realIds) {
          await sql`INSERT INTO task_assignees (task_id, user_id) VALUES (${newTask.id}, ${uid}) ON CONFLICT DO NOTHING`;
        }
      }

      console.log(`Created new task ${newTask.id} from sheet row ${row}`);
      // Sync back to provide taskId and version
      syncProjectToAllLinkedSheets(link.project_id);
      return res.json({ ok: true });
    }

    const taskId = taskIdRaw;
    const [existing] = await sql<Task[]>`SELECT * FROM tasks WHERE id = ${taskId}`;
    if (!existing) return res.json({ ok: true, msg: "task not found" });

    // Simple conflict detection: if _version in sheet is older than updated_at in DB, ignore
    // But since we are sync-ing back, we usually want to accept sheet edits if they are "newer" in intent
    // A better way is checking if sheet _version matches DB updated_at at the time of read.
    const sheetVersion = parseInt(versionRaw) || 0;
    const dbVersion = new Date(existing.updated_at).getTime();

    if (sheetVersion < dbVersion) {
      console.log(`Ignoring stale sheet edit for task ${taskId} (Sheet: ${sheetVersion}, DB: ${dbVersion})`);
      // Sync back to correct the sheet
      syncProjectToAllLinkedSheets(link.project_id);
      return res.json({ ok: true, msg: "stale" });
    }

    await sql`
      UPDATE tasks SET
        title = ${title || existing.title},
        description = ${description || ""},
        progress = ${progress},
        priority = ${priorityClean},
        due_date = ${dueDate ? sql`${dueDate}::timestamp` : null},
        tags = ${tags},
        external_assignees = ${externalAssignees},
        column_id = ${targetColumn ? targetColumn.id : existing.column_id},
        completed_at = CASE 
          WHEN ${targetColumn?.is_done === 1} THEN COALESCE(completed_at, CURRENT_TIMESTAMP)
          WHEN ${targetColumn?.is_done === 0} THEN NULL
          ELSE completed_at
        END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${taskId}
    `;

    // Update real assignees
    await sql`DELETE FROM task_assignees WHERE task_id = ${taskId}`;
    for (const uid of realIds) {
      await sql`INSERT INTO task_assignees (task_id, user_id) VALUES (${taskId}, ${uid}) ON CONFLICT DO NOTHING`;
    }

    // 4. Fan out to other sheets
    syncProjectToAllLinkedSheets(link.project_id);

    res.json({ ok: true });
  } catch (err: any) {
    console.error("Sheet-to-App sync failed:", err);
    res.status(500).json({ error: err.message });
  }
});
