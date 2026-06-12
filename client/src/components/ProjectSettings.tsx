import { useCallback, useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { api } from "../lib/api";
import type { Member, Project, Role } from "../lib/types";
import { Avatar, Badge, Button, Divider, Input, Modal } from "./ui";

interface Manager {
  id: number;
  name: string;
  email: string;
  avatar_url: string;
}

interface ProjectSettingsProps {
  project: Project;
  role: Role; // caller's role in the project's workspace
  onClose: () => void;
  onSaved: () => void;
}

// Rename the project and manage its managers (CC'd on overdue-deadline emails).
export function ProjectSettings({ project, role, onClose, onSaved }: ProjectSettingsProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [name, setName] = useState(project.name);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const isAdmin = role === "admin";

  const load = useCallback(() => {
    api.get<Member[]>(`/workspaces/${project.workspace_id}/members`).then(setMembers);
    api.get<Manager[]>(`/projects/${project.id}/managers`).then(setManagers);
  }, [project.id, project.workspace_id]);

  useEffect(load, [load]);

  const results = query.trim()
    ? members.filter(
        (m) =>
          !managers.some((x) => x.id === m.id) &&
          (m.name.toLowerCase().includes(query.trim().toLowerCase()) ||
            m.email.toLowerCase().includes(query.trim().toLowerCase()))
      )
    : [];

  const save = async () => {
    setSaving(true);
    try {
      if (name.trim() && name.trim() !== project.name)
        await api.patch(`/projects/${project.id}`, { name: name.trim() });
      await api.put(`/projects/${project.id}/managers`, { userIds: managers.map((m) => m.id) });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Project settings">
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm text-ink-soft">Project name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!isAdmin}
            maxLength={200}
          />
        </div>

        <Divider />

        <section>
          <h3 className="font-hand mb-1 font-bold">Managers</h3>
          <p className="mb-3 text-sm text-ink-soft">
            Managers are CC'd when a task in this project passes its deadline without being
            completed.
          </p>

          {isAdmin && (
            <div className="relative mb-3">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-soft" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search members to add…"
                className="!py-1.5 !pl-8 text-sm"
              />
              {results.length > 0 && (
                <div className="anim-modal absolute left-0 top-full z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-lg border-2 border-ink bg-paper shadow-card-lift">
                  {results.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setManagers([...managers, m]);
                        setQuery("");
                      }}
                      className="anim-hover flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-paper-dark"
                    >
                      <Avatar name={m.name} src={m.avatar_url || undefined} size={22} />
                      <span className="min-w-0 flex-1 truncate">{m.name}</span>
                      <span className="hidden truncate text-xs text-ink-soft sm:inline">{m.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <ul className="flex flex-col gap-1.5">
            {managers.map((m) => (
              <li key={m.id} className="flex items-center gap-2 rounded-lg bg-paper-dark/50 px-2 py-1.5">
                <Avatar name={m.name} src={m.avatar_url || undefined} size={26} />
                <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
                <Badge tone="green">Manager</Badge>
                {isAdmin && (
                  <button
                    aria-label={`Remove ${m.name} as manager`}
                    onClick={() => setManagers(managers.filter((x) => x.id !== m.id))}
                    className="anim-hover cursor-pointer rounded p-1 text-ink-soft hover:text-pen-red"
                  >
                    <X size={15} />
                  </button>
                )}
              </li>
            ))}
            {managers.length === 0 && (
              <li className="text-sm text-ink-soft">No managers yet — search above to add some.</li>
            )}
          </ul>
        </section>

        {isAdmin && (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || !name.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
