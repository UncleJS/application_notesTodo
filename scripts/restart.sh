#!/usr/bin/env bash
# Restart NotesTodo services without rebuilding images.
#
# Usage: scripts/restart.sh [--prod]
#   --prod  restart the production container (notestodo-app) instead of dev

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

PROD=false
for arg in "$@"; do
  case "$arg" in
    --prod) PROD=true ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

require_env
systemctl --user restart "${PROJECT_NAME}-mariadb"
if $PROD; then
  systemctl --user restart "${PROJECT_NAME}-app"
  echo "Restarted (production): http://127.0.0.1:8080"
else
  systemctl --user restart "${PROJECT_NAME}-dev"
  echo "Restarted (dev): web http://127.0.0.1:5173 — API http://127.0.0.1:8080"
fi
