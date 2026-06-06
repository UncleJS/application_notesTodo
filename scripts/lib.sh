#!/usr/bin/env bash
# Shared project definitions + helpers for the NotesTodo lifecycle scripts.
# Project-scoped only: nothing here may touch artifacts outside these lists,
# and prune commands are forbidden (they sweep other projects' state).

set -euo pipefail

PROJECT_NAME=notestodo
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QUADLET_DIR="${HOME}/.config/containers/systemd"

# systemd user units (Quadlet-generated service names)
PROJECT_UNITS=(
  notestodo-app.service
  notestodo-dev.service
  notestodo-mariadb.service
  notestodo-pod-pod.service
)

PROJECT_POD="notestodo-pod"
PROJECT_CONTAINERS=(notestodo-app notestodo-dev notestodo-mariadb)

# Images built by this project (the mariadb:11 base image is shared — only
# removed by teardown --purge).
PROJECT_IMAGES=(localhost/notestodo-dev:latest localhost/notestodo-app:latest)
SHARED_IMAGES=(docker.io/library/mariadb:11)

# Both naming variants: plain and Quadlet's systemd- prefix.
PROJECT_VOLUMES=(
  notestodo-dev
  notestodo-mariadb
  systemd-notestodo-dev
  systemd-notestodo-mariadb
)

# Quadlet unit files (copied from containers/quadlet/ into QUADLET_DIR)
PROJECT_QUADLET_FILES=(
  notestodo-app.container
  notestodo-dev.container
  notestodo-dev.volume
  notestodo-mariadb.container
  notestodo-mariadb.volume
  notestodo-pod.pod
)

# First non-loopback IP of this host for user-facing URLs (falls back to
# 127.0.0.1). The pod publishes on 0.0.0.0, so this address works from the LAN.
host_hint() {
  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  echo "${ip:-127.0.0.1}"
}

# --- preflight guards (container-first-dev skill) -------------------------

require_env() {
  if [[ ! -f "${REPO_DIR}/.env" ]]; then
    echo "ERROR: Missing repo-local .env — run: cp .env.example .env (then fill in secrets)"
    exit 1
  fi
  local stale="${QUADLET_DIR}/${PROJECT_NAME}.env"
  if [[ -f "${stale}" ]]; then
    echo "ERROR: Stale host env file detected: ${stale}"
    echo "Remove it: rm \"${stale}\""
    exit 1
  fi
}

# --- dev/prod mutual exclusion ---------------------------------------------
# The Quadlet-generated pod service Wants= every member container, so ANY pod
# start also pulls up notestodo-app. Dev and prod both listen on pod port 8080
# (SO_REUSEPORT) — if both run, requests alternate between code versions.
# Always stop the sibling AFTER starting the wanted variant.

ensure_only() { # ensure_only dev|app
  local keep="$1" other
  if [[ "$keep" == "dev" ]]; then other="app"; else other="dev"; fi
  systemctl --user stop "${PROJECT_NAME}-${other}" 2>/dev/null || true
  systemctl --user reset-failed "${PROJECT_NAME}-${other}.service" 2>/dev/null || true
}

# --- install / update sequencing -------------------------------------------

# sync_quadlets [app]
# Copies the Quadlet units, rewriting EnvironmentFile= to THIS clone's
# repo-local .env so the units work from any checkout path (the committed
# value is only a placeholder).
# Dev and prod are mutually exclusive: the generated pod service Wants= every
# INSTALLED member container, and both variants serve the API on pod port
# 8080 — so only the unit for the selected mode is installed; the sibling's
# unit file is removed.
sync_quadlets() {
  local mode="${1:-dev}" f base skip
  if [[ "$mode" == "app" ]]; then skip="notestodo-dev.container"; else skip="notestodo-app.container"; fi
  mkdir -p "${QUADLET_DIR}"
  for f in "${REPO_DIR}"/containers/quadlet/*; do
    base="$(basename "$f")"
    [[ "$base" == "$skip" ]] && continue
    sed "s|^EnvironmentFile=.*|EnvironmentFile=${REPO_DIR}/.env|" "$f" \
      > "${QUADLET_DIR}/${base}"
  done
  rm -f "${QUADLET_DIR}/${skip}"
  systemctl --user daemon-reload
}

build_dev_image() {
  podman build -f "${REPO_DIR}/containers/Containerfile.dev" -t "${PROJECT_NAME}-dev:latest" "${REPO_DIR}"
}

build_prod_image() {
  podman build -f "${REPO_DIR}/containers/Containerfile" -t "${PROJECT_NAME}-app:latest" "${REPO_DIR}"
}

# Named-volume copy-up only seeds an EMPTY volume — refresh it so a rebuilt
# image's COPY content reaches the workspace.
refresh_dev_volume() {
  systemctl --user stop "${PROJECT_NAME}-dev" 2>/dev/null || true
  podman volume rm "${PROJECT_NAME}-dev" 2>/dev/null || true
  podman volume rm "systemd-${PROJECT_NAME}-dev" 2>/dev/null || true
}

# --- teardown helpers (podman-rootless-systemd skill order) -----------------

stop_units() {
  for unit in "${PROJECT_UNITS[@]}"; do
    systemctl --user stop "$unit" >/dev/null 2>&1 || true
  done
}

disable_units() {
  for unit in "${PROJECT_UNITS[@]}"; do
    systemctl --user disable "$unit" >/dev/null 2>&1 || true
    systemctl --user reset-failed "$unit" >/dev/null 2>&1 || true
  done
}

remove_runtime() {
  podman pod rm -f "${PROJECT_POD}" >/dev/null 2>&1 || true
  for ctr in "${PROJECT_CONTAINERS[@]}"; do
    podman rm -f "$ctr" >/dev/null 2>&1 || true
  done
  for image in "${PROJECT_IMAGES[@]}"; do
    podman image rm -f "$image" >/dev/null 2>&1 || true
  done
}

remove_quadlet_files() {
  for f in "${PROJECT_QUADLET_FILES[@]}"; do
    rm -f "${QUADLET_DIR}/${f}"
  done
  systemctl --user daemon-reload
}

purge_volumes() {
  for vol in "${PROJECT_VOLUMES[@]}"; do
    podman volume rm -f "$vol" >/dev/null 2>&1 || true
  done
}

purge_shared_images() {
  for image in "${SHARED_IMAGES[@]}"; do
    podman image rm -f "$image" >/dev/null 2>&1 || true
  done
}
