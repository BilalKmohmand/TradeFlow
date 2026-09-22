#!/usr/bin/env bash
# Local Supabase-like stack for supabase/tests/verify_lock.mjs (never a live project):
#   supabase/postgres (non-superuser "postgres" like hosted Supabase, auth schema, anon/authenticated roles)
#   GoTrue (Supabase Auth; runs the real auth migrations) on :59999
#   PostgREST on :53001
set -euo pipefail
NET=sarmaya-test
PW=testpw
JWT=sarmaya-test-jwt-secret-at-least-32-chars-long

docker network inspect "$NET" >/dev/null 2>&1 || docker network create "$NET" >/dev/null
docker run -d --name sarmaya-db --network "$NET" -p 55499:5432 -e POSTGRES_PASSWORD="$PW" supabase/postgres:15.8.1.135 >/dev/null
until docker exec sarmaya-db pg_isready -U postgres -h localhost >/dev/null 2>&1; do sleep 2; done
sleep 5
docker exec -e PGPASSWORD="$PW" sarmaya-db psql -U supabase_admin -h localhost -d postgres -q \
  -c "ALTER ROLE authenticator WITH PASSWORD '$PW'; ALTER ROLE supabase_auth_admin WITH PASSWORD '$PW';"

docker run -d --name sarmaya-gotrue --network "$NET" -p 59999:9999 \
  -e GOTRUE_DB_DRIVER=postgres \
  -e DATABASE_URL="postgres://supabase_auth_admin:$PW@sarmaya-db:5432/postgres?sslmode=disable" \
  -e GOTRUE_SITE_URL=http://localhost:3000 -e API_EXTERNAL_URL=http://localhost:59999 \
  -e GOTRUE_API_HOST=0.0.0.0 -e PORT=9999 \
  -e GOTRUE_JWT_SECRET="$JWT" -e GOTRUE_JWT_EXP=3600 -e GOTRUE_JWT_AUD=authenticated \
  -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated -e GOTRUE_JWT_ADMIN_ROLES=service_role \
  -e GOTRUE_DISABLE_SIGNUP=true -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true -e GOTRUE_MAILER_AUTOCONFIRM=true \
  supabase/gotrue:v2.186.0 >/dev/null

docker run -d --name sarmaya-postgrest --network "$NET" -p 53001:3000 \
  -e PGRST_DB_URI="postgres://authenticator:$PW@sarmaya-db:5432/postgres" \
  -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="$JWT" \
  postgrest/postgrest:v12.2.3 >/dev/null

until curl -sf localhost:59999/health >/dev/null; do sleep 2; done
until curl -sf localhost:53001/ >/dev/null; do sleep 2; done
echo "stack up: db :55499, auth :59999, rest :53001"
