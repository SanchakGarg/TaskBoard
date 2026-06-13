# Taskboard

A self-hosted, notebook-styled task management app. Kanban boards, a widget
dashboard, OIDC login, and local email/password accounts - built deliberately
lean.

**Runtime dependencies: 6.** `express`, `helmet`, `express-rate-limit`,
`openid-client`, `jsonwebtoken`, `pg`. The database is PostgreSQL, the
frontend is React + Tailwind (build-time only) with hand-written components,
CSS-only animations, and native HTML5 drag and drop. No ORM, no Radix, no
chart or animation libraries.

## Stack

| Layer     | Choice                                   |
| --------- | ---------------------------------------- |
| Runtime   | Bun                                       |
| Backend   | Express + PostgreSQL (`pg`)               |
| Auth      | OIDC, guest login, local accounts          |
| Frontend  | Vite + React + TypeScript + TailwindCSS   |
| Deploy    | Docker (multi-stage, non-root) or bare Bun |

## Configuration

Copy `.env.example` to `.env` and fill it in:

```sh
cp .env.example .env
```

- `JWT_SECRET` - required in production. Any long random string.
- `APP_URL` - the public URL users reach the app at (used to build OAuth
  redirect URIs). Behind a reverse proxy this is your HTTPS URL.
- `DATABASE_URL` - PostgreSQL connection string, for example
  `postgres://taskboard:taskboard@localhost:5432/taskboard`.
- Enable any combination of login providers:
  - `AUTH_GOOGLE_ENABLED=true` + `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
    Redirect URI to register: `{APP_URL}/api/auth/google/callback`
  - `AUTH_ZITADEL_ENABLED=true` + `ZITADEL_ISSUER` / `ZITADEL_CLIENT_ID` /
    `ZITADEL_CLIENT_SECRET`.
    Redirect URI to register: `{APP_URL}/api/auth/zitadel/callback`
  - `AUTH_GUEST_ENABLED=true` - single shared Guest account, no identity
    provider. For demos and trusted LANs only.
  - `AUTH_LOCAL_ENABLED=true` - email/password accounts managed by Taskboard.

The login page automatically shows a button per enabled OAuth provider and a
separate local account form when local auth is enabled.

## Run with Docker

```sh
docker compose up -d --build
```

Postgres data lives in the `pgdata` volume. The app container runs as a
non-root user and exposes port 3000 - put nginx/Caddy in front for TLS.

## Run without Docker

Requires [Bun](https://bun.sh) >= 1.2.

```sh
bun install --cwd client && bun install --cwd server
bun run build        # builds the frontend into client/dist
bun run start        # serves app + API on :3000
```

You also need a reachable PostgreSQL instance configured via `DATABASE_URL`.

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
  db.ts         Postgres schema + helpers
  auth.ts       OIDC (PKCE), guest login, local accounts, JWT cookies
  api.ts        REST: projects, columns, tasks, milestones, notes,
                activity, focus, widget layout

client/src/
  components/ui/        hand-written primitives (Button, Modal, Dropdown...)
  components/board/     KanbanBoard, TaskCard, TaskModal (native DnD)
  components/widgets/   dashboard framework + 12 lazy-loaded widgets
  hooks/                useMagnetic, useBoardDrag, useAuth
  illustrations/        hand-drawn SVG components
  lib/                  fetch wrapper, shared types
  index.css             theme tokens, graph paper, the 5 animation types
```
