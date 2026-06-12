import { LogIn } from "lucide-react";
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

  return (
    <div className="graph-paper flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm text-center">
        <Rocket size={64} className="anim-float mx-auto text-pen-blue" />
        <h1 className="font-hand mt-2 text-3xl font-bold">Jotter</h1>
        <p className="mt-1 text-ink-soft">Your notebook for getting things done.</p>

        <Divider label="sign in" className="my-5" />

        {providers.length === 0 ? (
          <p className="text-sm text-pen-red">
            No login providers are enabled. Set AUTH_GOOGLE_ENABLED or AUTH_ZITADEL_ENABLED on the
            server.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {providers.map((p) => (
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

        <Coffee size={36} className="mx-auto mt-6 text-ink-soft/60" />
      </Card>
    </div>
  );
}
