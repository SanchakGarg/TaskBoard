import { useCallback, useEffect, useState } from "react";
import { Copy, ExternalLink, Link2, Trash2, UserPlus, Globe, Users, FileSpreadsheet } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { Project, ProjectMember, Role } from "../lib/types";
import { Avatar, Badge, Button, Dropdown, Input, Modal, Toggle, showToast, useConfirm, Card } from "./ui";

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

  const [googleStatus, setGoogleStatus] = useState<{ connected: boolean; hasSheets: boolean; appUrl?: string; sheetsSyncEnabled?: boolean } | null>(null);
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
      showToast("Google Sheet created and linked.", "success");
    } catch (e) {
      showToast("Failed to link Google Sheet.", "error");
    } finally {
      setLinking(false);
    }
  };

  const unlinkSheet = async () => {
    const msg = "Are you sure? This will UNLINK the sheet and PERMANENTLY DELETE the spreadsheet file from your Google Drive. This action cannot be undone.";
    if (await confirm(msg)) {
      try {
        await api.delete(`/projects/${project.id}/sheet-link`);
        setSheetLink(null);
        showToast("Google Sheet unlinked and file deleted.", "success");
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
  
  var url = "${googleStatus?.appUrl || window.location.origin}/api/sheets/webhook/${sheetLink?.sync_token}";
  
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
      <div className="flex flex-col gap-6">
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Globe size={18} className="text-ink-soft" />
            <h3 className="font-hand text-lg font-bold">Public Access</h3>
          </div>
          <Card className="!p-0 overflow-hidden">
            <div className="flex items-center justify-between p-4 bg-paper-dark/5">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-ink">Public link sharing</span>
                <span className="text-xs text-ink-soft italic">Anyone with the link can view/edit based on role.</span>
              </div>
              <Toggle checked={shareEnabled} disabled={!isAdmin} onChange={setShareEnabled} />
            </div>

            {shareEnabled && (
              <div className="p-4 border-t border-ink/10 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">Visitor Role</span>
                  <Dropdown
                    value={shareRole}
                    options={roleOptions.filter((o) => o.value !== "admin")}
                    onChange={setShareRole}
                    disabled={!isAdmin}
                    className="w-32 text-xs"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1 truncate rounded-lg border-2 border-ink/10 bg-paper px-3 py-2 font-mono text-xs text-ink-soft">
                    {shareUrl}
                  </div>
                  <Button size="sm" variant="secondary" onClick={copyLink}>
                    <Copy size={14} className="mr-1.5" /> Copy
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => window.open(shareUrl, "_blank")}>
                    <Link2 size={14} />
                  </Button>
                </div>
              </div>
            )}

            {isAdmin && (
              <div className="p-3 bg-paper-dark/5 border-t border-ink/10 flex justify-end">
                <Button size="sm" onClick={saveSharing} disabled={saving}>
                  {saving ? "Saving..." : "Save sharing settings"}
                </Button>
              </div>
            )}
          </Card>
        </section>

        <section>
          <div className="mb-3 flex items-center gap-2">
            <Users size={18} className="text-ink-soft" />
            <h3 className="font-hand text-lg font-bold">Project Members</h3>
          </div>
          <Card className="!p-3">
            <ul className="flex flex-col gap-2">
              {projectMembers.map((m) => (
                <li key={m.id} className="flex items-center gap-2">
                  <Avatar name={m.name} src={m.avatar_url || undefined} size={28} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-bold">{m.name}</span>
                    <span className="truncate text-xs text-ink-soft">{m.email}</span>
                  </div>
                  {m.is_owner ? (
                    <Badge tone="green">Owner</Badge>
                  ) : isAdmin ? (
                    <div className="flex items-center gap-1">
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
                  addProjectMember();
                }}
                className="mt-4 border-t border-ink/10 pt-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="email"
                    placeholder="Invite to project..."
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="!w-44 !py-1.5 text-xs"
                  />
                  <Dropdown
                    value={inviteRole}
                    options={roleOptions.filter((o) => o.value !== "admin")}
                    onChange={setInviteRole}
                    className="w-24 text-xs"
                  />
                  <Button type="submit" size="sm" disabled={!inviteEmail.trim()}>
                    <UserPlus size={14} className="mr-1.5" /> Invite
                  </Button>
                </div>
                {inviteError && <p className="mt-1 text-xs text-pen-red">{inviteError}</p>}
              </form>
            )}
          </Card>
        </section>

        {(googleStatus?.sheetsSyncEnabled !== false) && (
          <section>
            <div className="mb-3 flex items-center gap-2">
              <FileSpreadsheet size={18} className="text-ink-soft" />
              <h3 className="font-hand text-lg font-bold">Google Sheets Sync</h3>
            </div>
            {!googleStatus?.hasSheets ? (
              <Card className="flex flex-col items-center border-dashed border-ink/30 bg-paper-dark/10 p-6 text-center">
                <p className="mb-4 text-sm text-ink-soft">
                  Connect your Google account to enable bidirectional sync with Sheets.
                </p>
                <Button size="sm" onClick={connectGoogle}>
                  <ExternalLink size={14} className="mr-1.5" />
                  {googleStatus?.connected ? "Reconnect Google" : "Connect Google Account"}
                </Button>
              </Card>
            ) : sheetLink ? (
              <Card className="border-pen-blue/40 bg-pen-blue/5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-bold text-ink">Linked Spreadsheet</p>
                    <p className="text-xs text-ink-soft italic">Tab: {sheetLink.tab_name}</p>
                  </div>
                  <Badge tone="green">Sync Active</Badge>
                </div>
                
                <div className="flex flex-col gap-3">
                  <div className="min-w-0 flex-1 truncate rounded-lg border-2 border-ink/10 bg-paper px-3 py-2 font-mono text-xs text-ink-soft">
                    {sheetLink.spreadsheet_url}
                  </div>
                  <div className="flex gap-2">
                    <Button className="flex-1" size="sm" variant="secondary" onClick={() => window.open(sheetLink.spreadsheet_url, "_blank")}>
                      <ExternalLink size={14} className="mr-1.5" /> Open Sheet
                    </Button>
                    <Button size="sm" variant="ghost" onClick={unlinkSheet} className="!text-pen-red">
                      <Trash2 size={14} className="mr-1.5" /> Unlink & Delete
                    </Button>
                  </div>
                </div>

                <div className="mt-4 border-t border-ink/10 pt-3">
                  <button
                    onClick={() => setShowScript(!showScript)}
                    className="text-[10px] font-bold uppercase tracking-wider text-ink-soft hover:text-ink flex items-center gap-1"
                  >
                    {showScript ? "▼" : "▶"} Bidirectional Sync Setup (Optional)
                  </button>
                  {showScript && (
                    <div className="mt-2 flex flex-col gap-2">
                      <p className="text-[10px] text-ink-soft leading-relaxed italic">
                        To enable sync from Sheet back to this App: Open your spreadsheet, go to **Extensions &gt; Apps Script**, paste the code below, and **Save**. Then click the clock icon (Triggers) and add a new trigger for the `onEdit` function with event type "On edit".
                      </p>
                      <pre className="max-h-40 overflow-auto rounded-lg border-2 border-ink/5 bg-ink/5 p-3 font-mono text-[10px] text-ink leading-normal">
                        {appsScript}
                      </pre>
                      <Button size="xs" variant="secondary" className="self-end" onClick={() => {
                        navigator.clipboard.writeText(appsScript);
                        showToast("Apps Script copied to clipboard.", "success");
                      }}>
                        <Copy size={12} className="mr-1.5" /> Copy Script
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            ) : (
              <Card className="flex items-center justify-between border-dashed border-ink/30 bg-paper-dark/5 p-4">
                <div className="flex flex-col">
                  <p className="text-sm font-bold">No sheet linked yet</p>
                  <p className="text-xs text-ink-soft italic">Create a new spreadsheet for this project.</p>
                </div>
                <Button size="sm" variant="secondary" onClick={linkSheet} disabled={linking}>
                  {linking ? "Linking..." : "Link sheet"}
                </Button>
              </Card>
            )}
          </section>
        )}
      </div>
    </Modal>
  );
}
