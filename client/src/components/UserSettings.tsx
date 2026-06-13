import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { Avatar, Button, Divider, Input, Modal } from "./ui";

interface UserSettingsProps {
  onClose: () => void;
}

const DEFAULT_THEME = {
  paper: "#faf7ef",
  ink: "#2d2a26",
  "pen-blue": "#2f5d9e",
};

export function UserSettings({ onClose }: UserSettingsProps) {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [themePrefs, setThemePrefs] = useState<Record<string, string>>(
    user?.themePrefs || {}
  );
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const handleColorChange = (key: string, value: string) => {
    setThemePrefs((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const trimmedName = name.trim();
      const updates: { name?: string; themePrefs?: Record<string, string> } = {};
      
      if (trimmedName && trimmedName !== user.name) {
        updates.name = trimmedName;
      }
      
      // We always send themePrefs if the user hits save, so they can update colors independently
      // Clean up empty ones or ones that exactly match defaults? No, let's just save what they chose, 
      // but if they click "Reset to defaults", we clear it.
      updates.themePrefs = themePrefs;

      await updateProfile(updates);
      onClose();
    } catch (e) {
      console.error("Failed to update profile", e);
    } finally {
      setSaving(false);
    }
  };

  const resetTheme = () => {
    setThemePrefs({});
  };

  const hasCustomTheme = Object.keys(themePrefs).length > 0;

  return (
    <Modal open onClose={onClose} title="Profile & Settings" wide>
      <div className="flex flex-col gap-6">
        
        {/* ---------- Profile Section ---------- */}
        <section>
          <h3 className="font-hand mb-3 font-bold">Profile Info</h3>
          <div className="flex items-center gap-4">
            <Avatar name={user.name} src={user.avatarUrl || undefined} size={64} />
            <div className="min-w-0 flex-1 flex flex-col gap-2">
              <div>
                <label className="mb-1 block text-sm text-ink-soft">Display Name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                />
              </div>
              <p className="text-xs text-ink-soft">
                Email ({user.email}) and Avatar are managed by your identity provider.
              </p>
            </div>
          </div>
        </section>

        <Divider />

        {/* ---------- Theme Section ---------- */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-hand font-bold">Custom Theme</h3>
            {hasCustomTheme && (
              <Button size="sm" variant="ghost" onClick={resetTheme}>
                Reset to defaults
              </Button>
            )}
          </div>
          
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm text-ink-soft">Background Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={themePrefs.paper || DEFAULT_THEME.paper}
                  onChange={(e) => handleColorChange("paper", e.target.value)}
                  className="h-8 w-12 cursor-pointer rounded border-2 border-ink/40 bg-transparent"
                  aria-label="Background Color"
                />
                <span className="text-xs font-mono text-ink-soft">
                  {themePrefs.paper || DEFAULT_THEME.paper}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm text-ink-soft">Text Color (Primary)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={themePrefs.ink || DEFAULT_THEME.ink}
                  onChange={(e) => handleColorChange("ink", e.target.value)}
                  className="h-8 w-12 cursor-pointer rounded border-2 border-ink/40 bg-transparent"
                  aria-label="Text Color"
                />
                <span className="text-xs font-mono text-ink-soft">
                  {themePrefs.ink || DEFAULT_THEME.ink}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm text-ink-soft">Accent Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={themePrefs["pen-blue"] || DEFAULT_THEME["pen-blue"]}
                  onChange={(e) => handleColorChange("pen-blue", e.target.value)}
                  className="h-8 w-12 cursor-pointer rounded border-2 border-ink/40 bg-transparent"
                  aria-label="Accent Color"
                />
                <span className="text-xs font-mono text-ink-soft">
                  {themePrefs["pen-blue"] || DEFAULT_THEME["pen-blue"]}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Actions ---------- */}
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </div>

      </div>
    </Modal>
  );
}
