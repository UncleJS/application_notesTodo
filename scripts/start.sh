#!/usr/bin/env bash
# Start NotesTodo services (MariaDB + dev container by default).
#
# Usage: scripts/start.sh [--prod]
#   --prod  start the production container (notestodo-app) instead of dev

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

PROD=false
for arg in "$@"; do
  case "$arg" in
    --prod) PROD=true ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

require_env
systemctl --user start "${PROJECT_NAME}-mariadb"
if $PROD; then
  systemctl --user start "${PROJECT_NAME}-app"
  ensure_only app
  echo "Started (production): http://127.0.0.1:8080"
else
  systemctl --user start "${PROJECT_NAME}-dev"
  ensure_only dev
  echo "Started (dev): web http://127.0.0.1:5173 — API http://127.0.0.1:8080"
fi
