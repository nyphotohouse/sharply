#!/usr/bin/env bash
# One-command local mirror of the e2e CI pipeline.
# Spins up a disposable Postgres (port 5433 — never clashes with the dev DB),
# then runs: pg_trgm -> drizzle push -> payload bootstrap -> seed.
# Docs: docs/e2e-testing.md   Decision: docs/decisions/2026-08-31-hermetic-e2e-ci.md
set -euo pipefail

if [ "${1:-}" != "" ] && [ "${1:-}" != "--run" ]; then
  echo "Usage: $0 [--run]" >&2
  exit 2
fi

CONTAINER_NAME="sharply-e2e-postgres"
DB_PORT="${E2E_DB_PORT:-5433}"

export DATABASE_URL="postgres://postgres:postgres@localhost:${DB_PORT}/sharply_e2e"
export PAYLOAD_SECRET="${PAYLOAD_SECRET:-e2e-local-secret}"
export AUTH_SECRET="${AUTH_SECRET:-e2e-local-auth-secret}"
export OPENAI_API_KEY="${OPENAI_API_KEY:-e2e-local-dummy}"
export NEXT_PUBLIC_BASE_URL="${NEXT_PUBLIC_BASE_URL:-http://localhost:3000}"
export BETTER_AUTH_URL="${BETTER_AUTH_URL:-http://localhost:3000}"
export SKIP_ENV_VALIDATION=1
# A blob token inherited from the shell (e.g. direnv) would point Payload at
# the REAL Vercel Blob store during build/start. The bootstrap script guards
# itself; this covers every other step run from this script.
unset BLOB_READ_WRITE_TOKEN

if [ -n "$(docker ps -aq -f name="^${CONTAINER_NAME}$")" ]; then
  # Guard against a stale container published on a different port: DATABASE_URL
  # is built from DB_PORT, and drizzle push --force against the wrong Postgres
  # would be destructive.
  published_port="$(docker inspect -f '{{ (index (index .HostConfig.PortBindings "5432/tcp") 0).HostPort }}' "${CONTAINER_NAME}" 2>/dev/null || echo "")"
  if [ "${published_port}" != "${DB_PORT}" ]; then
    echo "[e2e] ERROR: container ${CONTAINER_NAME} publishes port ${published_port:-<none>}, but E2E_DB_PORT=${DB_PORT}." >&2
    echo "[e2e] Remove it (docker rm -f ${CONTAINER_NAME}) or rerun with E2E_DB_PORT=${published_port}." >&2
    exit 1
  fi
  docker start "${CONTAINER_NAME}" >/dev/null
  echo "[e2e] reusing container ${CONTAINER_NAME}"
else
  docker run -d --name "${CONTAINER_NAME}" \
    -e POSTGRES_PASSWORD=postgres \
    -e POSTGRES_DB=sharply_e2e \
    -p "${DB_PORT}:5432" \
    postgres:17-alpine >/dev/null
  echo "[e2e] started container ${CONTAINER_NAME} on port ${DB_PORT}"
fi

# Probe over TCP: the image's initdb-phase temporary server listens only on the
# unix socket, so a socket probe can succeed before the real server is up.
echo "[e2e] waiting for postgres..."
db_ready=false
for _ in $(seq 1 60); do
  if docker exec "${CONTAINER_NAME}" pg_isready -h 127.0.0.1 -U postgres -d sharply_e2e >/dev/null 2>&1; then
    db_ready=true
    break
  fi
  sleep 0.5
done
if [ "${db_ready}" != "true" ]; then
  echo "[e2e] ERROR: postgres did not become ready within 30s — check 'docker logs ${CONTAINER_NAME}'" >&2
  exit 1
fi

docker exec "${CONTAINER_NAME}" psql -U postgres -d sharply_e2e \
  -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;" >/dev/null
echo "[e2e] pg_trgm ready"

npx drizzle-kit push --force --config=config/drizzle.config.ts
npm run e2e:bootstrap
npm run db:seed -- --confirm-seed
npm run e2e:seed-fixtures

if [ "${1:-}" = "--run" ]; then
  echo "[e2e] building production app..."
  npx next build --webpack

  echo "[e2e] running Playwright with CI settings..."
  CI=true PLAYWRIGHT_SERVER_COMMAND="npm run start:e2e" npm run test:e2e

  cat <<EOF

[e2e] run complete

Tear down when done:
  docker rm -f ${CONTAINER_NAME}
EOF
  exit 0
fi

cat <<EOF

[e2e] database ready: ${DATABASE_URL}

CI-identical run (production build; CI=true matches workers/retries/reporters;
BLOB_READ_WRITE_TOKEN blanked so a shell-exported token can't reach real storage):
  BLOB_READ_WRITE_TOKEN= DATABASE_URL="${DATABASE_URL}" PAYLOAD_SECRET="${PAYLOAD_SECRET}" \\
    AUTH_SECRET="${AUTH_SECRET}" BETTER_AUTH_URL="${BETTER_AUTH_URL}" \\
    NEXT_PUBLIC_BASE_URL="${NEXT_PUBLIC_BASE_URL}" OPENAI_API_KEY="${OPENAI_API_KEY}" \\
    SKIP_ENV_VALIDATION=1 npx next build --webpack
  CI=true BLOB_READ_WRITE_TOKEN= DATABASE_URL="${DATABASE_URL}" PAYLOAD_SECRET="${PAYLOAD_SECRET}" \\
    AUTH_SECRET="${AUTH_SECRET}" BETTER_AUTH_URL="${BETTER_AUTH_URL}" \\
    NEXT_PUBLIC_BASE_URL="${NEXT_PUBLIC_BASE_URL}" OPENAI_API_KEY="${OPENAI_API_KEY}" \\
    PLAYWRIGHT_SERVER_COMMAND="npm run start:e2e" npm run test:e2e

Tear down when done:
  docker rm -f ${CONTAINER_NAME}
EOF
