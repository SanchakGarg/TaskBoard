# Implementation Plan - Master Dashboard (Google Sheets Integration)

This plan covers implementing the "Master Dashboard" feature, where multiple projects can be synced to a single Google Sheet (one tab per project).

## 1. Database Schema Changes
- **`server/src/db.ts`**:
    - Add `project_sheet_links` table:
        - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
        - `workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE`
        - `google_sheet_id TEXT NOT NULL`
        - `project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE`
        - `tab_name TEXT NOT NULL`
        - `sync_token TEXT NOT NULL DEFAULT gen_random_uuid()`

## 2. Workspace Settings UI
- **Multi-Project Picker**: Add a "Create Master Sheet" section in `WorkspaceSettings.tsx` to select multiple projects.
- **Initialization Trigger**: Add a button to initialize the sheet and create the tab mapping in the database.

## 3. Backend Logic (Service Layer)
- **Sheet Initialization**: 
    - Use Google Drive API `files.copy` to clone the Master Template.
    - Use `batchUpdate` to add/rename tabs for each selected project.
    - Store the `google_sheet_id` and `tab_name` mappings in `project_sheet_links`.
- **Sync Webhook**: Create `POST /api/sheets/sync` that:
    - Receives `google_sheet_id`, `tab_name`, `task_data`, and `sync_token`.
    - Validates the `sync_token`.
    - Looks up `project_id` using the `google_sheet_id` and `tab_name`.
    - Updates tasks accordingly.

## 4. Google Apps Script (Dynamic)
- Write a generic `onEdit` script that:
    - Identifies the current sheet ID and active tab name.
    - Sends a JSON payload to the Taskboard API Webhook with the `sync_token`.

## 5. Critical Design Decisions
- **Tab-Name Identifier**: Tab names must be treated as unique identifiers for projects. The UI will explicitly warn users: *"Please do not rename these tabs, or sync will break."*
- **Auth**: The `sync_token` embedded in the Apps Script will authorize requests from the sheet to the Taskboard backend.
- **Conflict Resolution**: "Last-Write-Wins" policy based on `updated_at` timestamps (Taskboard API will reject updates older than existing task data).

---

### Postgres Reset Instructions
This plan requires a database schema change.
1. `docker-compose down -v`
2. `docker-compose up -d`
