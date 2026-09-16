#!/usr/bin/env bash
set -euo pipefail
# Disposable PostgreSQL CI service; two independent psql connections race on revision 1.
test_ci_dir="$(mktemp -d)"
trap 'rm -rf "$test_ci_dir"' EXIT
psql -v ON_ERROR_STOP=1 -q >"$test_ci_dir/first.log" 2>&1 <<'SQL' &
BEGIN;
SET ROLE service_role;
SELECT pg_advisory_xact_lock(hashtextextended('m08:22222222-2222-4222-8222-222222222222',0));
SELECT pg_sleep(1);
SELECT public.m08_commit('22222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000001',
  public.m08_actor_context('22222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000001')->>'etag',1,
  '55555555-5555-4555-8555-555555555555',repeat('c',64),'{"schemaVersion":1,"winner":"first"}','{"type":"roster.assign"}','{}','[]');
COMMIT;
SQL
test_ci_first=$!
sleep 0.2
if psql -v ON_ERROR_STOP=1 -q >"$test_ci_dir/second.log" 2>&1 <<'SQL'
SET ROLE service_role;
SELECT public.m08_commit('22222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000001',
  public.m08_actor_context('22222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000001')->>'etag',1,
  '66666666-6666-4666-8666-666666666666',repeat('d',64),'{"schemaVersion":1,"winner":"second"}','{"type":"roster.assign"}','{}','[]');
SQL
then
  echo 'Parallel stale writer incorrectly succeeded'
  exit 1
fi
wait "$test_ci_first"
if ! grep -q 'VERSION_STALE' "$test_ci_dir/second.log"; then
  cat "$test_ci_dir/second.log"
  exit 1
fi
psql -v ON_ERROR_STOP=1 -At <<'SQL' | grep -Fxq 'PASS'
SELECT CASE WHEN revision=2 AND state->>'winner'='first' AND (SELECT count(*) FROM public.m08_audit)=2
  THEN 'PASS' ELSE 'FAIL' END FROM public.m08_workspaces
WHERE company_id='22222222-2222-4222-8222-222222222222';
SQL
echo 'Parallel compare-and-swap prevented lost update: PASS'
