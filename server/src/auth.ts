import { randomBytes, pbkdf2Sync, timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import * as oidc from "openid-client";
import jwt from "jsonwebtoken";
import { config } from "./config";
import {
  createLocalUser,
  getLocalUserByEmail,
  getUser,
  getUserByEmail,
  upsertUser,
  type User,
} from "./db";

type ProviderName = "google" | "zitadel";

const providers = new Map<ProviderName, oidc.Configuration>();

export async function initAuth() {
  if (config.auth.google.enabled) {
    providers.set(
      "google",
      await oidc.discovery(
        new URL(config.auth.google.issuer),
        config.auth.google.clientId,
        config.auth.google.clientSecret
      )
    );
  }
  if (config.auth.zitadel.enabled) {
    providers.set(
      "zitadel",
      await oidc.discovery(
        new URL(config.auth.zitadel.issuer),
        config.auth.zitadel.clientId,
        config.auth.zitadel.clientSecret
      )
    );
  }
  const enabled = enabledProviders();
  console.log(
    enabled.length
      ? `Auth providers enabled: ${enabled.join(", ")}`
      : "WARNING: no auth providers enabled — set AUTH_GOOGLE_ENABLED/AUTH_ZITADEL_ENABLED/AUTH_GUEST_ENABLED/AUTH_LOCAL_ENABLED"
  );
}

const enabledProviders = (): string[] => [
  ...providers.keys(),
  ...(config.auth.guest.enabled ? ["guest"] : []),
  ...(config.auth.local.enabled ? ["local"] : []),
];

const SESSION_COOKIE = "tb_session";
const FLOW_COOKIE = "tb_flow";
const SESSION_TTL = "7d";
const LOCAL_PASSWORD_ITERATIONS = 210_000;

const cookieOpts = (maxAgeMs: number) =>
  [
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    config.isProd ? `Secure` : "",
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ]
    .filter(Boolean)
    .join("; ");

const setCookie = (res: Response, name: string, value: string, maxAgeMs: number) =>
  res.append("Set-Cookie", `${name}=${value}; ${cookieOpts(maxAgeMs)}`);

const readCookie = (req: Request, name: string): string | null => {
  const header = req.headers.cookie ?? "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
};

const normalizeEmail = (value: unknown): string | null =>
  typeof value === "string" ? value.trim().toLowerCase() : null;

const normalizeName = (value: unknown, fallbackEmail: string): string => {
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallbackEmail.split("@")[0] || "User";
};

const hashPassword = (password: string): string => {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, LOCAL_PASSWORD_ITERATIONS, 64, "sha512").toString(
    "hex"
  );
  return `pbkdf2$${LOCAL_PASSWORD_ITERATIONS}$${salt}$${hash}`;
};

const verifyPassword = (password: string, stored: string | null): boolean => {
  if (!stored) return false;
  const [algo, iterStr, salt, expectedHex] = stored.split("$");
  if (algo !== "pbkdf2") return false;
  const iterations = Number(iterStr);
  if (!Number.isInteger(iterations) || iterations <= 0 || !salt || !expectedHex) return false;
  const actualHex = pbkdf2Sync(password, salt, iterations, 64, "sha512").toString("hex");
  const actual = Buffer.from(actualHex, "hex");
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

const publicUser = (user: User) => {
  const { id, name, email, avatar_url, provider } = user;
  return { id, name, email, avatarUrl: avatar_url, provider };
};

export const issueSession = (res: Response, user: User) => {
  const token = jwt.sign(
    { sub: String(user.id), name: user.name, email: user.email },
    config.jwtSecret,
    { expiresIn: SESSION_TTL }
  );
  setCookie(res, SESSION_COOKIE, token, 7 * 24 * 3600 * 1000);
};

export interface AuthedRequest extends Request {
  user: User;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return res.status(401).json({ error: "unauthenticated" });
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub: string };
    const user = await getUser(Number(payload.sub));
    if (!user) return res.status(401).json({ error: "unauthenticated" });
    (req as AuthedRequest).user = user;
    next();
  } catch {
    return res.status(401).json({ error: "unauthenticated" });
  }
}

export const authRouter = Router();

authRouter.get("/providers", (_req, res) => {
  res.json({ providers: enabledProviders() });
});

authRouter.post("/local/signup", async (req, res) => {
  if (!config.auth.local.enabled) return res.status(404).json({ error: "provider not enabled" });
  const email = normalizeEmail(req.body?.email);
  const name = normalizeName(req.body?.name, email ?? "");
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!email) return res.status(400).json({ error: "email required" });
  if (password.length < 8) return res.status(400).json({ error: "password must be at least 8 characters" });
  if (await getUserByEmail(email)) return res.status(409).json({ error: "email already in use" });
  const user = await createLocalUser({
    email,
    name,
    password_hash: hashPassword(password),
  });
  issueSession(res, user);
  res.status(201).json({ ok: true, user: publicUser(user) });
});

authRouter.post("/local/login", async (req, res) => {
  if (!config.auth.local.enabled) return res.status(404).json({ error: "provider not enabled" });
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!email || !password) return res.status(400).json({ error: "email and password required" });
  const user = await getLocalUserByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: "invalid email or password" });
  }
  issueSession(res, user);
  res.json({ ok: true, user: publicUser(user) });
});

authRouter.get("/:provider/login", async (req, res) => {
  if (req.params.provider === "guest") {
    if (!config.auth.guest.enabled)
      return res.status(404).json({ error: "provider not enabled" });
    const user = await upsertUser({
      provider: "guest",
      subject: "guest",
      email: "guest@local",
      name: "Guest",
      avatar_url: "",
    });
    issueSession(res, user);
    return res.redirect("/");
  }

  const name = req.params.provider as ProviderName;
  const provider = providers.get(name);
  if (!provider) return res.status(404).json({ error: "provider not enabled" });

  const codeVerifier = oidc.randomPKCECodeVerifier();
  const state = oidc.randomState();

  oidc.calculatePKCECodeChallenge(codeVerifier).then((challenge) => {
    const url = oidc.buildAuthorizationUrl(provider, {
      redirect_uri: `${config.appUrl}/api/auth/${name}/callback`,
      scope: "openid email profile",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    const flow = jwt.sign({ codeVerifier, state, provider: name }, config.jwtSecret, {
      expiresIn: "10m",
    });
    setCookie(res, FLOW_COOKIE, flow, 10 * 60 * 1000);
    res.redirect(url.href);
  });
});

authRouter.get("/:provider/callback", async (req, res) => {
  const name = req.params.provider as ProviderName;
  const provider = providers.get(name);
  const flowToken = readCookie(req, FLOW_COOKIE);
  if (!provider || !flowToken) return res.redirect("/?auth_error=flow");

  try {
    const flow = jwt.verify(flowToken, config.jwtSecret) as {
      codeVerifier: string;
      state: string;
      provider: string;
    };
    if (flow.provider !== name) throw new Error("provider mismatch");

    const currentUrl = new URL(req.originalUrl, config.appUrl);
    const tokens = await oidc.authorizationCodeGrant(provider, currentUrl, {
      pkceCodeVerifier: flow.codeVerifier,
      expectedState: flow.state,
    });
    const claims = tokens.claims();
    if (!claims?.sub) throw new Error("no subject in token");

    const user = await upsertUser({
      provider: name,
      subject: claims.sub,
      email: (claims.email as string) ?? "",
      name: (claims.name as string) ?? (claims.email as string) ?? "User",
      avatar_url: (claims.picture as string) ?? "",
    });

    setCookie(res, FLOW_COOKIE, "", 0);
    issueSession(res, user);
    res.redirect("/");
  } catch (err) {
    console.error("Auth callback failed:", err);
    res.redirect("/?auth_error=callback");
  }
});

authRouter.post("/logout", (_req, res) => {
  setCookie(res, SESSION_COOKIE, "", 0);
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json(publicUser((req as AuthedRequest).user));
});
