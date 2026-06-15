import { useCallback, useEffect, useState } from "react";
import { Copy, ExternalLink, Link2, Trash2, UserPlus } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { Project, ProjectMember, Role } from "../lib/types";
import { Avatar, Badge, Button, Divider, Dropdown, Input, Modal, Toggle, showToast, useConfirm } from "./ui";

interface ProjectShareSettingsProps {
  project: Project;
  role: Role;
  onClose: () => void;
  onSaved: () => void;
}

const roleOptions: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "write", label: "Write" },
  { value: "checker", label: "Checker" },
  { value: "read", label: "Read" },
];

export function ProjectShareSettings({ project, role, onClose, onSaved }: ProjectShareSettingsProps) {
  const confirm = useConfirm();
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [shareEnabled, setShareEnabled] = useState(!!project.share_role);
  const [shareRole, setShareRole] = useState<Role>(project.share_role || "read");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("read");
  const [inviteError, setInviteError] = useState("");
  const [saving, setSaving] = useState(false);

  const [googleStatus, setGoogleStatus] = useState<{ connected: boolean; hasSheets: boolean } | null>(null);
  const [sheetLink, setSheetLink] = useState<any>(null);
  const [linking, setLinking] = useState(false);

  const isAdmin = role === "admin";
  const shareUrl = `${window.location.origin}/#/public/${project.share_id}`;

  const load = useCallback(() => {
    api.get<ProjectMember[]>(`/projects/${project.id}/members`).then(setProjectMembers);
    api.get<any>(`/auth/google/status`).then(setGoogleStatus);
    api.get<any>(`/projects/${project.id}/sheet-link`).then(setSheetLink);
  }, [project.id]);

  useEffect(load, [load]);

  const saveSharing = async () => {
    setSaving(true);
    try {
      await api.patch(`/projects/${project.id}/share`, { enabled: shareEnabled, role: shareRole });
      onSaved();
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

  const removeProjectMember = async (memberId: string, name: string, isPending: boolean) => {
    if (await confirm(`Remove ${name} from this project?`)) {
      if (isPending) await api.delete(`/pending-invitations/${memberId}`);
      else await api.delete(`/projects/${project.id}/members/${memberId}`);
      load();
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    showToast("Public link copied to clipboard.", "success");
  };

  const linkSheet = async () => {
    setLinking(true);
    try {
      const link = await api.post(`/projects/${project.id}/sheet-link`, {});
      setSheetLink(link);
      showToast("Google Sheet linked successfully.", "success");
    } catch (e) {
      showToast("Failed to link Google Sheet.", "error");
    } finally {
      setLinking(false);
    }
  };

  const unlinkSheet = async () => {
    if (await confirm("Unlink this Google Sheet? Bidirectional sync will stop.")) {
      try {
        await api.delete(`/projects/${project.id}/sheet-link`);
        setSheetLink(null);
        showToast("Google Sheet unlinked.", "success");
      } catch (e) {
        showToast("Failed to unlink Google Sheet.", "error");
      }
    }
  };

  const connectGoogle = () => {
    window.location.href = "/api/auth/google/login";
  };

  const [showScript, setShowScript] = useState(false);
  const appsScript = `
function onEdit(e) {
  var sheet = e.source.getActiveSheet();
  var range = e.range;
  var row = range.getRow();
  
  if (row <= 1) return; // Ignore headers
  
  var spreadsheetId = e.source.getId();
  var sheetId = sheet.getSheetId();
  
  var payload = {
    spreadsheetId: spreadsheetId,
    sheetId: sheetId,
    range: range.getA1Notation(),
    value: e.value,
    row: row
  };
  
  var url = "${window.location.origin}/api/sheets/webhook/${sheetLink?.sync_token}";
  
  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  UrlFetchApp.fetch(url, options);
}
  `.trim();

  return (
    <Modal open onClose={onClose} title="Project sharing" wide>
      <div className="flex flex-col gap-4">
        <section>
          <h3 className="font-hand mb-2 font-bold">Public Link</h3>
          <div className="mb-3 flex items-center justify-between rounded-lg border-2 border-ink/10 bg-paper-dark/30 p-3">
            <div className="flex flex-col">
              <span className="text-sm font-bold text-ink">Public access</span>
              <span className="text-xs text-ink-soft">Anyone with the link can open this project.</span>
            </div>
            <Toggle checked={shareEnabled} disabled={!isAdmin} onChange={setShareEnabled} />
          </div>

          {shareEnabled && (
            <div className="flex flex-col gap-2 rounded-lg border-2 border-pen-blue/20 bg-pen-blue/5 p-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase text-ink-soft">Public permissions</span>
                <Dropdown
                  value={shareRole}
                  options={roleOptions.filter((o) => o.value !== "admin")}
                  onChange={setShareRole}
                  disabled={!isAdmin}
                  className="w-28 text-xs"
                />
              </div>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 truncate rounded border border-ink/20 bg-paper px-2 py-1 font-mono text-xs text-ink-soft">
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

          {isAdmin && (
            <div className="mt-3 flex justify-end">
              <Button size="sm" onClick={saveSharing} disabled={saving}>
                {saving ? "Saving..." : "Save public link"}
              </Button>
            </div>
          )}
        </section>

        <Divider />

        <section>
          <h3 className="font-hand mb-2 font-bold">Project Members</h3>
          <p className="mb-3 text-xs text-ink-soft">
            Share this project with people even if they are not in the workspace.
          </p>

          <ul className="mb-3 flex flex-col gap-1.5">
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
                      options={roleOptions.filter((o) => o.value !== "admin")}
                      onChange={async (newRole) => {
                        await api.patch(`/projects/${project.id}/members/${m.id}`, { role: newRole });
                        load();
                      }}
                      className="w-24 text-xs"
                    />
                    <button
                      aria-label={`Remove ${m.name}`}
                      onClick={() => removeProjectMember(m.id, m.name, m.is_pending)}
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
                options={roleOptions.filter((o) => o.value !== "admin")}
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
          <h3 className="font-hand mb-2 font-bold">Google Sheets</h3>
          {!googleStatus?.hasSheets ? (
            <div className="rounded-lg border-2 border-dashed border-ink/20 p-4 text-center">
              <p className="mb-2 text-sm text-ink-soft">
                {googleStatus?.connected
                  ? "Your Google account is connected but needs additional permissions for Sheets."
                  : "Connect your Google account to enable bidirectional sync with Sheets."}
              </p>
              <Button size="sm" onClick={connectGoogle}>
                <ExternalLink size={14} className="mr-1.5" />
                {googleStatus?.connected ? "Reconnect Google" : "Connect Google Account"}
              </Button>
            </div>
          ) : sheetLink ? (
            <div className="flex flex-col gap-3 rounded-lg border-2 border-pen-blue/20 bg-pen-blue/5 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-ink">Linked Spreadsheet</p>
                  <p className="text-xs text-ink-soft">Tab: {sheetLink.tab_name}</p>
                </div>
                <Badge tone="green">Sync Active</Badge>
              </div>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 truncate rounded border border-ink/20 bg-paper px-2 py-1 font-mono text-xs text-ink-soft">
                  {sheetLink.spreadsheet_url}
                </div>
                <Button size="sm" variant="secondary" onClick={() => window.open(sheetLink.spreadsheet_url, "_blank")}>
                  <ExternalLink size={14} /> Open
                </Button>
                <Button size="sm" variant="ghost" onClick={unlinkSheet} className="!text-pen-red">
                  <Trash2 size={14} />
                </Button>
              </div>

              <div className="mt-2">
                <button
                  onClick={() => setShowScript(!showScript)}
                  className="text-[10px] font-bold uppercase tracking-wider text-ink-soft hover:text-ink"
                >
                  {showScript ? "Hide" : "Show"} Bidirectional Sync Setup (Optional)
                </button>
                {showScript && (
                  <div className="mt-2 flex flex-col gap-2">
                    <p className="text-[10px] text-ink-soft">
                      To enable sync from Sheet to App: Open Extensions &gt; Apps Script, paste this code, and Save.
                      Then add an "On edit" trigger.
                    </p>
                    <pre className="max-h-32 overflow-auto rounded bg-ink/5 p-2 font-mono text-[10px] text-ink">
                      {appsScript}
                    </pre>
                    <Button size="xs" variant="secondary" onClick={() => {
                      navigator.clipboard.writeText(appsScript);
                      showToast("Apps Script copied.", "success");
                    }}>
                      Copy Script
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg border-2 border-dashed border-ink/20 p-3">
              <div>
                <p className="text-sm font-bold">No sheet linked yet</p>
                <p className="text-xs text-ink-soft">Create a new spreadsheet for this project.</p>
              </div>
              <Button size="sm" variant="secondary" onClick={linkSheet} disabled={linking}>
                {linking ? "Linking..." : "Link sheet"}
              </Button>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
