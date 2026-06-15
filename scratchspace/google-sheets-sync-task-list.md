# Google Sheets Sync Feature Task List

Legend: `[x]` complete, `[ ]` pending.

## 0. Project Study And Planning

- [x] Study current app architecture: Bun/Express/Postgres backend, Vite/React frontend, hash routing, cookie auth.
- [x] Locate current workspace/project settings, share controls, task creation/editing, and task API paths.
- [x] Check current Google Sheets scratchspace plan.
- [x] Verify current client build passes before starting feature work.
- [x] Draft full implementation plan for share UI, task progress, OAuth, Sheets linking, and bidirectional sync.

## 1. Share UI Refactor

- [x] Move existing public project-share controls out of `ProjectSettings.tsx`.
- [x] Move project-specific members/invites out of `ProjectSettings.tsx`.
- [x] Create `ProjectShareSettings` modal for public links, project members, and project-level Google Sheets linking.
- [x] Create `WorkspaceShareSettings` modal for workspace members/invites and workspace-level Google Sheets linking.
- [x] Add Share buttons next to Settings buttons for workspaces and projects in the sidebar and context menus.
- [x] Wire new share modal state in `App.tsx`.
- [x] Keep normal settings focused on rename, local settings, managers, tags, and danger zone.

## 2. Task Progress Field

- [x] Add `progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100)` to `tasks`.
- [x] Add an idempotent migration for existing Postgres databases.
- [x] Update backend task create, update, board, public board, and mine-task responses.
- [x] Update client `Task` type.
- [x] Add progress slider and numeric percentage input in `QuickAddTask`.
- [x] Add progress slider and numeric percentage input in `TaskEditor`.
- [x] Display progress on task cards/list rows only when progress is greater than 0.
- [x] Clamp and validate progress on client and server.

## 3. Google OAuth And Token Storage

- [x] Extend Google login scopes to include Sheets access.
- [x] Add reconnect flow for users who previously logged in without Sheets scope.
- [x] Store Google OAuth access/refresh token metadata per user.
- [x] Encrypt stored refresh tokens or document deployment secret requirement if encryption is deferred.
- [x] Add backend helper to refresh Google access tokens.
- [x] Add UI state for connected/disconnected Google Sheets access.

## 4. User-Owned Sheet Link Model

- [x] Add `project_sheet_links` table scoped by `user_id`.
- [x] Store project/workspace/link layout metadata: spreadsheet id, URL, sheet id, tab name, layout mode, sync token, sync timestamps.
- [x] Support different users linking the same project to different spreadsheets.
- [x] Add hidden stable `_task_id` column to every generated table.
- [x] Add hidden row hash/version metadata for sync-loop and conflict detection.

## 5. Project-Level Google Sheets Linking

- [x] Add "Link Google Sheet" section to `ProjectShareSettings`.
- [x] Create a user-owned spreadsheet named for the project.
- [x] Create/rename a relevant tab for the project.
- [x] Write headers: hidden task id, task name, description, completion %, assignees, status, due date, priority, tags.
- [x] Add status dropdown from current project columns.
- [x] Add initial project task data to the sheet.
- [x] Store link metadata and show sheet URL only to the linking user.

## 6. Workspace-Level Google Sheets Linking

- [x] Add "Link Google Sheet" section to `WorkspaceShareSettings`.
- [x] Let user select multiple projects.
- [x] Add option for selected projects stacked one after another in one tab.
- [x] Add option for selected projects as separate tabs in one spreadsheet.
- [x] Store one link row per selected project.
- [x] Preserve project table anchors for stacked mode.
- [x] Ensure bidirectional sync works for each selected project.

## 7. App To Sheets Sync

- [x] Add `server/src/sheets.ts` service.
- [x] Queue/debounce outbound sheet sync jobs.
- [x] Sync after task create/update/move/delete.
- [x] Sync after assignee changes.
- [x] Sync after column rename/delete/done-column changes.
- [x] Fan out app changes to every linked sheet for the project.
- [x] Update status dropdown options when project columns change.
- [x] Avoid triggering sheet-to-app loops from app-written changes.

## 8. Sheets To App Sync

- [x] Add secure `POST /api/sheets/webhook` endpoint using per-link sync tokens.
- [x] Generate or provide Apps Script for installable `onEdit` events.
- [x] Process edited sheet rows into task creates/updates/deletes.
- [x] Move tasks when sheet status dropdown changes.
- [x] Resolve assignee names/emails to known users where possible.
- [x] Add polling fallback for missed webhooks or Apps Script limitations.
- [x] Reject invalid sheet edits with recoverable errors or sheet notes.

## 9. Conflict, Permission, And Failure Handling

- [x] Define initial conflict policy as last-writer-wins with timestamps.
- [x] Prevent stale sheet reads from overwriting newer app writes.
- [x] Detect revoked Google access and mark links disconnected.
- [x] Detect deleted/renamed spreadsheets or tabs and show repair/relink state.
- [x] Enforce app permissions for creating links and applying sheet edits.
- [x] Handle invalid statuses, unknown assignees, and malformed percentages.

## 10. Verification And Documentation

- [x] Update README to remove stale `bun:sqlite` references and document Postgres.
- [x] Document Google Cloud setup: OAuth consent, redirect URI, Sheets API, Drive API if needed, Apps Script setup.
- [x] Add focused backend tests or scripts for progress and sheet-link behavior.
- [x] Run `bun run build`.
- [x] Manually verify share modal workflow and progress UI.
- [x] Explain final user workflow for linking project/workspace sheets and editing both ways.

