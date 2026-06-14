import { sendTestEmail } from "./server/src/mailer";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const to = "sanchak.garg_ug2023@ashoka.edu.in";
  console.log(`Sending test email to ${to}...`);
  try {
    await sendTestEmail({ to });
    console.log("Success: Email sent!");
  } catch (err) {
    console.error("Failed to send email:", err);
    process.exit(1);
  }
}

main();
