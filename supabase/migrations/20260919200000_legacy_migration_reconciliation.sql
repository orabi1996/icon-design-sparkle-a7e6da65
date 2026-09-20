-- ============================================================================
-- Migration: 20260919200000_legacy_migration_reconciliation.sql
-- Description: Controlled Legacy Data Migration and Reconciliation Engine
-- Supports 12 HRMS entities, 9 phases, 6 row classification states,
-- financial zero-tolerance reconciliation, and atomic idempotency/rollback.
-- ============================================================================

BEGIN;

-- 1. Migration Batches
CREATE TABLE IF NOT EXISTS public.migration_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.hr_tenants(id),
  company_id uuid NOT NULL,
  source text NOT NULL CHECK (length(btrim(source)) > 0),
  entity text NOT NULL CHECK (entity IN (
    'employees', 'departments', 'branches', 'managers',
    'contracts', 'leaves', 'loans', 'attendance',
    'fingerprint', 'payroll_archive', 'documents', 'requests'
  )),
  status text NOT NULL CHECK (status IN (
    'extracted', 'normalized', 'validated', 'matched',
    'previewed', 'reconciled', 'approved', 'importing',
    'completed', 'partially_completed', 'failed', 'rolled_back'
  )),
  initiated_by uuid REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  row_count integer NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  success_count integer NOT NULL DEFAULT 0 CHECK (success_count >= 0),
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  checksum text NOT NULL CHECK (length(btrim(checksum)) > 0),
  override_reason text,
  financial_total_before bigint NOT NULL DEFAULT 0,
  financial_total_after bigint NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (company_id, tenant_id) REFERENCES public.hr_company_profiles(id, tenant_id)
);

CREATE INDEX IF NOT EXISTS migration_batches_tenant_idx ON public.migration_batches(tenant_id, company_id, entity, status);
CREATE INDEX IF NOT EXISTS migration_batches_created_idx ON public.migration_batches(created_at DESC);

-- 2. Migration Row Items
CREATE TABLE IF NOT EXISTS public.migration_row_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.migration_batches(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.hr_tenants(id),
  company_id uuid NOT NULL,
  entity text NOT NULL,
  legacy_id text NOT NULL CHECK (length(btrim(legacy_id)) > 0),
  source_row_index integer NOT NULL CHECK (source_row_index >= 0),
  classification text NOT NULL CHECK (classification IN (
    'MATCHED', 'AMBIGUOUS', 'UNMATCHED', 'INVALID', 'DUPLICATE', 'ALREADY_MIGRATED'
  )),
  stable_identifier text,
  raw_data jsonb NOT NULL,
  normalized_data jsonb,
  target_id uuid,
  checksum text NOT NULL,
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  matching_notes text,
  financial_amount bigint NOT NULL DEFAULT 0,
  migrated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (company_id, tenant_id) REFERENCES public.hr_company_profiles(id, tenant_id)
);

CREATE INDEX IF NOT EXISTS migration_row_items_batch_class_idx ON public.migration_row_items(batch_id, classification);
CREATE INDEX IF NOT EXISTS migration_row_items_lookup_idx ON public.migration_row_items(tenant_id, company_id, entity, legacy_id);

-- 3. Legacy Migration Mappings (Permanent Idempotency & Rollback Index)
CREATE TABLE IF NOT EXISTS public.legacy_migration_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.hr_tenants(id),
  company_id uuid NOT NULL,
  entity text NOT NULL CHECK (entity IN (
    'employees', 'departments', 'branches', 'managers',
    'contracts', 'leaves', 'loans', 'attendance',
    'fingerprint', 'payroll_archive', 'documents', 'requests'
  )),
  legacy_id text NOT NULL CHECK (length(btrim(legacy_id)) > 0),
  migrated_id uuid NOT NULL,
  batch_id uuid NOT NULL REFERENCES public.migration_batches(id),
  checksum text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, company_id, entity, legacy_id),
  FOREIGN KEY (company_id, tenant_id) REFERENCES public.hr_company_profiles(id, tenant_id)
);

CREATE INDEX IF NOT EXISTS legacy_migration_mappings_lookup_idx ON public.legacy_migration_mappings(tenant_id, company_id, entity, legacy_id);
CREATE INDEX IF NOT EXISTS legacy_migration_mappings_batch_idx ON public.legacy_migration_mappings(batch_id);

-- 4. Enable Row Level Security & Isolation Policies
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'migration_batches',
    'migration_row_items',
    'legacy_migration_mappings'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);

    -- Scoped Read: Tenant members with management rights
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_read ON public.%I;', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_tenant_read ON public.%I FOR SELECT TO authenticated USING (
      public.hr_can_manage_tenant(tenant_id)
    );', tbl, tbl);

    -- Scoped Write: Tenant managers only
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_write ON public.%I;', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_tenant_write ON public.%I FOR ALL TO authenticated USING (
      public.hr_can_manage_tenant(tenant_id)
    ) WITH CHECK (
      public.hr_can_manage_tenant(tenant_id)
    );', tbl, tbl);

    EXECUTE format('REVOKE ALL ON public.%I FROM anon, PUBLIC;', tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated;', tbl);
    EXECUTE format('GRANT ALL ON public.%I TO service_role;', tbl);
  END LOOP;
END $$;

COMMIT;
