#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER_NAME="${SANDBOX_DB_CONTAINER:-gelbcrm-sandbox-mysql}"
DB_PORT="${SANDBOX_DB_PORT:-3307}"
DB_DATABASE="${SANDBOX_DB_DATABASE:-gelbcrm_sandbox}"
DB_USERNAME="${SANDBOX_DB_USERNAME:-gelbcrm}"
DB_PASSWORD="${SANDBOX_DB_PASSWORD:-gelbcrm}"
DB_ROOT_PASSWORD="${SANDBOX_DB_ROOT_PASSWORD:-root}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[sandbox] docker is required. Install/start Docker and retry."
  exit 1
fi

if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  echo "[sandbox] Reusing existing container: $CONTAINER_NAME"
  docker start "$CONTAINER_NAME" >/dev/null
else
  echo "[sandbox] Creating MySQL sandbox container: $CONTAINER_NAME"
  docker run -d \
    --name "$CONTAINER_NAME" \
    -e MYSQL_ROOT_PASSWORD="$DB_ROOT_PASSWORD" \
    -e MYSQL_DATABASE="$DB_DATABASE" \
    -e MYSQL_USER="$DB_USERNAME" \
    -e MYSQL_PASSWORD="$DB_PASSWORD" \
    -p "${DB_PORT}:3306" \
    --health-cmd='mysqladmin ping -h 127.0.0.1 -uroot -p$MYSQL_ROOT_PASSWORD --silent' \
    --health-interval=5s \
    --health-timeout=3s \
    --health-retries=30 \
    mysql:8 >/dev/null
fi

echo "[sandbox] Waiting for MySQL readiness..."
for i in {1..60}; do
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' "$CONTAINER_NAME" 2>/dev/null || true)"
  if [ "$status" = "healthy" ]; then
    echo "[sandbox] MySQL is healthy."
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "[sandbox] MySQL did not become healthy in time."
    docker logs --tail 80 "$CONTAINER_NAME" || true
    exit 1
  fi
  sleep 2
done

echo "[sandbox] Running migrations..."
(
  cd "$ROOT_DIR"
  SANDBOX_DB_PORT="$DB_PORT" \
  SANDBOX_DB_DATABASE="$DB_DATABASE" \
  SANDBOX_DB_USERNAME="$DB_USERNAME" \
  SANDBOX_DB_PASSWORD="$DB_PASSWORD" \
  npm run db:migrate:sandbox
)

echo "[sandbox] Seeding admin user..."
(
  cd "$ROOT_DIR"
  SANDBOX_DB_PORT="$DB_PORT" \
  SANDBOX_DB_DATABASE="$DB_DATABASE" \
  SANDBOX_DB_USERNAME="$DB_USERNAME" \
  SANDBOX_DB_PASSWORD="$DB_PASSWORD" \
  ADMIN_LOGIN="${SANDBOX_ADMIN_LOGIN:-admin}" \
  ADMIN_PASSWORD="${SANDBOX_ADMIN_PASSWORD:-admin123}" \
  npm run db:seed:admin:sandbox
)

cat <<EOF
[sandbox] Ready.
- DB: mysql://${DB_USERNAME}:***@127.0.0.1:${DB_PORT}/${DB_DATABASE}
- Admin login: ${SANDBOX_ADMIN_LOGIN:-admin}
- Admin password: ${SANDBOX_ADMIN_PASSWORD:-admin123}

Start app in sandbox mode:
  npm run dev:sandbox
EOF
