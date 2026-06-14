import { useCallback, useEffect, useState } from "react";
import { Copy, Link2, Search, Trash2, UserPlus, X } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { Member, Project, Role } from "../lib/types";
import { Avatar, Badge, Button, Divider, Dropdown, Input, Modal, Toggle, showToast, useConfirm } from "./ui";

interface Manager {
  id: string;
  name: string;
  email: string;
  avatar_url: string;
}

interface ProjectMember {
  id: string;
  name: string;
  email: string;
  avatar_url: string;
  role: Role;
  is_owner: boolean;
}

interface ProjectSettingsProps {
  project: Project;
  role: Role; // caller's role in the project's workspace
  onClose: () => void;
  onSaved: () => void;
}

const roleOptions: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "write", label: "Write" },
  { value: "checker", label: "Checker" },
  { value: "read", label: "Read" },
];

export function ProjectSettings({ project, role, onClose, onSaved }: ProjectSettingsProps) {
  const confirm = useConfirm();
  const [members, setMembers] = useState<Member[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [name, setName] = useState(project.name);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  
  const [shareEnabled, setShareEnabled] = useState(!!project.share_role);
  const [shareRole, setShareRole] = useState<Role>(project.share_role || "read");
  
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("read");
  const [inviteError, setInviteError] = useState("");

  const isAdmin = role === "admin";

  const load = useCallback(() => {
    api.get<Member[]>(`/workspaces/${project.workspace_id}/members`).then(setMembers);
    api.get<Manager[]>(`/projects/${project.id}/managers`).then(setManagers);
    api.get<ProjectMember[]>(`/projects/${project.id}/members`).then(setProjectMembers);
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
      
      // Update share settings
      await api.patch(`/projects/${project.id}/share`, { enabled: shareEnabled, role: shareRole });
      
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const addProjectMember = async () => {
    setInviteError("");
    try {
      await api.post(`/projects/${project.id}/members`, { email: inviteEmail.trim(), role: inviteRole });
      setInviteEmail("");
      load();
    } catch (e) {
      setInviteError(e instanceof ApiError ? e.message : "failed to add member");
    }
  };

  const removeProjectMember = async (userId: string, name: string) => {
    if (await confirm(`Remove ${name} from this project?`)) {
      await api.delete(`/projects/${project.id}/members/${userId}`);
      load();
    }
  };

  const shareUrl = `${window.location.origin}/#/public/${project.share_id}`;

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    showToast("Public link copied to clipboard!", "success");
  };

  return (
    <Modal open onClose={onClose} title="Project settings" wide>
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

        {/* ---------- sharing ---------- */}
        <section>
          <h3 className="font-hand mb-2 font-bold">Sharing</h3>
          
          <div className="flex items-center justify-between rounded-lg border-2 border-ink/10 bg-paper-dark/30 p-3 mb-3">
            <div className="flex flex-col">
              <span className="text-sm font-bold text-ink">Public Access</span>
              <span className="text-xs text-ink-soft">Anyone with the link can view/interact with this project.</span>
            </div>
            <Toggle
              checked={shareEnabled}
              disabled={!isAdmin}
              onChange={setShareEnabled}
            />
          </div>

          {shareEnabled && (
            <div className="flex flex-col gap-2 p-3 rounded-lg border-2 border-pen-blue/20 bg-pen-blue/5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-ink-soft uppercase tracking-wider">Public Permissions</span>
                <Dropdown
                  value={shareRole}
                  options={roleOptions.filter(o => o.value !== "admin")}
                  onChange={setShareRole}
                  disabled={!isAdmin}
                  className="w-28 text-xs"
                />
              </div>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 truncate rounded border border-ink/20 bg-paper px-2 py-1 text-xs text-ink-soft font-mono">
                  {shareUrl}
                </div>
                <Button size="sm" variant="secondary" onClick={copyLink}>
                  <Copy size={14} /> Copy
                </Button>
                <Button size="sm" variant="ghost" onClick={() => window.open(shareUrl, "_blank")}>
                  <Link2 size={14} /> Open
                </Button>
              </div>
            </div>
          )}
        </section>

        <Divider />

        {/* ---------- granular sharing ---------- */}
        <section>
          <h3 className="font-hand mb-2 font-bold">Project Members</h3>
          <p className="text-xs text-ink-soft mb-3">Share this project specifically with people, even if they aren't in the workspace.</p>
          
          <ul className="flex flex-col gap-1.5 mb-3">
            {projectMembers.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <Avatar name={m.name} src={m.avatar_url || undefined} size={24} />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {m.name}
                  <span className="ml-1.5 hidden text-xs text-ink-soft sm:inline">{m.email}</span>
                </span>
                {m.is_owner ? (
                <Badge tone="green">Owner</Badge>
                ) : isAdmin ? (
                <span className="flex items-center gap-1">
                  <Dropdown
                    value={m.role}
                    options={roleOptions.filter(o => o.value !== "admin")}
                    onChange={async (newRole) => {
                      await api.patch(`/projects/${project.id}/members/${m.id}`, { role: newRole });
                      load();
                    }}
                    className="w-24 text-xs"
                  />
                  <button
                    aria-label={`Remove ${m.name}`}
                    onClick={() => removeProjectMember(m.id, m.name)}
                    className="anim-hover cursor-pointer rounded p-1 text-ink-soft hover:text-pen-red"
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
                ) : (
                <Badge tone="neutral">{m.role}</Badge>
                )}

              </li>
            ))}
          </ul>

          {isAdmin && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addProjectMember();
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <Input
                type="email"
                placeholder="person@email.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="!w-44 !py-1 text-xs"
              />
              <Dropdown 
                value={inviteRole} 
                options={roleOptions.filter(o => o.value !== "admin")} 
                onChange={setInviteRole} 
                className="w-24 text-xs" 
              />
              <Button type="submit" size="xs" disabled={!inviteEmail.trim()}>
                <UserPlus size={12} /> Invite
              </Button>
              {inviteError && <p className="w-full text-[10px] text-pen-red">{inviteError}</p>}
            </form>
          )}
        </section>

        <Divider />

        <section>
          <h3 className="font-hand mb-2 font-bold">Managers</h3>
          <p className="text-xs text-ink-soft mb-3">Workspace members who get CC'd on overdue-deadline reminders.</p>

          {isAdmin && (
            <div className="relative mb-3">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-soft" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search workspace members..."
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
          </ul>
        </section>

        {isAdmin && (
          <>
            <Divider />
            <section className="border-t-2 border-pen-red/20 pt-2">
              <h3 className="font-hand mb-2 font-bold text-pen-red">Danger Zone</h3>
              <Button
                variant="secondary"
                className="!border-pen-red !text-pen-red hover:!bg-pen-red hover:!text-white"
                onClick={async () => {
                  if (await confirm(`Permanently delete project "${project.name}" and all its tasks?`)) {
                    await api.delete(`/projects/${project.id}`);
                    onSaved();
                    onClose();
                  }
                }}
              >
                <Trash2 size={16} /> Delete Project
              </Button>
            </section>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving || !name.trim()}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
