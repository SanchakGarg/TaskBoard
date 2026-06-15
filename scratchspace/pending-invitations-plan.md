# Implementation Plan - Pending Invitations System

This plan covers implementing an invitation system for users not yet registered in the system.

## 1. Database Schema Changes
- **`server/src/db.ts`**:
    - Add a new table `pending_invitations` to store invitations by email.
    - Columns: `email TEXT PRIMARY KEY`, `target_id UUID` (workspace_id or project_id), `target_type TEXT` ('workspace' or 'project'), `role TEXT`, `invited_by UUID`.

## 2. Invitation API Updates
- **`server/src/api.ts`**:
    - Update `POST /workspaces/:id/members` and `POST /projects/:id/members`:
        - If the user with the provided email is not found, insert an entry into `pending_invitations`.
        - Send the invitation email with a link to the registration/login page.

## 3. User Registration/Login Flow
- **`server/src/auth.ts`**:
    - Update `upsertUser` or the user creation flow:
        - After a user registers or logs in, check `pending_invitations` for their email.
        - If found, insert them into the corresponding `workspace_members` or `project_members` table based on the stored invitation.
        - Remove the entry from `pending_invitations`.

## 4. Verification & Testing
- Invite an unregistered email to a workspace.
- Invite an unregistered email to a project.
- Register/Login with that email address.
- Verify that the user is automatically added to the workspace/project.

---

### Postgres Reset Instructions (Required)
This plan requires a database schema change.
1. `docker-compose down -v`
2. `docker-compose up -d`
