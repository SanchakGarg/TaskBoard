import { Router, type Request, type Response, type NextFunction } from "express";
import * as oidc from "openid-client";
import jwt from "jsonwebtoken";
import { config } from "./config";
import { upsertUser, getUser, db, type User } from "./db";

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
      : "WARNING: no auth providers enabled — set AUTH_GOOGLE_ENABLED/AUTH_ZITADEL_ENABLED/AUTH_GUEST_ENABLED"
  );
}

const enabledProviders = (): string[] => [
  ...providers.keys(),
  ...(config.auth.guest.enabled ? ["guest"] : []),
];

const SESSION_COOKIE = "tb_session";
const FLOW_COOKIE = "tb_flow";
const SESSION_TTL = "7d";

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

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return res.status(401).json({ error: "unauthenticated" });
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub: string };
    const user = getUser(Number(payload.sub));
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

authRouter.get("/:provider/login", (req, res) => {
  if (req.params.provider === "guest") {
    if (!config.auth.guest.enabled)
      return res.status(404).json({ error: "provider not enabled" });
    const user = upsertUser({
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

    const user = upsertUser({
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
  const { id, name, email, avatar_url, provider, theme_prefs } = (req as AuthedRequest).user;
  res.json({
    id,
    name,
    email,
    avatarUrl: avatar_url,
    provider,
    themePrefs: JSON.parse(theme_prefs || "{}"),
  });
});

authRouter.patch("/me", requireAuth, (req, res) => {
  const { id } = (req as AuthedRequest).user;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : undefined;
  const themePrefs = req.body?.themePrefs;

  let user = (req as AuthedRequest).user;

  if (name !== undefined || themePrefs !== undefined) {
    const newName = name !== undefined && name !== "" ? name : user.name;
    const newThemePrefs = themePrefs !== undefined ? JSON.stringify(themePrefs) : user.theme_prefs;

    user = db
      .query("UPDATE users SET name = ?, theme_prefs = ? WHERE id = ? RETURNING *")
      .get(newName, newThemePrefs, id) as User;
  }

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatar_url,
    provider: user.provider,
    themePrefs: JSON.parse(user.theme_prefs || "{}"),
  });
});
