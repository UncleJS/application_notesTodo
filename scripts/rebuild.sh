#!/usr/bin/env bash
# Rebuild after host-side edits: re-COPY the source into the image, refresh
# the named workspace volume (copy-up only seeds an empty volume), restart.
#
# Usage: scripts/rebuild.sh [--prod] [--keep-volume] [--no-migrate]
#   --prod         build the production image and restart notestodo-app
#                  (stops the dev container; app serves on :8080)
#   --keep-volume  dev only: skip the workspace-volume refresh (faster, but
#                  the running workspace keeps its old source)
#   --no-migrate   skip the (idempotent) DB migration step after restart

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

PROD=false
KEEP_VOLUME=false
MIGRATE=true
for arg in "$@"; do
  case "$arg" in
    --prod) PROD=true ;;
    --keep-volume) KEEP_VOLUME=true ;;
    --no-migrate) MIGRATE=false ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

require_env

if $PROD; then
  sync_quadlets app
  build_prod_image
  systemctl --user start "${PROJECT_NAME}-mariadb"
  systemctl --user restart "${PROJECT_NAME}-app"
  ensure_only app
  # pulled code can include new migrations — always bring the DB along
  $MIGRATE && podman exec "${PROJECT_NAME}-app" bun run db:migrate
  echo "Production container rebuilt and restarted (http://$(host_hint):8080)."
else
  sync_quadlets
  build_dev_image
  $KEEP_VOLUME || refresh_dev_volume
  systemctl --user start "${PROJECT_NAME}-mariadb"
  systemctl --user restart "${PROJECT_NAME}-dev"
  ensure_only dev
  # pulled code can include new migrations — always bring the DB along
  $MIGRATE && podman exec "${PROJECT_NAME}-dev" bun run db:migrate
  echo "Dev container rebuilt and restarted."
fi
