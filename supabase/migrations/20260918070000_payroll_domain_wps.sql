-- Migration: 20260918070000_payroll_domain_wps.sql
-- PROMPT 7: Payroll Domain, Component Engine, Deterministic Server Calculation, Immutability & Reopening Rules, and SAMA WPS Bank File Export Adapter.

BEGIN;

-- 1. Payroll Periods (Full lifecycle: draft -> calculated -> review -> approved -> locked -> posted -> paid -> closed)
CREATE TABLE IF NOT EXISTS public.payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.hr_company_profiles(id),
  code text NOT NULL,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  period_type text NOT NULL DEFAULT 'regular' CHECK (period_type IN ('regular', 'off_cycle', 'settlement', 'adjustment')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  cutoff_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'collecting', 'calculated', 'review', 'approved', 'locked', 'posted', 'paid', 'closed', 'cancelled')),
  calculation_version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, year, month, period_type)
);

CREATE INDEX IF NOT EXISTS idx_payroll_periods_lookup ON public.payroll_periods(company_id, year, month, status);

-- 2. Enhance payroll_runs Additively
ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS period_id uuid REFERENCES public.payroll_periods(id),
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.hr_company_profiles(id),
  ADD COLUMN IF NOT EXISTS run_number text,
  ADD COLUMN IF NOT EXISTS run_type text NOT NULL DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'SAR',
  ADD COLUMN IF NOT EXISTS rounding_mode text NOT NULL DEFAULT 'half_even',
  ADD COLUMN IF NOT EXISTS formula_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS inputs_hash text,
  ADD COLUMN IF NOT EXISTS results_hash text,
  ADD COLUMN IF NOT EXISTS total_basic numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_allowances numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_social_insurance numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_payroll_runs_period ON public.payroll_runs(period_id, status);

-- 3. Salary & Compensation Components (Versioned catalog)
CREATE TABLE IF NOT EXISTS public.payroll_salary_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.hr_company_profiles(id),
  code text NOT NULL,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  component_type text NOT NULL CHECK (component_type IN ('earning', 'deduction', 'company_contribution')),
  category text NOT NULL CHECK (category IN ('basic', 'fixed_allowance', 'variable_earning', 'overtime', 'statutory_deduction', 'absence_deduction', 'late_deduction', 'leave_deduction', 'loan_installment', 'manual_adjustment', 'other')),
  is_taxable boolean NOT NULL DEFAULT false,
  is_social_insurance_applicable boolean NOT NULL DEFAULT false,
  calculation_type text NOT NULL DEFAULT 'fixed' CHECK (calculation_type IN ('fixed', 'formula', 'rate_x_units', 'percentage_of_basic', 'statutory')),
  formula_expression text,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_salary_components_code ON public.payroll_salary_components(company_id, code, is_active);

-- 4. Payroll Input Snapshot (Every employee input carries source, source_id, source_version)
CREATE TABLE IF NOT EXISTS public.payroll_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.hr_company_profiles(id),
  run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  component_code text NOT NULL,
  component_type text NOT NULL CHECK (component_type IN ('earning', 'deduction', 'company_contribution')),
  amount numeric(15,2) NOT NULL DEFAULT 0,
  units numeric(10,2) NOT NULL DEFAULT 0,
  rate numeric(15,2) NOT NULL DEFAULT 0,
  source text NOT NULL CHECK (source IN ('contract', 'attendance', 'leave', 'loan', 'manual_adjustment', 'statutory')),
  source_id text,
  source_version integer NOT NULL DEFAULT 1,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_inputs_run_emp ON public.payroll_inputs(run_id, employee_id, component_code);

-- 5. Payroll Results (Deterministic calculation results per employee)
CREATE TABLE IF NOT EXISTS public.payroll_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.hr_company_profiles(id),
  run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  employee_name text NOT NULL,
  emp_no text NOT NULL,
  is_saudi boolean NOT NULL DEFAULT false,
  bank_code text,
  iban text,
  basic_salary numeric(15,2) NOT NULL DEFAULT 0,
  housing_allowance numeric(15,2) NOT NULL DEFAULT 0,
  transport_allowance numeric(15,2) NOT NULL DEFAULT 0,
  other_allowances numeric(15,2) NOT NULL DEFAULT 0,
  gross_salary numeric(15,2) NOT NULL DEFAULT 0,
  late_deductions numeric(15,2) NOT NULL DEFAULT 0,
  absence_deductions numeric(15,2) NOT NULL DEFAULT 0,
  leave_deductions numeric(15,2) NOT NULL DEFAULT 0,
  loan_deductions numeric(15,2) NOT NULL DEFAULT 0,
  social_insurance_employee numeric(15,2) NOT NULL DEFAULT 0,
  social_insurance_company numeric(15,2) NOT NULL DEFAULT 0,
  manual_adjustments numeric(15,2) NOT NULL DEFAULT 0,
  total_deductions numeric(15,2) NOT NULL DEFAULT 0,
  net_salary numeric(15,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SAR',
  calculation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'calculated' CHECK (status IN ('calculated', 'verified', 'error', 'locked', 'adjusted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_payroll_results_run ON public.payroll_results(run_id, status);

-- 6. Payroll Adjustments (Versioned post-close adjustments & reversals)
CREATE TABLE IF NOT EXISTS public.payroll_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.hr_company_profiles(id),
  run_id uuid NOT NULL REFERENCES public.payroll_runs(id),
  target_run_id uuid REFERENCES public.payroll_runs(id),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  original_result_id uuid REFERENCES public.payroll_results(id),
  adjustment_type text NOT NULL CHECK (adjustment_type IN ('reversal', 'correction_delta', 'retroactive_addition', 'manual_penalty')),
  component_code text NOT NULL,
  amount numeric(15,2) NOT NULL,
  reason text NOT NULL,
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_target ON public.payroll_adjustments(target_run_id, employee_id);

-- 7. Payment Batches
CREATE TABLE IF NOT EXISTS public.payroll_payment_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.hr_company_profiles(id),
  run_id uuid NOT NULL REFERENCES public.payroll_runs(id),
  batch_reference text NOT NULL,
  bank_code text NOT NULL,
  payment_method text NOT NULL DEFAULT 'wps_bank_file' CHECK (payment_method IN ('wps_bank_file', 'internal_transfer', 'cheque', 'cash')),
  payer_iban text NOT NULL,
  mol_establishment_id text NOT NULL,
  total_records integer NOT NULL DEFAULT 0,
  total_amount numeric(15,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'generated', 'sent_to_bank', 'acknowledged', 'completed', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, batch_reference)
);

CREATE INDEX IF NOT EXISTS idx_payroll_batches_run ON public.payroll_payment_batches(run_id, status);

-- 8. Bank Files (Immutable generated WPS files with SHA-256 hash)
CREATE TABLE IF NOT EXISTS public.payroll_bank_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.hr_company_profiles(id),
  batch_id uuid NOT NULL REFERENCES public.payroll_payment_batches(id),
  file_format text NOT NULL DEFAULT 'wps_txt_pipe',
  file_name text NOT NULL,
  file_content text NOT NULL,
  file_hash text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  employee_count integer NOT NULL,
  total_amount numeric(15,2) NOT NULL,
  generated_by uuid NOT NULL REFERENCES auth.users(id),
  generated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_payroll_bank_files_batch ON public.payroll_bank_files(batch_id, version);

-- Bank files are strictly immutable: prevent modifications or deletion
CREATE TRIGGER payroll_bank_files_immutable
BEFORE UPDATE OR DELETE ON public.payroll_bank_files
FOR EACH ROW EXECUTE FUNCTION public.hr_reject_history_change();

-- 9. Trigger to protect locked/closed payroll runs and results
CREATE OR REPLACE FUNCTION public.hr_protect_locked_payroll()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_run_status text;
BEGIN
  IF TG_TABLE_NAME = 'payroll_runs' THEN
    IF OLD.status IN ('locked', 'closed', 'posted', 'paid') THEN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'لا يمكن حذف مسير رواتب مقفل أو مرحل (%): مسير محفوظ غير قابل للتعديل', OLD.status;
      END IF;
      -- Prevent mutation of financial totals once locked
      IF NEW.total_net <> OLD.total_net OR NEW.total_gross <> OLD.total_gross OR NEW.total_deductions <> OLD.total_deductions THEN
        RAISE EXCEPTION 'لا يمكن تعديل المبالغ المالية لمسير مقفل أو مرحل (%): استخدم التسويات أو إعادة الفتح المعتمدة', OLD.status;
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'payroll_results' THEN
    SELECT status INTO v_run_status FROM public.payroll_runs WHERE id = OLD.run_id;
    IF v_run_status IN ('locked', 'closed', 'posted', 'paid') THEN
      RAISE EXCEPTION 'لا يمكن تعديل أو حذف نتائج مسير رواتب مقفل أو مغلق (%)؛ يلزم إنشاء حركة تسوية مستقلة', v_run_status;
    END IF;
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_locked_payroll_run ON public.payroll_runs;
CREATE TRIGGER trg_protect_locked_payroll_run
BEFORE UPDATE OR DELETE ON public.payroll_runs
FOR EACH ROW EXECUTE FUNCTION public.hr_protect_locked_payroll();

DROP TRIGGER IF EXISTS trg_protect_locked_payroll_results ON public.payroll_results;
CREATE TRIGGER trg_protect_locked_payroll_results
BEFORE UPDATE OR DELETE ON public.payroll_results
FOR EACH ROW EXECUTE FUNCTION public.hr_protect_locked_payroll();

-- 10. RLS & Permissions
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['payroll_periods', 'payroll_salary_components', 'payroll_inputs', 'payroll_results', 'payroll_adjustments', 'payroll_payment_batches', 'payroll_bank_files'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl);
  END LOOP;
END $$;

COMMIT;