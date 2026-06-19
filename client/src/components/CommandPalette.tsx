import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckSquare, CornerDownLeft, KanbanSquare, Moon, Search } from "lucide-react";
import { api } from "../lib/api";
import type { View } from "../lib/types";

interface SearchResults {
  projects: { id: string; name: string; workspace_id: string }[];
  tasks: { id: string; title: string; project_id: string; project_name: string; completed_at: string | null }[];
}

interface Cmd {
  key: string;
  label: string;
  sub?: string;
  icon: React.ReactNode;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (v: View) => void;
}

const empty: SearchResults = { projects: [], tasks: [] };

export function CommandPalette({ open, onClose, onNavigate }: CommandPaletteProps) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults>(empty);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // reset + focus on open
  useEffect(() => {
    if (!open) return;
    setQ("");
    setResults(empty);
    setActive(0);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  // debounced search
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) {
      setResults(empty);
      return;
    }
    let cancelled = false;
    const id = setTimeout(() => {
      api
        .get<SearchResults>(`/search?q=${encodeURIComponent(term)}`)
        .then((r) => !cancelled && setResults(r))
        .catch(() => {});
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [q, open]);

  const toggleTheme = () => {
    const dark = document.documentElement.classList.toggle("dark");
    localStorage.setItem("theme", dark ? "dark" : "light");
  };

  const commands = useMemo<Cmd[]>(() => {
    const term = q.trim().toLowerCase();
    const list: Cmd[] = [];
    const statics: Cmd[] = [
      {
        key: "mytasks",
        label: "Go to My Tasks",
        icon: <CheckSquare size={15} />,
        run: () => {
          onNavigate({ kind: "mytasks" });
          onClose();
        },
      },
      {
        key: "theme",
        label: "Toggle dark mode",
        icon: <Moon size={15} />,
        run: () => {
          toggleTheme();
          onClose();
        },
      },
    ];
    for (const s of statics) if (!term || s.label.toLowerCase().includes(term)) list.push(s);
    for (const p of results.projects)
      list.push({
        key: "p-" + p.id,
        label: p.name,
        sub: "Project",
        icon: <KanbanSquare size={15} />,
        run: () => {
          onNavigate({ kind: "board", projectId: p.id });
          onClose();
        },
      });
    for (const t of results.tasks)
      list.push({
        key: "t-" + t.id,
        label: t.title,
        sub: `Task · ${t.project_name}`,
        icon: <CheckSquare size={15} />,
        run: () => {
          onNavigate({ kind: "board", projectId: t.project_id });
          onClose();
        },
      });
    return list;
  }, [q, results, onNavigate, onClose]);

  useEffect(() => setActive(0), [commands.length]);

  if (!open) return null;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, commands.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      commands[active]?.run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh]" onMouseDown={onClose}>
      <div className="anim-backdrop absolute inset-0 bg-ink/30" />
      <div
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKey}
        className="anim-modal relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-xl border-2 border-ink bg-paper shadow-card-lift"
      >
        <div className="flex items-center gap-2 border-b-2 border-ink/10 px-3 py-2.5">
          <Search size={16} className="shrink-0 text-ink-soft" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search projects & tasks…"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-soft/60"
          />
          <kbd className="shrink-0 rounded border border-ink/20 px-1 text-[10px] text-ink-soft">esc</kbd>
        </div>

        <div className="max-h-80 overflow-y-auto py-1">
          {commands.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-ink-soft">
              {q.trim().length < 2 ? "Type to search…" : "No matches"}
            </p>
          ) : (
            commands.map((c, i) => (
              <button
                key={c.key}
                onMouseEnter={() => setActive(i)}
                onClick={c.run}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm ${
                  i === active ? "bg-pen-blue/10" : "hover:bg-paper-dark"
                }`}
              >
                <span className="shrink-0 text-ink-soft">{c.icon}</span>
                <span className="flex-1 truncate text-ink">{c.label}</span>
                {c.sub && <span className="shrink-0 text-xs text-ink-soft">{c.sub}</span>}
                {i === active && <CornerDownLeft size={13} className="shrink-0 text-ink-soft" />}
              </button>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
