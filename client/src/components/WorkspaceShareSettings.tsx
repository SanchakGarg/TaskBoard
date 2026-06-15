import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Trash2, UserPlus, FileSpreadsheet, Settings2 } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { Member, Role, Workspace } from "../lib/types";
import { Avatar, Badge, Button, Dropdown, Input, Modal, showToast, useConfirm, Card, Checkbox } from "./ui";

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
  admin: "Full control over workspace and projects",
  write: "Read + create, edit and complete tasks",
  checker: "Read + mark tasks complete only",
  read: "View tasks only",
};

export function WorkspaceShareSettings({ workspace, onClose }: WorkspaceShareSettingsProps) {

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
    const msg = "Are you sure? This will UNLINK all projects and PERMANENTLY DELETE the spreadsheet file from your Google Drive. This action cannot be undone.";
    if (await confirm(msg)) {
      try {
        await api.delete(`/workspaces/${workspace.id}/sheet-links`);
        load();
        showToast("Workspace projects unlinked and files deleted.", "success");
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
      <div className="flex flex-col gap-6">
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Settings2 size={18} className="text-ink-soft" />
            <h3 className="font-hand text-lg font-bold">Workspace Members</h3>
          </div>
          <Card className="!p-3">
            <ul className="flex flex-col gap-2">
              {members.map((m) => (
                <li key={m.id} className="flex items-center gap-2">
                  <Avatar name={m.name} src={m.avatar_url || undefined} size={28} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-bold">{m.name}</span>
                    <span className="truncate text-xs text-ink-soft">{m.email}</span>
                  </div>
                  {m.is_pending ? (
                    <Badge tone="neutral">Pending</Badge>
                  ) : m.is_owner ? (
                    <Badge tone="green">Owner</Badge>
                  ) : isAdmin ? (
                    <div className="flex items-center gap-1">
                      <Dropdown
                        value={m.role}
                        options={roleOptions}
                        onChange={(r) =>
                          api
                            .patch(`/workspaces/${workspace.id}/members/${m.id}`, { role: r })
                            .then(load)
                        }
                        className="w-28 text-xs"
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
                    </div>
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
                className="mt-4 border-t border-ink/10 pt-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="email"
                    placeholder="Invite by email..."
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="!w-64 !py-1.5 text-sm"
                  />
                  <Dropdown value={role} options={roleOptions} onChange={setRole} className="w-28 text-sm" />
                  <Button type="submit" size="sm" disabled={!email.trim()}>
                    <UserPlus size={14} className="mr-1.5" /> Invite
                  </Button>
                </div>
                <p className="mt-2 text-[10px] text-ink-soft italic">{roleHelp[role]}</p>
                {error && <p className="mt-1 text-xs text-pen-red">{error}</p>}
              </form>
            )}
          </Card>
        </section>

        <section>
          <div className="mb-3 flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-ink-soft" />
            <h3 className="font-hand text-lg font-bold">Google Sheets Sync</h3>
          </div>

          {!googleStatus?.hasSheets ? (
            <Card className="flex flex-col items-center border-dashed border-ink/30 bg-paper-dark/10 p-6 text-center">
              <p className="mb-4 text-sm text-ink-soft">
                Connect your Google account to enable bidirectional sync with Sheets for this workspace.
              </p>
              <Button size="sm" onClick={connectGoogle}>
                <ExternalLink size={14} className="mr-1.5" />
                {googleStatus?.connected ? "Reconnect Google" : "Connect Google Account"}
              </Button>
            </Card>
          ) : workspaceLinks.length > 0 ? (
            <Card className="border-pen-blue/40 bg-pen-blue/5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-bold text-ink">Linked Workspace Sheet</p>
                  <p className="text-xs text-ink-soft">
                    {workspaceLinks.length} projects synced ({workspaceLinks[0].layout_mode} layout)
                  </p>
                </div>
                <Badge tone="green">Sync Active</Badge>
              </div>
              <div className="flex flex-col gap-3">
                <div className="min-w-0 flex-1 truncate rounded border-2 border-ink/10 bg-paper px-3 py-2 font-mono text-xs text-ink-soft">
                  {sheetUrl}
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1" size="sm" variant="secondary" onClick={() => window.open(sheetUrl, "_blank")}>
                    <ExternalLink size={14} className="mr-1.5" /> Open Spreadsheet
                  </Button>
                  <Button size="sm" variant="ghost" onClick={unlinkWorkspace} className="!text-pen-red">
                    <Trash2 size={14} className="mr-1.5" /> Unlink & Delete File
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="flex flex-col gap-4">
              <div>
                <p className="text-sm font-bold">Link projects to a new sheet</p>
                <p className="text-xs text-ink-soft">Select the projects you want to include in the spreadsheet.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-1">
                {projects.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 p-2 rounded-lg border-2 border-ink/5 bg-paper-dark/10 cursor-pointer hover:border-pen-blue/30 transition-colors">
                    <Checkbox
                      checked={selectedProjectIds.includes(p.id)}
                      onChange={() => toggleProject(p.id)}
                    />
                    <span className="text-sm truncate">{p.name}</span>
                  </label>
                ))}
              </div>

              <div className="flex flex-col gap-3 border-t border-ink/10 pt-4">
                <p className="text-xs font-bold text-ink-soft uppercase tracking-wider">Layout Mode</p>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 text-sm cursor-pointer group">
                    <input
                      type="radio"
                      name="layout"
                      checked={layoutMode === "single"}
                      onChange={() => setLayoutMode("single")}
                      className="accent-pen-blue w-4 h-4"
                    />
                    <div className="flex flex-col">
                      <span className="font-bold">Separate Tabs</span>
                      <span className="text-[10px] text-ink-soft">Each project gets its own tab</span>
                    </div>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer group">
                    <input
                      type="radio"
                      name="layout"
                      checked={layoutMode === "stacked"}
                      onChange={() => setLayoutMode("stacked")}
                      className="accent-pen-blue w-4 h-4"
                    />
                    <div className="flex flex-col">
                      <span className="font-bold">Stacked</span>
                      <span className="text-[10px] text-ink-soft">All projects in one single list</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button size="sm" variant="secondary" onClick={linkWorkspace} disabled={linking}>
                  {linking ? "Linking..." : "Create Spreadsheet"}
                </Button>
              </div>
            </Card>
          )}
        </section>
      </div>
    </Modal>
  );
}
