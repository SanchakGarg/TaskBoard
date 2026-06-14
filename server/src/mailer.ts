import nodemailer from "nodemailer";
import dns from "dns";

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
      // Force IPv4 DNS resolution — Render resolves smtp.gmail.com to IPv6 by default
      // which causes ECONNREFUSED. dnsLookup is the correct nodemailer way to fix this.
      dnsLookup: (hostname: string, options: dns.LookupOneOptions, callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void) =>
        dns.lookup(hostname, { ...options, family: 4 }, callback),
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      tls: { rejectUnauthorized: false },
    } as any)
  : null;

const from = process.env.SMTP_FROM ?? user ?? "taskboard@localhost";
const appUrl = process.env.APP_URL ?? "http://localhost:3000";

const isRealEmail = (e: string) => e.includes("@") && !e.endsWith("@local");

// ---------- IST formatting helper ----------

export function formatIST(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  // Intl.DateTimeFormat is reliable in Node.js 14+ for timezone conversion
  const formatted = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
  
  // If the time is exactly midnight, just show the date
  if (formatted.toLowerCase().endsWith("12:00 am")) {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(d);
  }
  
  return formatted + " IST";
}

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
        <td style="padding:6px 0;color:#2d2a26;font-size:13px;font-weight:bold;">
          ${d.value}
        </td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#faf7ef;">
  <div style="background-color:#faf7ef;background-image:linear-gradient(#d9e4f0 1px,transparent 1px),linear-gradient(90deg,#d9e4f0 1px,transparent 1px);background-size:24px 24px;padding:32px 16px;font-family:ui-sans-serif,system-ui,'Segoe UI',sans-serif;color:#2d2a26;">
    <div style="max-width:520px;margin:0 auto;background:#faf7ef;border:2px solid #2d2a26;border-radius:14px;box-shadow:3px 4px 0 rgba(45,42,38,0.18);overflow:hidden;">
      <div style="padding:18px 24px;border-bottom:2px solid rgba(45,42,38,0.12);">
        <span style="font-family:'Segoe Print','Comic Sans MS',cursive;font-size:20px;font-weight:bold;">Taskboard</span>
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
        Sent by Taskboard &mdash; ${formatIST(new Date())}
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
    subject: `Access Granted to Workspace: ${opts.workspaceName}`,
    text: `${opts.invitedBy} granted you access to the workspace "${opts.workspaceName}" with ${opts.role} permissions. Visit ${appUrl} to access the workspace.`,
    html: template({
      heading: "Workspace Access Granted",
      intro: `You have been granted access to the workspace <b>"${opts.workspaceName}"</b> by <b>${opts.invitedBy}</b>.`,
      details: [{ label: "Access level", value: opts.role }],
      cta: { label: "Open Workspace", url: appUrl },
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
  const formattedDue = formatIST(opts.dueDate);
  const details: Detail[] = [
    { label: "Project", value: opts.projectName, color: "#4a7c59" },
    {
      label: "Priority",
      value: opts.priority.charAt(0).toUpperCase() + opts.priority.slice(1),
      color: priorityColors[opts.priority],
    },
  ];
  if (formattedDue) details.push({ label: "Due Date", value: formattedDue, color: "#2f5d9e" });
  void send({
    to: opts.to,
    subject: `Task Assigned: ${opts.taskTitle}`,
    text: `${opts.assignedBy} assigned you the task "${opts.taskTitle}" in ${opts.projectName}.${formattedDue ? ` Due: ${formattedDue}.` : ""} Access it at ${appUrl}`,
    html: template({
      heading: "New Task Assignment",
      intro: `You have been assigned a new task by <b>${opts.assignedBy}</b>.`,
      details,
      note: opts.description ? opts.description.slice(0, 300) : undefined,
      cta: { label: "View Task", url: appUrl },
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
  const formattedDue = formatIST(opts.dueDate);
  void send({
    to: opts.to,
    cc: opts.cc,
    subject: `Overdue Task: ${opts.taskTitle}`,
    text: `The task "${opts.taskTitle}" in ${opts.projectName} has passed its scheduled deadline (${formattedDue}). Please provide a status update: ${appUrl}`,
    html: template({
      heading: "Overdue Task Notification",
      intro: `The task <b>"${opts.taskTitle}"</b> in <b>${opts.projectName}</b> has exceeded its scheduled deadline.`,
      details: [{ label: "Deadline", value: formattedDue, color: "#c0533e" }],
      note: "Please provide a status update or adjust the deadline on the board.",
      cta: { label: "Update Task", url: appUrl },
    }),
  });
}

export async function sendTestEmail(opts: { to: string }) {
  if (!mailEnabled || !transporter) throw new Error("SMTP is not configured on this server");
  const html = template({
    heading: "SMTP Connection Test",
    intro: "The mailer configuration has been verified successfully.",
    details: [{ label: "Status", value: "Verified", color: "#4a7c59" }],
    note: "This is an automated verification email.",
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
