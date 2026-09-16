\set ON_ERROR_STOP on
INSERT INTO public.hr_tenants(id,name,created_by) VALUES('11111111-1111-4111-8111-111111111111','Disposable CI company','00000000-0000-0000-0000-000000000001');
INSERT INTO public.hr_tenant_memberships VALUES
('11111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000001','owner',now()),
('11111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000002','viewer',now());
INSERT INTO public.hr_company_profiles(id,tenant_id,profile,version,updated_at,updated_by)
VALUES('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','{"companyNameAr":"Test"}',1,now(),'00000000-0000-0000-0000-000000000001');
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
DO $$ BEGIN
  IF has_table_privilege('authenticated','public.m08_workspaces','SELECT') OR has_table_privilege('authenticated','public.m08_raw_events','UPDATE')
    OR has_function_privilege('authenticated','public.m08_commit(uuid,uuid,text,bigint,uuid,text,jsonb,jsonb,jsonb,jsonb)','EXECUTE')
    OR has_table_privilege('authenticated','public.fingerprint_records','UPDATE') THEN
    RAISE EXCEPTION 'The authenticated role may access protected state/commit'; END IF;
END $$;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.fingerprint_records) <> 1 THEN RAISE EXCEPTION 'Admin could not review original legacy scan'; END IF;
END $$;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
DO $$ BEGIN
  IF (SELECT count(*) FROM public.fingerprint_records) <> 0 THEN RAISE EXCEPTION 'Non-admin viewed legacy scans'; END IF;
  IF has_table_privilege('authenticated','public.fingerprint_records','INSERT') OR has_table_privilege('authenticated','public.fingerprint_records','DELETE') THEN
    RAISE EXCEPTION 'Non-admin could mutate original scans'; END IF;
END $$;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
SELECT public.m08_save_access('22222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000001',
 '[{"actions":["configure","draft","approve","publish","read","import","export","audit"],"fields":["cost"],"branch":"A"}]','{manager}',
 now()-interval '1 hour',null,0,'staging acceptance bootstrap');
DO $$ BEGIN
  BEGIN PERFORM public.m08_save_access('22222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000001',
    '[]','{}',now(),null,0,'stale access attempt'); RAISE EXCEPTION 'Stale access was accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
  BEGIN UPDATE public.fingerprint_records SET punch_at=now(); RAISE EXCEPTION 'Legacy scan replaced'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF (SELECT punch_at FROM public.fingerprint_records WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> '2026-10-05T08:00:00Z' THEN RAISE EXCEPTION 'Original punch changed'; END IF;
END $$;
SET ROLE service_role;
DO $$ BEGIN
  IF (public.m08_actor_context('22222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000001')->'grants'->0->'actions') IS NULL THEN
    RAISE EXCEPTION 'Authorized actor context missing'; END IF;
  IF jsonb_array_length(public.m08_actor_context('22222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000002')->'grants') <> 0 THEN
    RAISE EXCEPTION 'Viewer inherited another actor grants'; END IF;
  BEGIN PERFORM public.m08_load('22222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000003');
    RAISE EXCEPTION 'Non-member read succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT public.m08_commit('22222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000001',
 (public.m08_actor_context('22222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000001')->>'etag'),0,
 '33333333-3333-4333-8333-333333333333',repeat('a',64),'{"schemaVersion":1,"shifts":[]}',
 '{"type":"roster.publish","reason":"CI sample"}','{"id":"test"}',
 '[{"id":"raw1","employeeId":"00000000-0000-0000-0000-000000000003","source":"device","sourceEventId":"zero01","at":"2026-10-05T08:00:00Z"}]');
DO $$ DECLARE r jsonb; BEGIN
  IF (SELECT revision FROM public.m08_workspaces WHERE company_id='22222222-2222-4222-8222-222222222222') <> 1
    OR (SELECT count(*) FROM public.m08_raw_events) <> 1 OR (SELECT count(*) FROM public.m08_audit) <> 1 THEN RAISE EXCEPTION 'Commit not atomic'; END IF;
  r := public.m08_commit('22222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000001',
    (public.m08_actor_context('22222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000001')->>'etag'),0,
    '33333333-3333-4333-8333-333333333333',repeat('a',64),'{"schemaVersion":1,"shifts":[]}', '{}','{}','[]');
  IF r->>'replayed' <> 'true' OR (SELECT count(*) FROM public.m08_audit) <> 1 THEN RAISE EXCEPTION 'Retry duplicated effect'; END IF;
  BEGIN PERFORM public.m08_commit('22222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000001',
    (public.m08_actor_context('22222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000001')->>'etag'),0,
    '44444444-4444-4444-8444-444444444444',repeat('b',64),'{"schemaVersion":1}', '{}','{}','[]');
    RAISE EXCEPTION 'Stale workspace revision accepted'; EXCEPTION WHEN serialization_failure THEN NULL; END;
  IF (SELECT revision FROM public.m08_workspaces WHERE company_id='22222222-2222-4222-8222-222222222222') <> 1 THEN RAISE EXCEPTION 'Stale write changed state'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  BEGIN UPDATE public.m08_audit SET event='{}'; RAISE EXCEPTION 'Audit update succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM public.m08_raw_events; RAISE EXCEPTION 'Raw deletion succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT 'M08 SQL permissions, CAS, idempotency, append-only evidence: PASS' AS result;
