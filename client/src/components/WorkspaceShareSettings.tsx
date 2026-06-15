import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Trash2, UserPlus } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { Member, Role, Workspace } from "../lib/types";
import { Avatar, Badge, Button, Divider, Dropdown, Input, Modal, useConfirm } from "./ui";

interface WorkspaceShareSettingsProps {
  workspace: Workspace;
  onClose: () => void;
  onSaved: () => void;
}

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

export function WorkspaceShareSettings({ workspace, onClose, onSaved }: WorkspaceShareSettingsProps) {
  const confirm = useConfirm();
  const [members, setMembers] = useState<Member[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("write");
  const [error, setError] = useState("");

  const [googleStatus, setGoogleStatus] = useState<{ connected: boolean; hasSheets: boolean } | null>(null);
  const [workspaceLinks, setWorkspaceLinks] = useState<any[]>([]);
  const [linking, setLinking] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [layoutMode, setLayoutMode] = useState<"single" | "stacked">("single");

  const isAdmin = workspace.role === "admin";

  const load = useCallback(() => {
    api.get<Member[]>(`/workspaces/${workspace.id}/members`).then(setMembers);
    api.get<any[]>(`/projects`).then((all) => {
      const filtered = all.filter((p) => p.workspace_id === workspace.id);
      setProjects(filtered);
      setSelectedProjectIds(filtered.map((p) => p.id));
    });
    api.get<any>(`/auth/google/status`).then(setGoogleStatus);
    api.get<any[]>(`/workspaces/${workspace.id}/sheet-links`).then(setWorkspaceLinks);
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

  const linkWorkspace = async () => {
    if (selectedProjectIds.length === 0) {
      showToast("Please select at least one project.", "error");
      return;
    }
    setLinking(true);
    try {
      await api.post(`/workspaces/${workspace.id}/sheet-links`, {
        projectIds: selectedProjectIds,
        layoutMode,
      });
      load();
      showToast("Workspace projects linked to Google Sheets.", "success");
    } catch (e) {
      showToast("Failed to link workspace projects.", "error");
    } finally {
      setLinking(false);
    }
  };

  const unlinkWorkspace = async () => {
    if (await confirm("Unlink all projects in this workspace from their sheets?")) {
      try {
        await api.delete(`/workspaces/${workspace.id}/sheet-links`);
        load();
        showToast("Workspace projects unlinked.", "success");
      } catch (e) {
        showToast("Failed to unlink workspace projects.", "error");
      }
    }
  };

  const connectGoogle = () => {
    window.location.href = "/api/auth/google/login";
  };

  const toggleProject = (id: string) => {
    setSelectedProjectIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const sheetUrl = workspaceLinks[0]?.spreadsheet_url;

  return (
    <Modal open onClose={onClose} title="Workspace sharing" wide>
      <div className="flex flex-col gap-4">
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
                {m.is_pending ? (
                  <Badge tone="neutral">Pending</Badge>
                ) : m.is_owner ? (
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
                        if (await confirm(`Remove ${m.name} from "${workspace.name}"?`)) {
                          if (m.is_pending) await api.delete(`/pending-invitations/${m.id}`);
                          else await api.delete(`/workspaces/${workspace.id}/members/${m.id}`);
                          load();
                        }
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

        <section>
          <h3 className="font-hand mb-2 font-bold">Google Sheets</h3>
          {!googleStatus?.hasSheets ? (
            <div className="rounded-lg border-2 border-dashed border-ink/20 p-4 text-center">
              <p className="mb-2 text-sm text-ink-soft">
                Connect your Google account to enable bidirectional sync with Sheets for this workspace.
              </p>
              <Button size="sm" onClick={connectGoogle}>
                <ExternalLink size={14} className="mr-1.5" />
                {googleStatus?.connected ? "Reconnect Google" : "Connect Google Account"}
              </Button>
            </div>
          ) : workspaceLinks.length > 0 ? (
            <div className="flex flex-col gap-3 rounded-lg border-2 border-pen-blue/20 bg-pen-blue/5 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-ink">Linked Workspace Sheet</p>
                  <p className="text-xs text-ink-soft">
                    {workspaceLinks.length} projects synced ({workspaceLinks[0].layout_mode} layout)
                  </p>
                </div>
                <Badge tone="green">Sync Active</Badge>
              </div>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 truncate rounded border border-ink/20 bg-paper px-2 py-1 font-mono text-xs text-ink-soft">
                  {sheetUrl}
                </div>
                <Button size="sm" variant="secondary" onClick={() => window.open(sheetUrl, "_blank")}>
                  <ExternalLink size={14} /> Open
                </Button>
                <Button size="sm" variant="ghost" onClick={unlinkWorkspace} className="!text-pen-red">
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-lg border-2 border-dashed border-ink/20 p-3">
              <div>
                <p className="text-sm font-bold">Link projects to a new sheet</p>
                <p className="text-xs text-ink-soft">Select projects and layout mode.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => toggleProject(p.id)}
                    className={`rounded-full border-2 px-3 py-1 text-xs font-semibold transition-colors ${
                      selectedProjectIds.includes(p.id)
                        ? "border-pen-blue bg-pen-blue text-paper"
                        : "border-ink/10 bg-paper-dark/20 text-ink-soft hover:border-ink/30"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs font-bold">
                  <input
                    type="radio"
                    checked={layoutMode === "single"}
                    onChange={() => setLayoutMode("single")}
                    className="accent-pen-blue"
                  />
                  Separate Tabs
                </label>
                <label className="flex items-center gap-2 text-xs font-bold">
                  <input
                    type="radio"
                    checked={layoutMode === "stacked"}
                    onChange={() => setLayoutMode("stacked")}
                    className="accent-pen-blue"
                  />
                  Stacked in One Tab
                </label>
              </div>

              <div className="flex justify-end">
                <Button size="sm" variant="secondary" onClick={linkWorkspace} disabled={linking}>
                  {linking ? "Linking..." : "Link workspace sheet"}
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
