import { db } from "./db";
import { mailEnabled, sendDeadlinePassed } from "./mailer";

// Hourly sweep: any workspace task past its deadline and not completed gets
// one email per deadline to its assignees, CC the project's managers.
// Re-notifies only if the deadline was changed (deadline_notified_for tracks it).

interface OverdueTask {
  id: number;
  title: string;
  due_date: string;
  project_id: number;
  project_name: string;
}

function sweep() {
  if (!mailEnabled) return;
  const overdue = db
    .query(
      `SELECT t.id, t.title, t.due_date, p.id AS project_id, p.name AS project_name
       FROM tasks t
       JOIN columns c ON c.id = t.column_id
       JOIN projects p ON p.id = c.project_id
       WHERE t.completed_at IS NULL
         AND t.due_date IS NOT NULL
         AND t.due_date < date('now')
         AND (t.deadline_notified_for IS NULL OR t.deadline_notified_for != t.due_date)`
    )
    .all() as OverdueTask[];

  for (const task of overdue) {
    const assignees = db
      .query(
        `SELECT u.email FROM task_assignees ta JOIN users u ON u.id = ta.user_id
         WHERE ta.task_id = ?`
      )
      .all(task.id) as { email: string }[];
    const managers = db
      .query(
        `SELECT u.email FROM project_managers pm JOIN users u ON u.id = pm.user_id
         WHERE pm.project_id = ?`
      )
      .all(task.project_id) as { email: string }[];

    if (assignees.length)
      sendDeadlinePassed({
        to: assignees.map((a) => a.email),
        cc: managers.map((m) => m.email),
        taskTitle: task.title,
        projectName: task.project_name,
        dueDate: task.due_date,
      });

    db.run("UPDATE tasks SET deadline_notified_for = ? WHERE id = ?", [task.due_date, task.id]);
  }
}

export function startDeadlineWatcher() {
  if (!mailEnabled) {
    console.log("SMTP not configured — deadline emails disabled");
    return;
  }
  sweep();
  setInterval(sweep, 60 * 60 * 1000);
  console.log("Deadline watcher running (hourly)");
}
