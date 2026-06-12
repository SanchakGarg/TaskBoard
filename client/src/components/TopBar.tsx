import { useEffect, useState } from "react";
import { LogOut, Menu, Moon, Sun } from "lucide-react";
import { Avatar, Button, Tooltip } from "./ui";
import { useAuth } from "../hooks/useAuth";

export function TopBar({ title, onMenuClick }: { title: string; onMenuClick?: () => void }) {
  const { user, logout } = useAuth();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <header className="flex items-center gap-2 border-b-2 border-ink/20 bg-paper/70 px-3 py-3 backdrop-blur sm:px-5">
      {onMenuClick && (
        <button
          onClick={onMenuClick}
          aria-label="Open menu"
          className="anim-hover cursor-pointer rounded-md p-1 text-ink-soft hover:bg-paper-dark hover:text-ink md:hidden"
        >
          <Menu size={20} />
        </button>
      )}
      <h1 className="font-hand min-w-0 flex-1 truncate text-xl font-bold sm:text-2xl">{title}</h1>
      {user && (
        <div className="flex items-center gap-3">
          <Tooltip label={dark ? "Light theme" : "Dark theme"}>
            <Button size="sm" variant="ghost" onClick={() => setDark((d) => !d)}>
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </Button>
          </Tooltip>
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
