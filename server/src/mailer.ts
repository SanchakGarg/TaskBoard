import nodemailer from "nodemailer";

// SMTP is optional: configure SMTP_HOST (and friends) to enable email.
const host = process.env.SMTP_HOST;
const user = process.env.SMTP_USER;

export const mailEnabled = !!host;

const transporter = mailEnabled
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ? nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: user ? { user, pass: process.env.SMTP_PASS ?? "" } : undefined,
      // Force IPv4 — cloud environments often have broken IPv6 (ECONNREFUSED on ::1)
      family: 4,
      // Give up quickly instead of hanging for 60s
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      tls: { rejectUnauthorized: false },
    } as any)
  : null;

const from = process.env.SMTP_FROM ?? user ?? "taskboard@localhost";
const appUrl = process.env.APP_URL ?? "http://localhost:3000";

const isRealEmail = (e: string) => e.includes("@") && !e.endsWith("@local");

// ---------- app-styled HTML template (notebook look, inline styles) ----------

interface Detail {
  label: string;
  value: string;
  color?: string;
}

export function template(opts: {
  heading: string;
  intro: string;
  details?: Detail[];
  note?: string;
  cta?: { label: string; url: string };
}): string {
  const detailRows = (opts.details ?? [])
    .map(
      (d) => `
      <tr>
        <td style="padding:6px 14px 6px 0;color:#6b645a;font-size:13px;white-space:nowrap;">${d.label}</td>
        <td style="padding:6px 0;">
          <span style="display:inline-block;border:1px solid ${d.color ?? "#6b645a"}66;background:${d.color ?? "#6b645a"}1a;color:${d.color ?? "#2d2a26"};border-radius:999px;padding:2px 10px;font-size:13px;font-weight:600;">${d.value}</span>
        </td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#faf7ef;">
  <div style="background-color:#faf7ef;background-image:linear-gradient(#d9e4f0 1px,transparent 1px),linear-gradient(90deg,#d9e4f0 1px,transparent 1px);background-size:24px 24px;padding:32px 16px;font-family:ui-sans-serif,system-ui,'Segoe UI',sans-serif;color:#2d2a26;">
    <div style="max-width:520px;margin:0 auto;background:#faf7ef;border:2px solid #2d2a26;border-radius:14px;box-shadow:3px 4px 0 rgba(45,42,38,0.18);overflow:hidden;">
      <div style="padding:18px 24px;border-bottom:2px solid rgba(45,42,38,0.12);">
        <span style="font-family:'Segoe Print','Comic Sans MS',cursive;font-size:20px;font-weight:bold;">&#128203; Taskboard</span>
      </div>
      <div style="padding:24px;">
        <h1 style="margin:0 0 10px;font-family:'Segoe Print','Comic Sans MS',cursive;font-size:22px;">${opts.heading}</h1>
        <p style="margin:0 0 16px;line-height:1.5;color:#2d2a26;">${opts.intro}</p>
        ${detailRows ? `<table cellpadding="0" cellspacing="0" style="margin:0 0 16px;">${detailRows}</table>` : ""}
        ${opts.note ? `<p style="margin:0 0 16px;line-height:1.5;color:#6b645a;font-size:14px;">${opts.note}</p>` : ""}
        ${
          opts.cta
            ? `<a href="${opts.cta.url}" style="display:inline-block;background:#2d2a26;color:#faf7ef;text-decoration:none;border-radius:10px;padding:10px 22px;font-weight:600;">${opts.cta.label}</a>`
            : ""
        }
      </div>
      <div style="padding:12px 24px;border-top:2px dashed rgba(45,42,38,0.15);color:#6b645a;font-size:12px;">
        Sent by Taskboard &mdash; your notebook for getting things done.
      </div>
    </div>
  </div>
</body></html>`;
}

async function send(opts: {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  text: string;
}) {
  if (!transporter) return;
  const to = opts.to.filter(isRealEmail);
  const cc = (opts.cc ?? []).filter(isRealEmail);
  if (!to.length) return;
  try {
    await transporter.sendMail({ from, to, cc, subject: opts.subject, html: opts.html, text: opts.text });
  } catch (err) {
    console.error("mail send failed:", err instanceof Error ? err.message : err);
  }
}

// ---------- the three notification emails ----------

export function sendWorkspaceInvite(opts: {
  to: string;
  workspaceName: string;
  role: string;
  invitedBy: string;
}) {
  void send({
    to: [opts.to],
    subject: `You've been added to "${opts.workspaceName}" on Taskboard`,
    text: `${opts.invitedBy} added you to the workspace "${opts.workspaceName}" as ${opts.role}. Open ${appUrl} to get started.`,
    html: template({
      heading: "You're in! ✍️",
      intro: `<b>${opts.invitedBy}</b> added you to the workspace <b>"${opts.workspaceName}"</b>.`,
      details: [{ label: "Your role", value: opts.role, color: "#2f5d9e" }],
      cta: { label: "Open Taskboard", url: appUrl },
    }),
  });
}

const priorityColors: Record<string, string> = {
  low: "#6b645a",
  medium: "#2f5d9e",
  high: "#c98a2d",
  urgent: "#c0533e",
};

export function sendTaskAssigned(opts: {
  to: string[];
  taskTitle: string;
  description: string;
  projectName: string;
  dueDate: string | null;
  priority: string;
  assignedBy: string;
}) {
  const details: Detail[] = [
    { label: "Project", value: opts.projectName, color: "#4a7c59" },
    {
      label: "Priority",
      value: opts.priority.charAt(0).toUpperCase() + opts.priority.slice(1),
      color: priorityColors[opts.priority],
    },
  ];
  if (opts.dueDate) details.push({ label: "Due", value: opts.dueDate, color: "#2f5d9e" });
  void send({
    to: opts.to,
    subject: `Task assigned to you: ${opts.taskTitle}`,
    text: `${opts.assignedBy} assigned you "${opts.taskTitle}" in ${opts.projectName}.${opts.dueDate ? ` Due ${opts.dueDate}.` : ""} Open ${appUrl}.`,
    html: template({
      heading: opts.taskTitle,
      intro: `<b>${opts.assignedBy}</b> assigned this task to you.`,
      details,
      note: opts.description ? opts.description.slice(0, 300) : undefined,
      cta: { label: "View task", url: appUrl },
    }),
  });
}

export function sendDeadlinePassed(opts: {
  to: string[];
  cc: string[];
  taskTitle: string;
  projectName: string;
  dueDate: string;
}) {
  void send({
    to: opts.to,
    cc: opts.cc,
    subject: `Overdue: ${opts.taskTitle}`,
    text: `The task "${opts.taskTitle}" in ${opts.projectName} passed its deadline (${opts.dueDate}) and is not completed. Please share an update and set a new deadline: ${appUrl}`,
    html: template({
      heading: "This task is overdue ⏰",
      intro: `<b>"${opts.taskTitle}"</b> in <b>${opts.projectName}</b> passed its deadline and hasn't been completed.`,
      details: [{ label: "Was due", value: opts.dueDate, color: "#c0533e" }],
      note: "Please share a status update and set a new deadline on the board.",
      cta: { label: "Update the task", url: appUrl },
    }),
  });
}

export async function sendTestEmail(opts: { to: string }) {
  if (!mailEnabled || !transporter) throw new Error("SMTP is not configured on this server");
  const html = template({
    heading: "SMTP Test Successful 🚀",
    intro: "Your mailer configuration is working perfectly.",
    details: [{ label: "Status", value: "Connected", color: "#4a7c59" }],
    note: "You can safely ignore this email.",
  });
  
  // We call transporter directly here instead of send() so we can catch and THROW the error 
  // back to the API/UI, rather than swallowing it.
  await transporter.sendMail({
    from,
    to: opts.to,
    subject: "Taskboard SMTP Connection Successful",
    text: "If you are reading this, your SMTP configuration is working perfectly.",
    html
  });
}
