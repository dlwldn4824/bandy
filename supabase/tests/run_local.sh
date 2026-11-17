#!/usr/bin/env bash
# 로컬 PostgreSQL에 새 DB를 만들고 shim → 마이그레이션 → 테스트 순으로 실행한다.
# 사용: PGHOST=/var/tmp/bandy-pg PGPORT=54329 PGUSER=postgres supabase/tests/run_local.sh
set -euo pipefail
cd "$(dirname "$0")/.."

DB=bandy_test
dropdb --if-exists "$DB"
createdb "$DB"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f tests/local_supabase_shim.sql
for f in reference/*.sql; do
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"
done
psql -v ON_ERROR_STOP=1 -d "$DB" -f tests/prototype_test.sql
