-- ==============================================================================
-- HRMS STAGING DATABASE FOUNDATION SEED SCRIPT
-- Seeds minimum business foundation for staging validation:
-- 1 Tenant, 1 Company, 2 Branches, Standard Departments, Shifts
-- Target Project: ylfpyugoxxxyjglyppcn (STAGING)
-- ==============================================================================

BEGIN;

-- 1. Tenant
INSERT INTO public.hr_tenants (id, name, created_by, created_at)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'مجموعة أكمي القابضة - Acme Holding Group',
  '00000000-0000-0000-0000-000000000000',
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- 2. Company Profile
INSERT INTO public.hr_company_profiles (
  id, tenant_id, profile, version, updated_at, updated_by
) VALUES (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  '{
    "company_code": "COMP-01",
    "name_ar": "شركة أكمي للحلول المتطورة",
    "name_en": "Acme Advanced Solutions LLC",
    "cr_number": "1010123456",
    "tax_number": "300123456700003",
    "gosi_number": "987654321",
    "mol_number": "7-123456",
    "country": "SA",
    "city": "Riyadh",
    "is_active": true
  }'::jsonb,
  1,
  NOW(),
  '00000000-0000-0000-0000-000000000000'
) ON CONFLICT (id) DO NOTHING;

-- 3. Branches (Riyadh HQ & Jeddah Branch)
INSERT INTO public.org_branches (
  id, tenant_id, company_id, code, name_ar, name_en,
  city, active, effective_from, created_at, updated_at
) VALUES 
(
  '33333333-3333-3333-3333-333333333331',
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'BR-RUH',
  'المركز الرئيسي - الرياض',
  'Headquarters - Riyadh',
  'Riyadh',
  true,
  CURRENT_DATE,
  NOW(),
  NOW()
),
(
  '33333333-3333-3333-3333-333333333332',
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'BR-JED',
  'فرع جدة',
  'Jeddah Regional Branch',
  'Jeddah',
  true,
  CURRENT_DATE,
  NOW(),
  NOW()
) ON CONFLICT (company_id, code) DO NOTHING;

-- 4. Departments
INSERT INTO public.org_departments (
  id, tenant_id, company_id, branch_id, code, name_ar, name_en,
  level, active, effective_from, created_at, updated_at
) VALUES
(
  '44444444-4444-4444-4444-444444444441',
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333331',
  'DEPT-HR',
  'إدارة الموارد البشرية',
  'Human Resources Department',
  'department',
  true,
  CURRENT_DATE,
  NOW(),
  NOW()
),
(
  '44444444-4444-4444-4444-444444444442',
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333331',
  'DEPT-FIN',
  'الإدارة المالية والمحاسبة',
  'Finance & Accounting Department',
  'department',
  true,
  CURRENT_DATE,
  NOW(),
  NOW()
),
(
  '44444444-4444-4444-4444-444444444443',
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333331',
  'DEPT-ENG',
  'إدارة الهندسة والتقنية',
  'Engineering & Technology Department',
  'department',
  true,
  CURRENT_DATE,
  NOW(),
  NOW()
) ON CONFLICT (company_id, code) DO NOTHING;

-- 5. Standard Shifts
INSERT INTO public.work_shift_groups (
  id, name, branch, work_days, start_time, end_time,
  break_minutes, grace_minutes, active, notes, created_at, updated_at
) VALUES (
  '55555555-5555-5555-5555-555555555551',
  'الوردية الصباحية المعتادة (8-4)',
  'المركز الرئيسي - الرياض',
  5,
  '08:00:00',
  '16:00:00',
  60,
  15,
  true,
  'وردية العمل الرسمية للمركز الرئيسي',
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

COMMIT;
