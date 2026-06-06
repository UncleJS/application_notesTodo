#!/usr/bin/env bash
# Stop NotesTodo services. App/dev containers and MariaDB stop; with --pod the
# pod itself (and its port publishes) goes down too.
#
# Usage: scripts/stop.sh [--pod]
#   --pod  also stop the pod unit (notestodo-pod-pod.service)

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

POD=false
for arg in "$@"; do
  case "$arg" in
    --pod) POD=true ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

for unit in "${PROJECT_NAME}-app" "${PROJECT_NAME}-dev" "${PROJECT_NAME}-mariadb"; do
  systemctl --user stop "$unit" 2>/dev/null || true
done
if $POD; then
  systemctl --user stop "${PROJECT_NAME}-pod-pod.service" 2>/dev/null || true
  echo "Stopped all services and the pod."
else
  echo "Stopped all services (pod left up; use --pod to stop it too)."
fi
