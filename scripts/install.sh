#!/usr/bin/env bash
# Install NotesTodo: sync Quadlet units, build the dev image, start the pod
# (MariaDB + dev container) and apply DB migrations.
#
# Usage: scripts/install.sh [--prod] [--no-migrate]
#   --prod        also build the production image (localhost/notestodo-app)
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
if $PROD; then sync_quadlets app; else sync_quadlets; fi
build_dev_image
$PROD && build_prod_image

systemctl --user start "${PROJECT_NAME}-mariadb"
systemctl --user start "${PROJECT_NAME}-dev"
ensure_only dev

if $MIGRATE; then
  echo "Applying DB migrations…"
  podman exec "${PROJECT_NAME}-dev" bun run db:migrate
fi

echo "Installed. Web: http://127.0.0.1:5173 — API: http://127.0.0.1:8080"
echo "First login: admin / admin — change it immediately."
