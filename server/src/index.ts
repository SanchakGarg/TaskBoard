import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { config } from "./config";
import { initAuth, authRouter } from "./auth";
import { apiRouter } from "./api";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // behind nginx/caddy reverse proxy

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"], // provider avatars
        styleSrc: ["'self'", "'unsafe-inline'"],
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
app.use("/api/auth", authRouter);
app.use("/api", apiRouter);

// serve built frontend in production
const clientDist = resolve(import.meta.dir, "../../client/dist");
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(join(clientDist, "index.html")));
}

app.use(
  (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
);

await initAuth();
app.listen(config.port, () => console.log(`taskboard listening on :${config.port}`));
