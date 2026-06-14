import { sql } from "./db";
import { mailEnabled, sendDeadlinePassed } from "./mailer";

// Hourly sweep: any workspace task past its deadline and not completed gets
// one email per deadline to its assignees, CC the project's managers.
// Re-notifies only if the deadline was changed (deadline_notified_for tracks it).

interface OverdueTask {
  id: number;
  title: string;
  dueDate: Date;
  projectId: number;
  projectName: string;
}

export async function runDeadlineSweep() {
  if (!mailEnabled) return;
  const overdue = await sql<OverdueTask[]>`
    SELECT t.id, t.title, t.due_date as "dueDate", p.id AS "projectId", p.name AS "projectName"
    FROM tasks t
    JOIN columns c ON c.id = t.column_id
    JOIN projects p ON p.id = c.project_id
    WHERE t.completed_at IS NULL
      AND t.due_date IS NOT NULL
      AND t.due_date::date < CURRENT_DATE
      AND (t.deadline_notified_for IS NULL OR t.deadline_notified_for::timestamp != t.due_date::timestamp)
  `;

  for (const task of overdue) {
    const assignees = await sql<{ email: string }[]>`
      SELECT u.email FROM task_assignees ta JOIN users u ON u.id = ta.user_id
      WHERE ta.task_id = ${task.id}
    `;
    const managers = await sql<{ email: string }[]>`
      SELECT u.email FROM project_managers pm JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = ${task.projectId}
    `;

    if (assignees.length) {
      sendDeadlinePassed({
        to: assignees.map((a) => a.email),
        cc: managers.map((m) => m.email),
        taskTitle: task.title,
        projectName: task.projectName,
        dueDate: task.dueDate.toISOString().split("T")[0]!,
      });
    }

    await sql`UPDATE tasks SET deadline_notified_for = ${task.dueDate} WHERE id = ${task.id}`;
  }

  return overdue.length;
}

// For local / non-Render environments: run sweep in-process every hour
export function startDeadlineWatcher() {
  if (!mailEnabled) {
    console.log("SMTP not configured — deadline emails disabled");
    return;
  }
  runDeadlineSweep().catch(console.error);
  setInterval(() => runDeadlineSweep().catch(console.error), 60 * 60 * 1000);
  console.log("Deadline watcher running (hourly)");
}
