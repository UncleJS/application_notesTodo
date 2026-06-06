# NotesTodo lifecycle scripts

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](../LICENSE.md)
[![Containers: Podman rootless](https://img.shields.io/badge/Containers-Podman%20rootless-892ca0.svg)](https://podman.io)
[![Units: systemd Quadlet](https://img.shields.io/badge/Units-systemd%20Quadlet-30a24c.svg)](https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html)
[![Cleanup: prune--free](https://img.shields.io/badge/Cleanup-prune--free-orange.svg)](#teardownsh)

Rootless-Podman / Quadlet lifecycle scripts for NotesTodo. All of them are
**project-scoped** (they only ever touch artifacts named in `lib.sh`) and
**prune-free** (no `podman … prune`, which would sweep other projects on the
same host). Every script sources [`lib.sh`](lib.sh) for the shared project
definitions and helpers.

> **Dev/prod mutual exclusion**: the Quadlet-generated pod service `Wants=`
> every member container, so any pod start also pulls up `notestodo-app`.
> Dev and prod both listen on pod port 8080 — if both run, requests alternate
> between code versions (stale responses!). Every start/restart/rebuild
> therefore stops the sibling variant afterwards (`ensure_only` in `lib.sh`).
> Always switch modes via these scripts, not raw `systemctl`.

## Table of contents

- [Prerequisites](#prerequisites)
- [install.sh](#installsh)
- [rebuild.sh](#rebuildsh)
- [start.sh](#startsh)
- [stop.sh](#stopsh)
- [restart.sh](#restartsh)
- [teardown.sh](#teardownsh)
- [lib.sh](#libsh)
- [License](#license)

## Prerequisites

- Rootless Podman + systemd user session on the host (nothing else — all
  runtimes live inside containers).
- A repo-local `.env` (`cp .env.example .env`, then fill in the secrets).
  Every script verifies this and refuses to run with a stale host-level env
  file (`~/.config/containers/systemd/notestodo.env`).
- For boot persistence enable linger: `loginctl enable-linger $USER`.

[↑ back to TOC](#table-of-contents)

## install.sh

First-time setup (idempotent — safe to re-run): copies the Quadlet units from
`containers/quadlet/` to `~/.config/containers/systemd/`, reloads systemd, builds the
dev image, starts MariaDB + the dev container, and applies DB migrations
(which also seeds the `admin`/`admin` user on an empty database).

```sh
scripts/install.sh [--prod] [--no-migrate]
```

| Option | Effect |
|--------|--------|
| `--prod` | also build the production image (`localhost/notestodo-app:latest`) |
| `--no-migrate` | skip `bun run db:migrate` after startup |

[↑ back to TOC](#table-of-contents)

## rebuild.sh

Sync host-side source edits into the running app. Source is `COPY`'d into the
image at build time, and named-volume copy-up only seeds an *empty* volume —
so this rebuilds the image, removes/reseeds the workspace volume, and
restarts.

```sh
scripts/rebuild.sh [--prod] [--keep-volume]
```

| Option | Effect |
|--------|--------|
| `--prod` | build the production image and restart `notestodo-app` (stops the dev container; serves on `:8080`) |
| `--keep-volume` | dev only: skip the workspace-volume refresh — faster, but the running workspace keeps its old source |

[↑ back to TOC](#table-of-contents)

## start.sh

Start services without rebuilding anything.

```sh
scripts/start.sh [--prod]
```

| Option | Effect |
|--------|--------|
| *(none)* | start `notestodo-mariadb` + `notestodo-dev` (web `:5173`, API `:8080`) |
| `--prod` | start `notestodo-mariadb` + `notestodo-app` (`:8080`) |

[↑ back to TOC](#table-of-contents)

## stop.sh

Stop the app/dev containers and MariaDB. The pod (which owns the published
ports) stays up unless `--pod` is given.

```sh
scripts/stop.sh [--pod]
```

| Option | Effect |
|--------|--------|
| *(none)* | stop `notestodo-app`, `notestodo-dev`, `notestodo-mariadb` |
| `--pod` | also stop `notestodo-pod-pod.service` |

[↑ back to TOC](#table-of-contents)

## restart.sh

Restart running services without an image rebuild (use
[`rebuild.sh`](#rebuildsh) after source edits).

```sh
scripts/restart.sh [--prod]
```

| Option | Effect |
|--------|--------|
| *(none)* | restart `notestodo-mariadb` + `notestodo-dev` |
| `--prod` | restart `notestodo-mariadb` + `notestodo-app` |

[↑ back to TOC](#table-of-contents)

## teardown.sh

Full uninstall in the safe order: stop units → disable + reset-failed →
remove pod/containers/project images → remove Quadlet unit files →
`daemon-reload`. Named volumes (your data!) are **kept** unless `--purge` is
given. Strictly project-scoped; never prunes.

```sh
scripts/teardown.sh [--purge] [--yes]
```

| Option | Effect |
|--------|--------|
| *(none)* | remove runtime + units; **keep** named volumes and the shared `mariadb:11` image |
| `--purge` | **DATA LOSS** — also delete the named volumes (including the database) and the `mariadb:11` image |
| `--yes` | skip the confirmation prompt (for automation) |

To reinstall after a teardown: `scripts/install.sh`.

[↑ back to TOC](#table-of-contents)

## lib.sh

Not run directly. Holds the project-scoped artifact lists (units, pod,
containers, images, volumes — both plain and `systemd-` prefixed naming
variants — and Quadlet file names) plus the shared helpers (`require_env`,
`sync_quadlets`, `build_*_image`, `refresh_dev_volume`, and the teardown
helpers). If an artifact is not listed there, no script touches it.

[↑ back to TOC](#table-of-contents)

## License

Licensed under [CC BY-NC-SA 4.0](../LICENSE.md).

[↑ back to TOC](#table-of-contents)

---

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](../LICENSE.md)
**NotesTodo** © 2026 Jaco Steyn — licensed under
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
See [LICENSE.md](../LICENSE.md).
