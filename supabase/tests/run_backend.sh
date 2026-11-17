#!/usr/bin/env bash
# 로컬 PostgreSQL에 새 DB를 만들고 Supabase 흉내 → migrations → 백엔드 테스트 순으로 실행한다.
# 사용: PGHOST=/var/tmp/bandy-pg PGPORT=54329 PGUSER=postgres supabase/tests/run_backend.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=bandy_backend_test
dropdb --if-exists "$DB"
createdb "$DB"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f tests/local_supabase_shim.sql
for f in migrations/*.sql; do psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"; done
psql -v ON_ERROR_STOP=1 -d "$DB" -f tests/app_backend_test.sql
