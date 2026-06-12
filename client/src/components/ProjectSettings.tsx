import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Member, Project, Role } from "../lib/types";
import { Avatar, Badge, Checkbox, Modal } from "./ui";

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
}

// Project managers get CC'd on overdue-deadline emails for this project.
export function ProjectSettings({ project, role, onClose }: ProjectSettingsProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [managers, setManagers] = useState<number[]>([]);
  const isAdmin = role === "admin";

  const load = useCallback(() => {
    api.get<Member[]>(`/workspaces/${project.workspace_id}/members`).then(setMembers);
    api
      .get<Manager[]>(`/projects/${project.id}/managers`)
      .then((m) => setManagers(m.map((x) => x.id)));
  }, [project.id, project.workspace_id]);

  useEffect(load, [load]);

  const toggle = (id: number, on: boolean) => {
    const next = on ? [...managers, id] : managers.filter((x) => x !== id);
    setManagers(next);
    api.put(`/projects/${project.id}/managers`, { userIds: next });
  };

  return (
    <Modal open onClose={onClose} title={`${project.name} — settings`}>
      <h3 className="font-hand mb-1 font-bold">Project managers</h3>
      <p className="mb-3 text-sm text-ink-soft">
        Managers are CC'd when a task in this project passes its deadline without being completed.
      </p>
      <ul className="flex flex-col gap-2">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-2">
            <Avatar name={m.name} src={m.avatar_url || undefined} size={26} />
            <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
            {isAdmin ? (
              <Checkbox
                checked={managers.includes(m.id)}
                onChange={(on) => toggle(m.id, on)}
                label="Manager"
              />
            ) : (
              managers.includes(m.id) && <Badge tone="green">Manager</Badge>
            )}
          </li>
        ))}
        {members.length === 0 && <li className="text-sm text-ink-soft">No members yet.</li>}
      </ul>
    </Modal>
  );
}
