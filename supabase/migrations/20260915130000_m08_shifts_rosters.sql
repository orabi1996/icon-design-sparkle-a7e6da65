-- M08 application aggregate. No anonymous/authenticated table writes or aggregate reads.
-- Depends on the additive company foundation migration; legacy data is not rewritten.
BEGIN;
CREATE TABLE public.m08_access (
  company_id uuid NOT NULL REFERENCES public.hr_company_profiles(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  grants jsonb NOT NULL CHECK (jsonb_typeof(grants) = 'array'),
  roles text[] NOT NULL DEFAULT '{}',
  valid_from timestamptz NOT NULL, valid_to timestamptz,
  version bigint NOT NULL DEFAULT 1,
  changed_by uuid NOT NULL, changed_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  PRIMARY KEY (company_id, user_id),
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);
CREATE TABLE public.m08_workspaces (
  company_id uuid PRIMARY KEY REFERENCES public.hr_company_profiles(id),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NOT NULL
);
CREATE TABLE public.m08_audit (
  company_id uuid NOT NULL REFERENCES public.hr_company_profiles(id),
  operation_id uuid NOT NULL,
  revision bigint NOT NULL,
  actor_id uuid NOT NULL,
  command_hash text NOT NULL,
  event jsonb NOT NULL,
  result jsonb,
  at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (company_id, operation_id), UNIQUE (company_id, revision)
);
CREATE TABLE public.m08_raw_events (
  company_id uuid NOT NULL REFERENCES public.hr_company_profiles(id),
  id text NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  source text NOT NULL, source_event_id text NOT NULL,
  event_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (company_id, id), UNIQUE (company_id, source, source_event_id)
);
CREATE INDEX m08_raw_employee_time ON public.m08_raw_events(company_id, employee_id, event_at);
CREATE INDEX m08_audit_time ON public.m08_audit(company_id, at DESC);
CREATE TABLE public.m08_access_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id uuid NOT NULL, user_id uuid NOT NULL, actor_id uuid NOT NULL,
  old_value jsonb, new_value jsonb, reason text NOT NULL, at timestamptz NOT NULL DEFAULT clock_timestamp()
);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['m08_access', 'm08_workspaces', 'm08_audit', 'm08_raw_events', 'm08_access_audit'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO service_role', t);
  END LOOP;
END $$;
CREATE TRIGGER m08_audit_immutable BEFORE UPDATE OR DELETE ON public.m08_audit
FOR EACH ROW EXECUTE FUNCTION public.hr_reject_history_change();
CREATE TRIGGER m08_raw_immutable BEFORE UPDATE OR DELETE ON public.m08_raw_events
FOR EACH ROW EXECUTE FUNCTION public.hr_reject_history_change();
CREATE TRIGGER m08_access_audit_immutable BEFORE UPDATE OR DELETE ON public.m08_access_audit
FOR EACH ROW EXECUTE FUNCTION public.hr_reject_history_change();

-- This function is service-only. Actor identity comes from verified getUser(), never a client payload.
CREATE FUNCTION public.m08_actor_context(p_company_id uuid, p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE m public.hr_tenant_memberships; a public.m08_access; grants jsonb; roles text[]; owner boolean;
BEGIN
  SELECT tm.* INTO m FROM public.hr_company_profiles cp JOIN public.hr_tenant_memberships tm ON tm.tenant_id = cp.tenant_id
    WHERE cp.id = p_company_id AND tm.user_id = p_actor_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'غير مصرح بالوصول إلى الشركة'; END IF;
  owner := m.role IN ('owner', 'admin');
  SELECT * INTO a FROM public.m08_access WHERE company_id = p_company_id AND user_id = p_actor_id AND valid_from <= now() AND (valid_to IS NULL OR valid_to > now());
  grants := coalesce(a.grants, '[]'); roles := coalesce(a.roles, '{}');
  IF owner THEN grants := grants || '[{"actions":["access"],"fields":[]}]'::jsonb; END IF;
  RETURN jsonb_build_object('id', p_actor_id, 'grants', grants, 'roles', roles, 'canManageAccess', owner,
    'etag', md5(jsonb_build_object('member', to_jsonb(m), 'access', to_jsonb(a))::text));
END $$;

CREATE FUNCTION public.m08_load(p_company_id uuid, p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE actor jsonb; w public.m08_workspaces;
BEGIN
  actor := public.m08_actor_context(p_company_id, p_actor_id);
  SELECT * INTO w FROM public.m08_workspaces WHERE company_id = p_company_id;
  RETURN jsonb_build_object('actor', actor, 'revision', coalesce(w.revision, 0), 'state', w.state,
    'punches', coalesce((SELECT jsonb_agg(payload ORDER BY event_at, id) FROM public.m08_raw_events WHERE company_id = p_company_id), '[]'),
    'audit', coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY revision DESC) FROM (SELECT revision, actor_id, at, event FROM public.m08_audit WHERE company_id = p_company_id ORDER BY revision DESC LIMIT 200) x), '[]'));
END $$;

CREATE FUNCTION public.m08_commit(p_company_id uuid, p_actor_id uuid, p_access_etag text, p_expected_revision bigint,
  p_operation_id uuid, p_command_hash text, p_state jsonb, p_event jsonb, p_result jsonb, p_raw_events jsonb DEFAULT '[]')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE actor jsonb; current_revision bigint; receipt public.m08_audit; p jsonb; prior jsonb;
BEGIN
  IF p_operation_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision < 0 OR p_command_hash IS NULL OR length(p_command_hash) <> 64
     OR p_state IS NULL OR jsonb_typeof(p_state) <> 'object' OR p_state->>'schemaVersion' <> '1'
     OR p_state ? 'punches' OR pg_column_size(p_state) > 20000000 OR jsonb_typeof(p_raw_events) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'طلب حفظ غير صحيح';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('m08:' || p_company_id::text, 0));
  actor := public.m08_actor_context(p_company_id, p_actor_id);
  IF actor->>'etag' IS DISTINCT FROM p_access_etag THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'تغيرت صلاحيات المستخدم؛ أعد فتح الشاشة'; END IF;
  SELECT * INTO receipt FROM public.m08_audit WHERE company_id = p_company_id AND operation_id = p_operation_id;
  IF FOUND THEN
    IF receipt.actor_id <> p_actor_id OR receipt.command_hash <> p_command_hash THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'معرف العملية مستخدم ببيانات مختلفة'; END IF;
    RETURN jsonb_build_object('revision', receipt.revision, 'result', receipt.result, 'replayed', true);
  END IF;
  SELECT revision INTO current_revision FROM public.m08_workspaces WHERE company_id = p_company_id FOR UPDATE;
  current_revision := coalesce(current_revision, 0);
  IF current_revision <> p_expected_revision THEN RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'VERSION_STALE: تغيرت البيانات؛ حدّث النسخة وراجع الفروق'; END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(p_raw_events) LOOP
    SELECT payload INTO prior FROM public.m08_raw_events WHERE company_id = p_company_id AND source = p->>'source' AND source_event_id = p->>'sourceEventId';
    IF FOUND THEN
      IF prior IS DISTINCT FROM p THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'لا يمكن استبدال بصمة خام'; END IF;
    ELSE
      INSERT INTO public.m08_raw_events(company_id,id,employee_id,source,source_event_id,event_at,payload)
      VALUES(p_company_id,p->>'id',(p->>'employeeId')::uuid,p->>'source',p->>'sourceEventId',(p->>'at')::timestamptz,p);
    END IF;
  END LOOP;
  INSERT INTO public.m08_workspaces(company_id,revision,state,updated_by) VALUES(p_company_id,current_revision+1,p_state,p_actor_id)
  ON CONFLICT(company_id) DO UPDATE SET revision = excluded.revision, state = excluded.state, updated_by = excluded.updated_by, updated_at = clock_timestamp();
  INSERT INTO public.m08_audit(company_id,operation_id,revision,actor_id,command_hash,event,result)
  VALUES(p_company_id,p_operation_id,current_revision+1,p_actor_id,p_command_hash,p_event,p_result);
  RETURN jsonb_build_object('revision', current_revision+1, 'result', p_result, 'replayed', false);
END $$;

CREATE FUNCTION public.m08_save_access(p_company_id uuid, p_user_id uuid, p_grants jsonb, p_roles text[],
  p_valid_from timestamptz, p_valid_to timestamptz, p_expected_version bigint, p_reason text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE old public.m08_access; c uuid; g jsonb; v bigint;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'تسجيل الدخول مطلوب'; END IF;
  SELECT tenant_id INTO c FROM public.hr_company_profiles WHERE id = p_company_id;
  IF NOT public.hr_can_manage_tenant(c) THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'إدارة صلاحيات الشركة غير متاحة'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.hr_tenant_memberships WHERE tenant_id = c AND user_id = p_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'المستخدم ليس عضوًا في الشركة'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 OR p_grants IS NULL OR jsonb_typeof(p_grants) <> 'array' OR jsonb_array_length(p_grants) > 100 OR p_valid_from IS NULL OR (p_valid_to IS NOT NULL AND p_valid_to <= p_valid_from) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'بيانات الصلاحيات غير صحيحة'; END IF;
  FOR g IN SELECT value FROM jsonb_array_elements(p_grants) LOOP
    IF jsonb_typeof(g->'actions') <> 'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(g->'actions') a WHERE a NOT IN
      ('read','configure','link','draft','import','approve','publish','revise','exception','request','request_approve','punch','correct','leave','recalculate','attendance_approve','attendance_reopen','payroll','payroll_close','export','audit','notify','access'))
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(g) k WHERE k NOT IN ('actions','fields','employeeId','branch','department','team')) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'حقول أو إجراءات صلاحية غير مسموحة'; END IF;
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtextextended('m08:' || p_company_id::text, 0));
  SELECT * INTO old FROM public.m08_access WHERE company_id=p_company_id AND user_id=p_user_id FOR UPDATE;
  IF coalesce(old.version,0) <> p_expected_version THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='تغير إصدار الصلاحيات'; END IF;
  v := coalesce(old.version,0)+1;
  INSERT INTO public.m08_access(company_id,user_id,grants,roles,valid_from,valid_to,version,changed_by,reason)
  VALUES(p_company_id,p_user_id,p_grants,p_roles,p_valid_from,p_valid_to,v,auth.uid(),p_reason)
  ON CONFLICT(company_id,user_id) DO UPDATE SET grants=excluded.grants,roles=excluded.roles,valid_from=excluded.valid_from,valid_to=excluded.valid_to,version=excluded.version,changed_by=excluded.changed_by,reason=excluded.reason,changed_at=clock_timestamp();
  INSERT INTO public.m08_access_audit(company_id,user_id,actor_id,old_value,new_value,reason)
  SELECT p_company_id,p_user_id,auth.uid(),to_jsonb(old),to_jsonb(a),p_reason FROM public.m08_access a WHERE a.company_id=p_company_id AND a.user_id=p_user_id;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.m08_actor_context(uuid,uuid), public.m08_load(uuid,uuid),
  public.m08_commit(uuid,uuid,text,bigint,uuid,text,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.m08_actor_context(uuid,uuid), public.m08_load(uuid,uuid),
  public.m08_commit(uuid,uuid,text,bigint,uuid,text,jsonb,jsonb,jsonb,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.m08_save_access(uuid,uuid,jsonb,text[],timestamptz,timestamptz,bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.m08_save_access(uuid,uuid,jsonb,text[],timestamptz,timestamptz,bigint,text) TO authenticated;
COMMIT;
