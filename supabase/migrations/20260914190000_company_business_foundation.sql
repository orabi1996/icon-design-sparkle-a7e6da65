-- Additive foundation. Does NOT assign or migrate legacy employees/loans to a tenant.
-- Apply on staging first; UI stays disabled until VITE_COMPANY_BUSINESS_ENABLED=true.
BEGIN;

CREATE TABLE public.hr_tenants (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.hr_tenant_memberships (
  tenant_id uuid NOT NULL REFERENCES public.hr_tenants(id),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX hr_tenant_memberships_user_idx ON public.hr_tenant_memberships(user_id, tenant_id);

CREATE TABLE public.hr_company_profiles (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.hr_tenants(id),
  profile jsonb NOT NULL CHECK (jsonb_typeof(profile) = 'object'),
  version integer NOT NULL CHECK (version > 0),
  updated_at timestamptz NOT NULL,
  updated_by uuid NOT NULL,
  UNIQUE (id, tenant_id)
);

CREATE TABLE public.hr_company_versions (
  company_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  profile jsonb NOT NULL,
  effective_from timestamptz NOT NULL,
  changed_by uuid NOT NULL,
  change_reason text NOT NULL,
  request_id uuid NOT NULL,
  PRIMARY KEY (company_id, version),
  UNIQUE (company_id, request_id),
  FOREIGN KEY (company_id, tenant_id) REFERENCES public.hr_company_profiles(id, tenant_id)
);

CREATE TABLE public.hr_business_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.hr_tenants(id),
  company_id uuid NOT NULL,
  event_type text NOT NULL,
  schema_version integer NOT NULL DEFAULT 1,
  actor_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  effective_at timestamptz NOT NULL,
  correlation_id uuid NOT NULL,
  payload jsonb NOT NULL,
  UNIQUE (company_id, correlation_id),
  FOREIGN KEY (company_id, tenant_id) REFERENCES public.hr_company_profiles(id, tenant_id)
);

CREATE FUNCTION public.hr_is_tenant_member(p_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.hr_tenant_memberships
    WHERE tenant_id = p_tenant_id AND user_id = auth.uid()
  )
$$;

CREATE FUNCTION public.hr_can_manage_tenant(p_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.hr_tenant_memberships
    WHERE tenant_id = p_tenant_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
  )
$$;
REVOKE ALL ON FUNCTION public.hr_is_tenant_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_can_manage_tenant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_is_tenant_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_can_manage_tenant(uuid) TO authenticated, service_role;

ALTER TABLE public.hr_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_company_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_company_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_business_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY hr_tenants_member_read ON public.hr_tenants
FOR SELECT TO authenticated USING (public.hr_is_tenant_member(id));
CREATE POLICY hr_memberships_own_read ON public.hr_tenant_memberships
FOR SELECT TO authenticated USING (user_id = auth.uid());
-- Statutory IDs/contact fields are not exposed to viewer members.
CREATE POLICY hr_profiles_admin_read ON public.hr_company_profiles
FOR SELECT TO authenticated USING (public.hr_can_manage_tenant(tenant_id));
CREATE POLICY hr_versions_admin_read ON public.hr_company_versions
FOR SELECT TO authenticated USING (public.hr_can_manage_tenant(tenant_id));
CREATE POLICY hr_events_admin_read ON public.hr_business_events
FOR SELECT TO authenticated USING (public.hr_can_manage_tenant(tenant_id));

-- Deliberately owner-executed projection: explicit membership predicate and a strict
-- field allowlist expose display names ONLY, not the private JSON profile.
CREATE VIEW public.hr_company_directory WITH (security_barrier = true) AS
SELECT c.id, c.tenant_id, t.name AS tenant_name,
       c.profile->>'companyNameAr' AS display_name,
       c.profile->>'companyNameEn' AS display_name_en,
       c.profile->>'countryCode' AS country_code,
       c.version, c.updated_at,
       public.hr_can_manage_tenant(c.tenant_id) AS can_manage
FROM public.hr_company_profiles c
JOIN public.hr_tenants t ON t.id = c.tenant_id
WHERE public.hr_is_tenant_member(c.tenant_id);

REVOKE ALL ON public.hr_tenants, public.hr_tenant_memberships,
  public.hr_company_profiles, public.hr_company_versions, public.hr_business_events,
  public.hr_company_directory FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.hr_tenants, public.hr_tenant_memberships,
  public.hr_company_profiles, public.hr_company_versions, public.hr_business_events,
  public.hr_company_directory TO authenticated;
-- No direct application INSERT/UPDATE/DELETE grants. All writes use the checked RPC.

CREATE FUNCTION public.hr_reject_history_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '42501',
    MESSAGE = 'سجل التغييرات والأحداث غير قابل للتعديل أو الحذف';
END $$;
CREATE TRIGGER hr_company_versions_immutable BEFORE UPDATE OR DELETE
ON public.hr_company_versions FOR EACH ROW EXECUTE FUNCTION public.hr_reject_history_change();
CREATE TRIGGER hr_business_events_immutable BEFORE UPDATE OR DELETE
ON public.hr_business_events FOR EACH ROW EXECUTE FUNCTION public.hr_reject_history_change();

CREATE FUNCTION public.save_hr_company_profile(
  p_tenant_id uuid,
  p_company_id uuid,
  p_profile jsonb,
  p_expected_version integer,
  p_change_reason text,
  p_request_id uuid,
  p_new_tenant_name text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_fields text[] := ARRAY[
    'companyNameAr','companyNameEn','countryCode','currency','timezone',
    'crNumber','unified700Number','vatNumber','gosiEstNumber','molEstNumber',
    'chamberNumber','activityType','establishmentDate','city','district',
    'street','buildingNo','postalCode','additionalNo','phone','email',
    'website','generalManager','hrManager','financeManager'
  ];
  v_key text;
  v_value text;
  v_profile jsonb := '{}'::jsonb;
  v_current_version integer;
  v_saved public.hr_company_profiles%ROWTYPE;
  v_receipt public.hr_company_versions%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'تسجيل الدخول مطلوب';
  END IF;
  IF p_tenant_id IS NULL OR p_company_id IS NULL OR p_request_id IS NULL
     OR p_expected_version IS NULL OR p_expected_version < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'معرّف أو إصدار الطلب غير صحيح';
  END IF;
  IF p_profile IS NULL OR jsonb_typeof(p_profile) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'بيانات الشركة غير صحيحة';
  END IF;
  IF p_change_reason IS NULL OR length(btrim(p_change_reason)) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'سبب التغيير مطلوب (3 إلى 500 حرف)';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_profile) AS k(key) WHERE NOT k.key = ANY(v_fields)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'توجد حقول غير مسموح بها';
  END IF;
  FOREACH v_key IN ARRAY v_fields LOOP
    IF p_profile ? v_key AND jsonb_typeof(p_profile->v_key) <> 'string' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'نوع الحقل غير صحيح: ' || v_key;
    END IF;
    v_value := btrim(coalesce(p_profile->>v_key, ''));
    IF length(v_value) > 500 OR v_value ~ '[[:cntrl:]]' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'قيمة الحقل غير صحيحة: ' || v_key;
    END IF;
    v_profile := v_profile || jsonb_build_object(v_key, v_value);
  END LOOP;
  IF v_profile->>'companyNameAr' = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'اسم الشركة بالعربية مطلوب';
  END IF;
  IF v_profile->>'countryCode' !~ '^[A-Z]{2}$' OR v_profile->>'currency' !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'الدولة أو العملة غير صحيحة';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = v_profile->>'timezone') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'المنطقة الزمنية غير صحيحة';
  END IF;
  IF v_profile->>'email' <> '' AND v_profile->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'البريد الإلكتروني غير صحيح';
  END IF;
  IF v_profile->>'website' <> '' AND v_profile->>'website' !~ '^https?://[^[:space:]/@]+([/?#][^[:space:]]*)?$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'رابط الموقع غير صحيح';
  END IF;
  IF v_profile->>'establishmentDate' <> '' THEN
    IF v_profile->>'establishmentDate' !~ '^\d{4}-\d{2}-\d{2}$'
       OR to_char((v_profile->>'establishmentDate')::date, 'YYYY-MM-DD') <> v_profile->>'establishmentDate' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'تاريخ التأسيس غير صحيح';
    END IF;
  END IF;

  -- Serializes config writes within a tenant, including first creation and retries.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tenant_id::text, 0));
  IF NOT EXISTS (SELECT 1 FROM public.hr_tenants WHERE id = p_tenant_id) THEN
    IF NOT public.is_permissions_admin() OR p_expected_version <> 0
       OR p_new_tenant_name IS NULL OR length(btrim(p_new_tenant_name)) NOT BETWEEN 1 AND 200 THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'إنشاء مساحة عميل يتطلب مدير النظام واسم المجموعة';
    END IF;
    INSERT INTO public.hr_tenants(id, name, created_by) VALUES (p_tenant_id, btrim(p_new_tenant_name), v_actor);
    INSERT INTO public.hr_tenant_memberships(tenant_id, user_id, role) VALUES (p_tenant_id, v_actor, 'owner');
  END IF;
  IF NOT public.hr_can_manage_tenant(p_tenant_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'غير مصرح لك بإدارة هذه الشركة';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hr_company_profiles WHERE id = p_company_id AND tenant_id <> p_tenant_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'معرّف الشركة غير متاح في هذه المساحة';
  END IF;

  SELECT * INTO v_receipt FROM public.hr_company_versions
  WHERE company_id = p_company_id AND request_id = p_request_id;
  IF FOUND THEN
    IF v_receipt.changed_by <> v_actor OR v_receipt.profile <> v_profile
       OR v_receipt.change_reason <> btrim(p_change_reason)
       OR v_receipt.version <> p_expected_version + 1 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'مفتاح المحاولة مستخدم لطلب مختلف';
    END IF;
    RETURN jsonb_build_object('id', p_company_id, 'tenant_id', p_tenant_id,
      'profile', v_receipt.profile, 'version', v_receipt.version,
      'updated_at', v_receipt.effective_from, 'updated_by', v_actor);
  END IF;

  SELECT version INTO v_current_version FROM public.hr_company_profiles
  WHERE id = p_company_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF coalesce(v_current_version, 0) <> p_expected_version THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'عدّل مستخدم آخر البيانات؛ أعد تحميل آخر نسخة قبل الحفظ';
  END IF;
  IF v_current_version IS NULL THEN
    INSERT INTO public.hr_company_profiles(id, tenant_id, profile, version, updated_at, updated_by)
    VALUES (p_company_id, p_tenant_id, v_profile, 1, v_now, v_actor)
    ON CONFLICT (id) DO NOTHING RETURNING * INTO v_saved;
  ELSE
    UPDATE public.hr_company_profiles
    SET profile = v_profile, version = version + 1, updated_at = v_now, updated_by = v_actor
    WHERE id = p_company_id AND tenant_id = p_tenant_id AND version = p_expected_version
    RETURNING * INTO v_saved;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'تعارض في الحفظ؛ أعد تحميل البيانات';
  END IF;

  INSERT INTO public.hr_company_versions(company_id, tenant_id, version, profile, effective_from,
    changed_by, change_reason, request_id)
  VALUES (p_company_id, p_tenant_id, v_saved.version, v_profile, v_now, v_actor, btrim(p_change_reason), p_request_id);
  INSERT INTO public.hr_business_events(tenant_id, company_id, event_type, actor_id,
    occurred_at, effective_at, correlation_id, payload)
  VALUES (p_tenant_id, p_company_id,
    CASE WHEN v_saved.version = 1 THEN 'company.created' ELSE 'company.profile.updated' END,
    v_actor, v_now, v_now, p_request_id, jsonb_build_object('version', v_saved.version));
  RETURN to_jsonb(v_saved);
END $$;

REVOKE ALL ON FUNCTION public.save_hr_company_profile(uuid, uuid, jsonb, integer, text, uuid, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_hr_company_profile(uuid, uuid, jsonb, integer, text, uuid, text)
TO authenticated;

COMMIT;
