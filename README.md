# NotesTodo

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)
[![Runtime: Bun](https://img.shields.io/badge/Runtime-Bun-f9f1e1.svg)](https://bun.sh)
[![Backend: Elysia](https://img.shields.io/badge/Backend-Elysia-8b5cf6.svg)](https://elysiajs.com)
[![DB: MariaDB 11](https://img.shields.io/badge/DB-MariaDB%2011-003545.svg)](https://mariadb.org)
[![ORM: Drizzle](https://img.shields.io/badge/ORM-Drizzle-c5f74f.svg)](https://orm.drizzle.team)
[![Frontend: React + Vite](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61dafb.svg)](https://vite.dev)
[![UI: Tailwind + shadcn](https://img.shields.io/badge/UI-Tailwind%20%2B%20shadcn-38bdf8.svg)](https://tailwindcss.com)
[![Containers: Podman rootless](https://img.shields.io/badge/Containers-Podman%20rootless-892ca0.svg)](https://podman.io)
[![API: OpenAPI spec--first](https://img.shields.io/badge/API-OpenAPI%20spec--first-6ba539.svg)](https://www.openapis.org)

Self-hosted **notes + todos + calendar** with any↔any item linking, shared
tags, mixed-type templates, per-item sharing (users/groups at view/edit), and
reminders via email (SMTP) and webhook. Bun + Elysia + MariaDB/Drizzle backend,
React + Vite + Tailwind (high-contrast dark) frontend, OpenAPI spec-first.

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [Dev workflow](#dev-workflow)
- [Scripts](#scripts)
- [Remote deployment](#remote-deployment)
- [Production](#production)
- [Settings](#settings)
- [Migrations](#migrations)
- [Testing](#testing)
- [Conventions](#conventions)
- [License](#license)

## Features

- **Notes** — markdown body, pinning (inline pin toggle on cards), full-text
  search over title + body.
- **Todos** — due dates, done toggling, inline rename (double-click a title),
  duplicate-with-edit, save-as-template, **bulk operations** (select several →
  mark done / archive / add tag in one call with a per-item skip report).
- **Calendar** — month/week/list views, RFC 5545 recurrence (RRULE) with
  per-occurrence skip (EXDATE), all-day events, duplicate-with-edit. Invalid
  rules are rejected at save time (422); legacy broken rules surface as a
  clickable warning banner instead of silently disappearing.
- **Command palette** — `⌘K`/`Ctrl+K` searches notes, todos and events from
  anywhere and offers navigation + "New …" commands; press `n` on any list
  page for a new item.
- **Templates** — one template holds any mix of notes, todos and events.
  Instantiation picks a base date; due/start dates are relative offsets
  (events also carry time-of-day + duration). Template-level tags are added to
  every created item; template-level category/priority *override* item-level.
  All items created together are linked to each other (`linkType: "template"`).
- **Linking** — any item can link to any other; items with links show a 🔗 icon
  in every list view. Edit dialogs embed **link chips** with lazy hover
  previews and an inline link-by-search field ("Create & add details" on the
  create dialogs saves first, then keeps the dialog open for tags/links).
- **Tags / categories / priorities** — shared lookups, filterable on every
  list page, editable under Settings.
- **Sharing** — per-item grants to users or groups at view/edit level.
- **Reminders** — email (SMTP) and signed webhook delivery with retry.
- **Archive-only** — nothing is hard-deleted; "Show archived" reveals
  archived rows everywhere. Every archive action shows an **Undo** toast.
  Archiving a user cascades: their items are archived, their reminders
  disabled and their sessions revoked (restoring the user does *not*
  auto-restore items).
- **Responsive UX** — optimistic updates with rollback, skeleton loading,
  retry buttons on failed queries, per-type smart defaults (last-used
  category/priority), filters collapse into a popover on small screens, and
  the calendar opens in list view on phones.
- **Hardening** — login rate limiting (10 failures per username per 15 min →
  429), optimistic locking on edits (`expectedUpdatedAtUTC` → 409 when someone
  else saved first), structured JSON-line logging, strict id/lookup/grantee
  validation with friendly errors.

[↑ back to TOC](#table-of-contents)

## Architecture

- **Pod**: `notestodo-pod` (rootless Podman, Quadlet units in
  `containers/quadlet/`, managed by systemd user services)
  - `notestodo-mariadb` — MariaDB 11, named volume, **port never published**
    (pod-internal `localhost:3306`)
  - `notestodo-dev` — dev container (Bun, source COPY'd at build, named
    workspace volume; publishes 5173 + 8080 via the pod)
  - `notestodo-app` — production unit (built SPA + API + scheduler in one Bun
    process; not enabled by default)
- **Monorepo layout**:
  - `apps/server` — Elysia API, Drizzle schema (`src/db/schema/`),
    hand-authored SQL migrations (`drizzle/NNNN_*.sql`), reminder scheduler
  - `apps/web` — React SPA (pages in `src/pages/`, shared features in
    `src/features/`, shadcn-style primitives in `src/components/ui/`)
  - `packages/spec` — OpenAPI spec (source of truth)
  - `containers/` — `Containerfile` (prod), `Containerfile.dev`, Quadlet
    units (`quadlet/`)
  - `scripts/` — lifecycle scripts (install/rebuild/start/stop/restart/teardown)
- **Spec**: Swagger UI at `/docs`, spec JSON at `/openapi.json`
  (auth-protected when `APP_ENV=production`).
- **Data lifecycle**: archive-only — DELETE sets `archived_at_UTC`,
  `POST …/restore` clears it. Uniqueness among active rows via generated
  `*_active` columns. All DB datetimes are UTC with `_UTC`-suffixed names.
- **Host contract**: only `podman`, `git`, a POSIX shell and `bun` exist on
  the host; every project command runs inside the dev container via
  `podman exec`. Named volumes only — no bind mounts.

[↑ back to TOC](#table-of-contents)

## Dev workflow

```sh
cp .env.example .env       # fill in passwords/keys (SECRETS_ENC_KEY: 64 hex chars)
./scripts/install.sh       # sync Quadlet units, build image, start pod, migrate
```

After host-side edits:

```sh
./scripts/rebuild.sh       # re-COPY source into the image + refresh workspace volume
```

- Web (Vite dev): <http://127.0.0.1:5173> — API: <http://127.0.0.1:8080> —
  docs: <http://127.0.0.1:8080/docs>
  (use `127.0.0.1`; `localhost` may resolve to IPv6 while the pod publishes IPv4)
- First login: `admin` / `admin` — **change it immediately** (Settings → Profile).
- All project commands run inside the container:
  `podman exec notestodo-dev bun test`, `… bun run typecheck`, etc.
  Nothing runs on the host.

[↑ back to TOC](#table-of-contents)

## Scripts

Lifecycle scripts live in [`scripts/`](scripts/README.md) — install, rebuild,
start, stop, restart and full teardown, all rootless-Podman/Quadlet aware,
project-scoped and prune-free. See [scripts/README.md](scripts/README.md) for
every option.

[↑ back to TOC](#table-of-contents)

## Remote deployment

Deploying to another machine (e.g. a LAN server) is the same workflow — the
pod publishes on `0.0.0.0`, so the app is reachable at the server's address:

```sh
git clone git@github.com:UncleJS/application_notesTodo.git && cd application_notesTodo
cp .env.example .env       # fill in THIS host's secrets
./scripts/install.sh       # dev mode — or ./scripts/install.sh --prod
./scripts/status.sh        # health report incl. server-side auth self-test
```

- Access at `http://<server-ip-or-hostname>:5173` (dev) or `:8080` (prod) —
  wherever the docs say `127.0.0.1`, substitute the server's address.
- **Update flow**: `git pull && ./scripts/rebuild.sh` (add `--prod` on
  production hosts). Never copy files by hand — drift between machines was
  the root cause of every remote incident so far.
- **Troubleshooting**: run `./scripts/status.sh`. If its auth self-test is OK
  but the browser still gets 401s, the browser holds a stale session cookie —
  clear site data for the server's address and log in again (the login page
  also detects this and says so explicitly).
- **Scope**: plain HTTP for trusted LANs only. No TLS termination is built
  in; do not expose these ports beyond the LAN and never via public tunnels.
  Change `admin`/`admin` immediately after the first login.

[↑ back to TOC](#table-of-contents)

## Production

```sh
./scripts/install.sh --prod   # first time: build, start notestodo-app, migrate
./scripts/rebuild.sh --prod   # updates: rebuild production image + restart
```

Serves SPA + API + reminder scheduler on pod port 8080 with
`APP_ENV=production` (docs require login; SPA served from `apps/web/dist`).
Dev and prod are mutually exclusive — only the selected mode's Quadlet unit
is installed, since both serve the API on pod port 8080. Switch back to dev
with `./scripts/rebuild.sh`.

[↑ back to TOC](#table-of-contents)

## Settings

- **Categories / Priorities / Tags**: DB lookup tables (FK'd from items),
  editable inline under Settings. Lookup mutation is admin-only; tag
  *creation* is open to all users.
- **Email reminders**: Settings → Email (SMTP) — host/port/user/password/
  from/TLS, stored in DB with the password AES-256-GCM-encrypted using
  `SECRETS_ENC_KEY`.
- **Webhook reminders**: Settings → Webhook — URL + optional HMAC secret;
  deliveries are signed via `x-notestodo-signature` (HMAC-SHA256 of the JSON
  body).
- Reminder scheduler ticks every 30 s in the API process; per-occurrence
  dispatch is restart-safe (unique sent-guard in `reminder_dispatch`), failed
  sends retry 3× with backoff.

[↑ back to TOC](#table-of-contents)

## Migrations

Hand-authored SQL in `apps/server/drizzle/NNNN_*.sql`, applied in order by
`bun run db:migrate` (tracked in `_migrations`). Generated `*_active` unique
columns implement uniqueness-among-active — keep them when altering tables.

[↑ back to TOC](#table-of-contents)

## Testing

```sh
podman exec notestodo-dev bun test            # full suite
podman exec notestodo-dev bun run typecheck   # server + web
```

- Tests run against a **dedicated database** `notestodo_test` on the pod's
  MariaDB — provisioned automatically on first run (created via
  `MARIADB_ROOT_PASSWORD`, migrations applied, app user granted). The dev
  database is never touched.
- `bunfig.toml` preloads `apps/server/src/test/preload.ts`, which points
  `DB_NAME` at the test DB *before* the connection pool is created.
- Route tests call the Elysia app in-process (`app.handle(new Request(…))`) —
  no port, no network. Helpers in `apps/server/src/test/setup.ts` provide
  `truncateAll()`, `seedBaseFixtures()` (admin/alice/bob + group + lookups)
  and `makeSession()` (returns a Bearer-usable sid).
- Coverage: auth flow + rate limiting, item access matrix (owner/edit/view/
  group/admin), id + lookup + grantee + RRULE validation, optimistic locking,
  bulk operations, user-archive cascade, reminder worker (dedup, retry,
  archived skips), recurrence expansion (DST, EXDATE, COUNT).

[↑ back to TOC](#table-of-contents)

## Conventions

- **Timestamps**: stored UTC, column names end `_UTC`; API transport is
  ISO-8601 (`…Z`); UI shows `yyyy-MM-dd HH:mm:ss` in the viewer's local time.
- **Date/time inputs**: `DateTimeInput` / `TimeInput` with matrix-style
  selectors (hour 6×4, minute/second 4×3 in 5-step increments).
- **Dark theme**: high-contrast; all text uses `text-foreground` (never
  muted/zinc/gray/slate utilities).
- **Archived items**: hidden by default on every page; a "Show archived"
  checkbox reveals them.
- **Optimistic locking**: PATCH bodies on notes/todos/calendar accept an
  optional `expectedUpdatedAtUTC`; the server answers `409` when the item
  changed since that timestamp (omit the field for last-write-wins).
- **Logging**: one JSON object per line (`{ts, level, event, …context}`) —
  grep/jq-friendly in `podman logs` / journald.
- **Frontend chunks**: pages are code-split (`React.lazy`); heavy deps like
  `rrule` load only with the calendar chunk.
- **Env files**: repo-local only — `.env.example` (committed placeholders)
  and `.env` (gitignored).

[↑ back to TOC](#table-of-contents)

## License

This project is licensed under the
[Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License](LICENSE.md)
(CC BY-NC-SA 4.0).

[↑ back to TOC](#table-of-contents)

---

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](LICENSE.md)
**NotesTodo** © 2026 Jaco Steyn — licensed under
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
See [LICENSE.md](LICENSE.md).
