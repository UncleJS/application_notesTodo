#!/usr/bin/env bash
# Install NotesTodo: sync Quadlet units, build the image(s), start the pod
# and apply DB migrations.
#
# Usage: scripts/install.sh [--prod] [--no-migrate]
#   --prod        production install: build + start notestodo-app (built SPA +
#                 API on :8080, APP_ENV=production); the dev container is not
#                 started. Default (no flag) is the dev install (Vite :5173 +
#                 API :8080).
#   --no-migrate  skip `bun run db:migrate` after startup

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

PROD=false
MIGRATE=true
for arg in "$@"; do
  case "$arg" in
    --prod) PROD=true ;;
    --no-migrate) MIGRATE=false ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

require_env
HOST="$(host_hint)"

if $PROD; then
  sync_quadlets app
  build_prod_image
  systemctl --user start "${PROJECT_NAME}-mariadb"
  systemctl --user start "${PROJECT_NAME}-app"
  ensure_only app
  if $MIGRATE; then
    echo "Applying DB migrations…"
    podman exec "${PROJECT_NAME}-app" bun run db:migrate
  fi
  echo "Installed (production). App: http://${HOST}:8080"
else
  sync_quadlets
  build_dev_image
  systemctl --user start "${PROJECT_NAME}-mariadb"
  systemctl --user start "${PROJECT_NAME}-dev"
  ensure_only dev
  if $MIGRATE; then
    echo "Applying DB migrations…"
    podman exec "${PROJECT_NAME}-dev" bun run db:migrate
  fi
  echo "Installed (dev). Web: http://${HOST}:5173 — API: http://${HOST}:8080"
fi
echo "First login: admin / admin — change it immediately."