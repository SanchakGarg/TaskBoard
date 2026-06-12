// Renders the three notification emails into a single HTML file for preview.
// Run: bun server/scripts/email-preview.ts
import { template } from "../src/mailer";

const invite = template({
  heading: "You're in! ✍️",
  intro: `<b>Sanchak</b> added you to the workspace <b>"Makerspace"</b>.`,
  details: [{ label: "Your role", value: "Write", color: "#2f5d9e" }],
  cta: { label: "Open Taskboard", url: "http://localhost:3000" },
});

const assigned = template({
  heading: "Design chassis mount",
  intro: `<b>Sanchak</b> assigned this task to you.`,
  details: [
    { label: "Project", value: "Drone Build", color: "#4a7c59" },
    { label: "Priority", value: "High", color: "#c98a2d" },
    { label: "Due", value: "2026-06-20", color: "#2f5d9e" },
  ],
  note: "CAD the new chassis mount and check clearance against the battery tray.",
  cta: { label: "View task", url: "http://localhost:3000" },
});

const overdue = template({
  heading: "This task is overdue ⏰",
  intro: `<b>"Wire motor controllers"</b> in <b>Drone Build</b> passed its deadline and hasn't been completed.`,
  details: [{ label: "Was due", value: "2026-06-10", color: "#c0533e" }],
  note: "Please share a status update and set a new deadline on the board.",
  cta: { label: "Update the task", url: "http://localhost:3000" },
});

const page = `<!doctype html><html><body style="margin:0;background:#e8e4d8;">
${[
  ["1. Workspace invite", invite],
  ["2. Task assigned", assigned],
  ["3. Deadline passed", overdue],
]
  .map(
    ([label, html]) =>
      `<p style="font-family:sans-serif;margin:24px 16px 0;color:#444;">${label}</p>${html}`
  )
  .join("\n")}
</body></html>`;

await Bun.write("email-preview.html", page);
console.log("wrote email-preview.html");
