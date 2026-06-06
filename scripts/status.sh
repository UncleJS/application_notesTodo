#!/usr/bin/env bash
# One-shot health & diagnostics report for NotesTodo — designed for remote
# hosts where persistent user journals may be unavailable.
#
# Usage: scripts/status.sh

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

HOST="$(host_hint)"
echo "=== NotesTodo status on $(hostname) (${HOST}) ==="

echo
echo "--- systemd user units"
systemctl --user --no-legend list-units 'notestodo*' 2>/dev/null \
  | awk '{printf "  %-35s %s %s\n", $1, $3, $4}' || true

echo
echo "--- running containers"
podman ps --format '  {{.Names}}\t{{.Status}}' | grep "${PROJECT_NAME}" || echo "  (none)"

echo
echo "--- project images"
podman images --format '  {{.Repository}}:{{.Tag}}\tbuilt {{.CreatedSince}}' \
  | grep -E "${PROJECT_NAME}|mariadb" || echo "  (none)"

echo
echo "--- health probes (from this host)"
api_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://127.0.0.1:8080/api/v1/health" || true)
web_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://127.0.0.1:5173/" || true)
echo "  API  http://${HOST}:8080/api/v1/health → ${api_code:-no response}"
echo "  Web  http://${HOST}:5173/              → ${web_code:-no response} (dev mode only)"

echo
echo "--- auth self-test (server-side; no credentials stored)"
# A bad-credentials login MUST return 401 {"error":"invalid credentials"}:
# proves API ⇄ DB ⇄ users table ⇄ session machinery all work on the server.
# Any other result (500, connection refused, empty) is a server-side problem;
# if this is OK but the browser still gets 401s, the problem is browser-side
# (stale/blocked session cookie — clear site data and log in again).
auth=$(curl -s --max-time 5 -w "\n%{http_code}" -X POST "http://127.0.0.1:8080/api/v1/auth/login" \
  -H 'Content-Type: application/json' -d '{"username":"__status_probe__","password":"x"}' || true)
auth_code=$(echo "$auth" | tail -1)
auth_body=$(echo "$auth" | head -1)
if [[ "$auth_code" == "401" && "$auth_body" == *"invalid credentials"* ]]; then
  echo "  OK — API, database and auth stack are healthy"
else
  echo "  FAILED — expected 401 'invalid credentials', got: ${auth_code:-none} ${auth_body:-}"
fi

echo
echo "--- last API log lines"
if podman ps --format '{{.Names}}' | grep -q "^${PROJECT_NAME}-dev$"; then
  podman logs --tail 15 "${PROJECT_NAME}-dev" 2>&1 | sed 's/^/  /'
elif podman ps --format '{{.Names}}' | grep -q "^${PROJECT_NAME}-app$"; then
  podman logs --tail 15 "${PROJECT_NAME}-app" 2>&1 | sed 's/^/  /'
else
  echo "  (no app/dev container running)"
fi
