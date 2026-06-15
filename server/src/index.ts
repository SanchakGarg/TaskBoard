import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config";
import { initAuth, authRouter } from "./auth";
import { apiRouter, publicApiRouter } from "./api";
import { sheetsWebhookRouter } from "./sheets-webhook";
import { startDeadlineWatcher, runDeadlineSweep } from "./deadlines";
import { initDb } from "./db";
import { mailEnabled } from "./mailer";
import { startSheetSyncInterval } from "./sheets";


import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // behind nginx/caddy reverse proxy

console.log(mailEnabled ? "Mailer: ENABLED" : "Mailer: DISABLED (check SMTP_HOST in .env)");

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"], // provider avatars
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
      },
    },
  })
);

app.use(express.json({ limit: "100kb" }));

app.use(
  "/api",
  rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);
app.use(
  "/api/auth",
  rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false })
);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Endpoint for Render cron job (or any external scheduler) to trigger deadline emails.
// Secured by a shared secret so it can't be called by random users.
app.post("/api/cron/sweep", async (req, res) => {
  const secret = config.cronSecret;
  const auth = req.headers["x-cron-secret"];
  if (!secret || auth !== secret) return res.status(401).json({ error: "unauthorized" });
  try {
    const count = await runDeadlineSweep();
    res.json({ ok: true, notified: count });
  } catch (err) {
    console.error("Cron sweep failed:", err);
    res.status(500).json({ error: "sweep failed" });
  }
});

app.use("/api/auth", authRouter);
app.use("/api/public", publicApiRouter);
app.use("/api/sheets/webhook", sheetsWebhookRouter);
app.use("/api", apiRouter);

// serve built frontend in production
const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDist = resolve(__dirname, "../../client/dist");
if (existsSync(clientDist)) {
  // index.html must never be cached or browsers keep serving stale bundles;
  // hashed assets are safe to cache forever
  app.use(
    express.static(clientDist, {
      setHeaders: (res, path) => {
        if (path.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
        else res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      },
    })
  );
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(join(clientDist, "index.html"));
  });
}

app.use(
  (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
);

await initDb();
await initAuth();
startDeadlineWatcher();
startSheetSyncInterval();
app.listen(config.port, () => console.log(`taskboard listening on :${config.port}`));
