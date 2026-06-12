import { LogOut } from "lucide-react";
import { Avatar, Button, Tooltip } from "./ui";
import { useAuth } from "../hooks/useAuth";

export function TopBar({ title }: { title: string }) {
  const { user, logout } = useAuth();

  return (
    <header className="flex items-center justify-between border-b-2 border-ink/20 bg-paper/70 px-5 py-3 backdrop-blur">
      <h1 className="font-hand text-2xl font-bold">{title}</h1>
      {user && (
        <div className="flex items-center gap-3">
          <Tooltip label={`${user.name} (${user.email})`}>
            <Avatar name={user.name} src={user.avatarUrl || undefined} />
          </Tooltip>
          <Button size="sm" variant="ghost" onClick={() => logout().then(() => location.reload())}>
            <LogOut size={16} /> Logout
          </Button>
        </div>
      )}
    </header>
  );
}
