#!/usr/bin/env bash
# Тесты прав SAT в локальном Postgres (без Supabase).
# Нужен Postgres 15+ и права создавать базы: bash supabase/tests/run.sh [имя_базы]
set -euo pipefail
export PGOPTIONS="-c client_min_messages=warning"
cd "$(dirname "$0")"
DB="${1:-sp_test}"
PSQL="psql -X -q -v ON_ERROR_STOP=1 -d $DB"
dropdb --if-exists "$DB" && createdb "$DB"
psql -X -q -d "$DB" -f supabase-stub.sql 2>&1 | grep -v pg_cron | grep -i error || true
# 1) база как в Supabase, 2) админ и ученик, 3) повторный запуск = обновление рабочей базы
$PSQL -f ../setup-all.sql > /dev/null 2>&1 || $PSQL -f ../setup-all.sql
$PSQL -f seed.sql
$PSQL -c "update profiles set role='admin', student_id=null where id='00000000-0000-0000-0000-00000000000a'"
$PSQL -c "delete from enrollments"
$PSQL -f ../setup-all.sql > /dev/null
$PSQL -tA -f sat-1-rights.sql | tail -1
$PSQL -tA -f sat-2-rights.sql | tail -1
$PSQL -tA -f sat-3-rights.sql | tail -1
