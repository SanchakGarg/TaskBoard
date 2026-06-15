# Taskboard

A self-hosted, notebook-styled task management app. Kanban boards, a widget
dashboard, and OIDC login — built deliberately lean.

**Runtime dependencies: 6.** `express`, `helmet`, `express-rate-limit`,
`openid-client`, `jsonwebtoken`, `googleapis`. The database is **PostgreSQL**,
the frontend is React + Tailwind (build-time only) with hand-written
components, CSS-only animations, and native HTML5 drag & drop. No ORM, no
Radix, no chart or animation libraries.

## Stack

| Layer     | Choice                                              |
| --------- | --------------------------------------------------- |
| Runtime   | Bun                                                  |
| Backend   | Express + PostgreSQL                                 |
| Auth      | OIDC (Google and/or Zitadel) and/or guest login      |
| Frontend  | Vite + React + TypeScript + TailwindCSS + lucide     |
| Sync      | Bidirectional Google Sheets Sync                    |

## Configuration

Copy `.env.example` to `.env` for local development. Use
`.env.render.example` as the template for Render.

```sh
cp .env.example .env
```

- `JWT_SECRET` — required in production. Any long random string.
- `DATABASE_URL` — PostgreSQL connection string (e.g. `postgres://user:pass@host:5432/db`).
- `ENCRYPTION_KEY` — 32-character string used to encrypt Google refresh tokens.
- `APP_URL` — the public URL users reach the app at (used to build OAuth
  redirect URIs). Behind a reverse proxy this is your HTTPS URL.
- Enable any combination of login providers:
  - `AUTH_GOOGLE_ENABLED=true` + `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
    Redirect URI to register: `{APP_URL}/api/auth/google/callback`
    *Note: For Google Sheets sync, ensure you add `https://www.googleapis.com/auth/spreadsheets` and `https://www.googleapis.com/auth/drive.file` scopes in your Google Cloud Console.*
  - `AUTH_ZITADEL_ENABLED=true` + `ZITADEL_ISSUER` / `ZITADEL_CLIENT_ID` /
    `ZITADEL_CLIENT_SECRET`.
    Redirect URI to register: `{APP_URL}/api/auth/zitadel/callback`
  - `AUTH_GUEST_ENABLED=true` — single shared Guest account, no identity
    provider. For demos and trusted LANs only.

## Google Sheets Synchronization

Taskboard supports bidirectional sync with Google Sheets.

1. **Enable Sheets:** Ensure `AUTH_GOOGLE_ENABLED` is true and your Google App has the required scopes.
2. **Link a Project:** Open Project Share settings and click "Link Sheet". A new spreadsheet will be created.
3. **App-to-Sheet:** Any change in Taskboard (rename, status, progress, priority) is synced to the sheet within 2 seconds.
4. **Sheet-to-App:** 
   - Open the linked spreadsheet.
   - Go to `Extensions > Apps Script`.
   - Copy the "Bidirectional Sync Script" from Taskboard's Share modal and paste it.
   - Save the script and add an **"On edit" trigger** in the Apps Script console.
   - Edits in the sheet (except headers) will now instantly update Taskboard.
   - You can even create new tasks by adding rows at the bottom.

## Run with Docker

```sh
docker compose up -d --build
```

The Docker Compose configuration automatically spins up a fully configured PostgreSQL 16 server alongside the Taskboard app. You don't need to install or configure a database manually.

The Postgres database data is persisted in the `taskboard-pg-data` volume. The Taskboard container runs as a non-root user and exposes port 3000 — put nginx/Caddy in front for TLS.

## Run without Docker

Requires [Bun](https://bun.sh) ≥ 1.2.

```sh
bun install --cwd client && bun install --cwd server
bun run build        # builds the frontend into client/dist
bun run start        # serves app + API on :3000
```

### Development

```sh
bun run dev:server   # API on :3000 (watch mode)
bun run dev:client   # Vite dev server on :5173, proxies /api to :3000
```

## Architecture

```
server/src/
  index.ts      Express app: helmet, rate limits, static serving
  config.ts     env parsing
  db.ts         bun:sqlite schema + helpers
  auth.ts       OIDC (PKCE) + guest login, JWT session cookies
  api.ts        REST: projects, columns, tasks, milestones, notes,
                activity, focus, widget layout

client/src/
  components/ui/        hand-written primitives (Button, Modal, Dropdown…)
  components/board/     KanbanBoard, TaskCard, TaskModal (native DnD)
  components/widgets/   dashboard framework + 12 lazy-loaded widgets
  hooks/                useMagnetic, useBoardDrag, useAuth
  illustrations/        hand-drawn SVG components
  lib/                  fetch wrapper, shared types
  index.css             theme tokens, graph paper, the 5 animation types
```
