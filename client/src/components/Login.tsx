import { useState } from "react";
import { LogIn, UserPlus } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { Button, Card, Divider } from "./ui";
import { Rocket, Coffee } from "../illustrations";
import { useAuth } from "../hooks/useAuth";

const providerLabels: Record<string, string> = {
  google: "Continue with Google",
  zitadel: "Continue with Zitadel",
  guest: "Continue as Guest",
};

export function Login() {
  const { providers } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const localEnabled = providers.includes("local");
  const oauthProviders = providers.filter((p) => p !== "local");

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      if (mode === "signup") {
        await api.post("/auth/local/signup", { name, email, password });
      } else {
        await api.post("/auth/local/login", { email, password });
      }
      window.location.replace("/");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "failed to sign in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="graph-paper flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm text-center">
        <Rocket size={64} className="anim-float mx-auto text-pen-blue" />
        <h1 className="font-hand mt-2 text-3xl font-bold">Taskboard</h1>
        <p className="mt-1 text-ink-soft">Your notebook for getting things done.</p>

        <Divider label="sign in" className="my-5" />

        {oauthProviders.length === 0 && !localEnabled ? (
          <p className="text-sm text-pen-red">
            No login providers are enabled. Set AUTH_GOOGLE_ENABLED or AUTH_ZITADEL_ENABLED on the
            server.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {oauthProviders.map((p) => (
              <Button
                key={p}
                magnetic
                variant="secondary"
                onClick={() => {
                  window.location.href = `/api/auth/${p}/login`;
                }}
              >
                <LogIn size={16} />
                {providerLabels[p] ?? `Continue with ${p}`}
              </Button>
            ))}
          </div>
        )}

        {localEnabled && (
          <>
            <Divider label="local account" className="my-5" />
            <form
              className="flex flex-col gap-3 text-left"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              {mode === "signup" && (
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-lg border-2 border-ink-soft/40 bg-paper px-3 py-2 text-ink placeholder:text-ink-soft/60 focus:border-pen-blue focus:outline-none"
                />
              )}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full rounded-lg border-2 border-ink-soft/40 bg-paper px-3 py-2 text-ink placeholder:text-ink-soft/60 focus:border-pen-blue focus:outline-none"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full rounded-lg border-2 border-ink-soft/40 bg-paper px-3 py-2 text-ink placeholder:text-ink-soft/60 focus:border-pen-blue focus:outline-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={mode === "login" ? "primary" : "secondary"}
                  onClick={() => setMode("login")}
                >
                  <LogIn size={15} />
                  Sign in
                </Button>
                <Button
                  type="button"
                  variant={mode === "signup" ? "primary" : "secondary"}
                  onClick={() => setMode("signup")}
                >
                  <UserPlus size={15} />
                  Create account
                </Button>
              </div>
              <Button type="submit" magnetic disabled={busy || !email.trim() || !password.trim()}>
                {mode === "signup" ? "Create account" : "Sign in"}
              </Button>
              <p className="text-xs text-ink-soft">
                Local accounts are stored in Postgres and do not require an identity provider.
              </p>
              {error && <p className="text-sm text-pen-red">{error}</p>}
            </form>
          </>
        )}

        <Coffee size={36} className="mx-auto mt-6 text-ink-soft/60" />
      </Card>
    </div>
  );
}
