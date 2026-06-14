import { useCallback, useEffect, useState } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { Member, Role, TagDef, Workspace } from "../lib/types";
import { Avatar, Badge, Button, Divider, Dropdown, Input, Modal, Toggle, useConfirm } from "./ui";

const roleOptions: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "write", label: "Write" },
  { value: "checker", label: "Checker" },
  { value: "read", label: "Read" },
];

const roleHelp: Record<Role, string> = {
  admin: "Everything: projects, members, settings",
  write: "Read + create, edit and complete tasks",
  checker: "Read + mark tasks complete only",
  read: "View tasks only",
};

interface WorkspaceSettingsProps {
  workspace: Workspace;
  onClose: () => void;
  onSaved: () => void;
}

export function WorkspaceSettings({ workspace, onClose, onSaved }: WorkspaceSettingsProps) {
  const confirm = useConfirm();
  const [members, setMembers] = useState<Member[]>([]);
  const [tags, setTags] = useState<TagDef[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("write");
  const [error, setError] = useState("");
  const [name, setName] = useState(workspace.name);
  const isAdmin = workspace.role === "admin";

  const rename = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === workspace.name) return;
    await api.patch(`/workspaces/${workspace.id}`, { name: trimmed });
    onSaved();
  };

  const load = useCallback(() => {
    api.get<Member[]>(`/workspaces/${workspace.id}/members`).then(setMembers);
    api.get<TagDef[]>(`/workspaces/${workspace.id}/tags`).then(setTags);
  }, [workspace.id]);

  useEffect(load, [load]);

  const addMember = async () => {
    setError("");
    try {
      await api.post(`/workspaces/${workspace.id}/members`, { email: email.trim(), role });
      setEmail("");
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "failed to add member");
    }
  };

  return (
    <Modal open onClose={onClose} title="Workspace settings" wide>
      <div className="flex flex-col gap-4">
        {/* ---------- rename ---------- */}
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-sm text-ink-soft">Workspace name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isAdmin}
              maxLength={100}
            />
          </div>
          {isAdmin && (
            <Button size="sm" onClick={rename} disabled={!name.trim() || name.trim() === workspace.name}>
              Rename
            </Button>
          )}
        </div>

        <Divider />

        {/* ---------- members ---------- */}
        <section>
          <h3 className="font-hand mb-2 font-bold">Members</h3>
          <ul className="flex flex-col gap-1.5">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <Avatar name={m.name} src={m.avatar_url || undefined} size={26} />
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
                      options={roleOptions}
                      onChange={(r) =>
                        api
                          .patch(`/workspaces/${workspace.id}/members/${m.id}`, { role: r })
                          .then(load)
                      }
                      className="w-28 text-sm"
                    />
                    <button
                      aria-label={`Remove ${m.name}`}
                      onClick={async () => {
                        if (await confirm(`Remove ${m.name} from "${workspace.name}"?`))
                          api.delete(`/workspaces/${workspace.id}/members/${m.id}`).then(load);
                      }}
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
                addMember();
              }}
              className="mt-3 flex flex-wrap items-center gap-2"
            >
              <Input
                type="email"
                placeholder="person@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="!w-52 !py-1.5 text-sm"
              />
              <Dropdown value={role} options={roleOptions} onChange={setRole} className="w-28 text-sm" />
              <Button type="submit" size="sm" disabled={!email.trim()}>
                <UserPlus size={14} /> Add
              </Button>
              <p className="w-full text-xs text-ink-soft">{roleHelp[role]}</p>
              {error && <p className="w-full text-xs text-pen-red">{error}</p>}
            </form>
          )}
        </section>

        <Divider />

        {/* ---------- settings ---------- */}
        <section>
          <h3 className="font-hand mb-2 font-bold">Settings</h3>
          <div className="flex items-center justify-between rounded-lg border-2 border-ink/10 bg-paper-dark/30 p-3">
            <div className="flex flex-col">
              <span className="text-sm font-bold text-ink">Email Notifications</span>
              <span className="text-xs text-ink-soft">Send emails for invitations, assignments, and deadlines.</span>
            </div>
            <Toggle
              checked={workspace.notifications_enabled === 1}
              disabled={!isAdmin}
              onChange={(checked) =>
                api.patch(`/workspaces/${workspace.id}`, { notificationsEnabled: checked }).then(onSaved)
              }
            />
          </div>
        </section>

        <Divider />

        {/* ---------- tags ---------- */}
        <section>
          <h3 className="font-hand mb-2 font-bold">Tags</h3>
          {tags.length === 0 ? (
            <p className="text-sm text-ink-soft">
              No tags yet — they appear here as you add them to tasks.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {tags.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  {isAdmin ? (
                    <input
                      type="color"
                      value={t.color}
                      onChange={(e) => {
                        const color = e.target.value;
                        setTags((prev) => prev.map((x) => (x.id === t.id ? { ...x, color } : x)));
                      }}
                      onBlur={(e) => api.patch(`/tags/${t.id}`, { color: e.target.value }).then(load)}
                      className="h-6 w-8 cursor-pointer rounded border-2 border-ink/40 bg-transparent"
                      aria-label={`Color for ${t.name}`}
                    />
                  ) : (
                    <span className="h-4 w-4 rounded-full" style={{ background: t.color }} />
                  )}
                  <span
                    className="rounded-full border px-2 py-0.5 text-xs font-medium"
                    style={{ color: t.color, borderColor: `${t.color}66`, background: `${t.color}1a` }}
                  >
                    {t.name}
                  </span>
                  {isAdmin && (
                    <button
                      aria-label={`Delete tag ${t.name}`}
                      onClick={async () => {
                        if (await confirm(`Delete tag "${t.name}"? Tasks keep the label but lose its color.`))
                          api.delete(`/tags/${t.id}`).then(load);
                      }}
                      className="anim-hover ml-auto cursor-pointer rounded p-1 text-ink-soft hover:text-pen-red"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        {/* ---------- delete ---------- */}
        {isAdmin && (
          <section className="mt-4 pt-4 border-t-2 border-pen-red/20">
            <h3 className="font-hand mb-2 font-bold text-pen-red">Danger Zone</h3>
            <Button
              variant="secondary"
              className="!border-pen-red !text-pen-red hover:!bg-pen-red hover:!text-white"
              onClick={async () => {
                if (await confirm(`Permanently delete workspace "${workspace.name}" and ALL its projects and tasks? This cannot be undone.`)) {
                  await api.delete(`/workspaces/${workspace.id}`);
                  onSaved();
                  onClose();
                }
              }}
            >
              <Trash2 size={16} /> Delete Workspace
            </Button>
          </section>
        )}
      </div>
    </Modal>
  );
}
