-- ============================================================================
-- PROMPT 8: Loans Ledger-Based Domain, Idempotent Integration & EOS Country Pack
-- ============================================================================

-- 1. LOAN TRANSACTIONS (Immutable Financial Ledger)
CREATE TABLE IF NOT EXISTS public.loan_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  transaction_type text NOT NULL CHECK (
    transaction_type IN ('disbursement', 'installment', 'manual_payment', 'payroll_deduction', 'adjustment', 'reversal')
  ),
  direction text NOT NULL CHECK (direction IN ('debit', 'credit')),
  amount numeric(18, 2) NOT NULL CHECK (amount > 0),
  idempotency_key text UNIQUE,
  reference_id text,
  balance_after numeric(18, 2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS loan_transactions_loan_idx
  ON public.loan_transactions (loan_id, created_at ASC);

CREATE INDEX IF NOT EXISTS loan_transactions_employee_idx
  ON public.loan_transactions (employee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS loan_transactions_idempotency_idx
  ON public.loan_transactions (idempotency_key);

-- Immutability Trigger: Block UPDATE and DELETE on loan_transactions
CREATE OR REPLACE FUNCTION public.trg_fn_loan_transactions_immutable()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'سجل حركات السلف (Loan Ledger) غير قابل للتعديل أو الحذف المباشر؛ التصحيح يتطلب حركة تسوية أو قيداً عكسياً (Reversal/Adjustment).';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_loan_transactions_immutable ON public.loan_transactions;
CREATE TRIGGER trg_loan_transactions_immutable
  BEFORE UPDATE OR DELETE ON public.loan_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_loan_transactions_immutable();


-- 2. LOAN INSTALLMENT SCHEDULES (Planned amortization schedule)
CREATE TABLE IF NOT EXISTS public.loan_installment_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  installment_number integer NOT NULL CHECK (installment_number > 0),
  due_date date NOT NULL,
  principal_amount numeric(18, 2) NOT NULL CHECK (principal_amount >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'partially_paid', 'waived')),
  paid_amount numeric(18, 2) NOT NULL DEFAULT 0,
  transaction_id uuid REFERENCES public.loan_transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loan_id, installment_number)
);

CREATE INDEX IF NOT EXISTS loan_installment_schedules_loan_idx
  ON public.loan_installment_schedules (loan_id, installment_number ASC);


-- 3. END OF SERVICE SETTLEMENTS (Final Settlement & Benefit Calculation)
CREATE TABLE IF NOT EXISTS public.eos_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES public.end_of_service_requests(id) ON DELETE SET NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  settlement_number text NOT NULL UNIQUE,
  service_start_date date NOT NULL,
  last_working_date date NOT NULL,
  service_years numeric(10, 4) NOT NULL DEFAULT 0,
  service_months integer NOT NULL DEFAULT 0,
  service_days integer NOT NULL DEFAULT 0,
  termination_reason text NOT NULL,
  wage_base numeric(18, 2) NOT NULL DEFAULT 0,
  statutory_eos_amount numeric(18, 2) NOT NULL DEFAULT 0,
  leave_encashment_days numeric(10, 2) NOT NULL DEFAULT 0,
  leave_encashment_amount numeric(18, 2) NOT NULL DEFAULT 0,
  unpaid_payroll_days numeric(10, 2) NOT NULL DEFAULT 0,
  unpaid_payroll_amount numeric(18, 2) NOT NULL DEFAULT 0,
  loan_settlement_deduction numeric(18, 2) NOT NULL DEFAULT 0,
  other_additions numeric(18, 2) NOT NULL DEFAULT 0,
  other_deductions numeric(18, 2) NOT NULL DEFAULT 0,
  net_settlement_amount numeric(18, 2) NOT NULL DEFAULT 0,
  formula_version text NOT NULL DEFAULT 'SA_LABOR_LAW_V1',
  calculation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'settled', 'reversed')),
  reversal_of_id uuid REFERENCES public.eos_settlements(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  settled_at timestamptz,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eos_settlements_employee_idx
  ON public.eos_settlements (employee_id, last_working_date DESC);

CREATE INDEX IF NOT EXISTS eos_settlements_status_idx
  ON public.eos_settlements (status);

-- Immutability Trigger: Block UPDATE/DELETE on approved or settled EOS records
CREATE OR REPLACE FUNCTION public.trg_fn_eos_settlements_immutable()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('approved', 'settled') THEN
      RAISE EXCEPTION 'لا يمكن حذف تسوية نهاية خدمة معتمدة أو منصرفة (رقم: %)', OLD.settlement_number;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('approved', 'settled') THEN
      -- Allow only updating status to 'reversed' when a reversal is issued
      IF NEW.status = 'reversed' AND OLD.status = 'approved' THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'تسوية نهاية الخدمة المعتمدة غير قابلة للتعديل المباشر (رقم: %)، أي تصحيح يتطلب إصدار قيد عكسي.', OLD.settlement_number;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_eos_settlements_immutable ON public.eos_settlements;
CREATE TRIGGER trg_eos_settlements_immutable
  BEFORE UPDATE OR DELETE ON public.eos_settlements
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_eos_settlements_immutable();


-- 4. END OF SERVICE CLEARANCES (Checklist / العهد وإخلاء الطرف)
CREATE TABLE IF NOT EXISTS public.eos_clearances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.end_of_service_requests(id) ON DELETE CASCADE,
  department_code text NOT NULL CHECK (department_code IN ('IT', 'ASSETS', 'FINANCE', 'HR', 'DIRECT_MANAGER')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'waived')),
  notes text,
  cleared_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cleared_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, department_code)
);

CREATE INDEX IF NOT EXISTS eos_clearances_request_idx
  ON public.eos_clearances (request_id);


-- 5. RLS & PERMISSIONS
ALTER TABLE public.loan_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_installment_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_clearances ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.loan_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.loan_installment_schedules TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.eos_settlements TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.eos_clearances TO authenticated;

GRANT ALL ON public.loan_transactions, public.loan_installment_schedules, public.eos_settlements, public.eos_clearances TO service_role;

-- RLS Policies
DROP POLICY IF EXISTS loan_transactions_select_policy ON public.loan_transactions;
CREATE POLICY loan_transactions_select_policy ON public.loan_transactions
  FOR SELECT TO authenticated
  USING (
    public.can_access_resource('loans', 'read')
    OR public.can_access_resource('/loans', 'read')
    OR employee_id IN (
      SELECT id FROM public.employees WHERE email = auth.email() OR user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS loan_transactions_insert_policy ON public.loan_transactions;
CREATE POLICY loan_transactions_insert_policy ON public.loan_transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_access_resource('loans', 'create')
    OR public.can_access_resource('/loans', 'create')
    OR public.can_access_resource('payroll', 'update')
  );

DROP POLICY IF EXISTS eos_settlements_select_policy ON public.eos_settlements;
CREATE POLICY eos_settlements_select_policy ON public.eos_settlements
  FOR SELECT TO authenticated
  USING (
    public.can_access_resource('end-of-service-requests', 'read')
    OR public.can_access_resource('/end-of-service-requests', 'read')
    OR employee_id IN (
      SELECT id FROM public.employees WHERE email = auth.email() OR user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS eos_settlements_write_policy ON public.eos_settlements;
CREATE POLICY eos_settlements_write_policy ON public.eos_settlements
  FOR ALL TO authenticated
  USING (
    public.can_access_resource('end-of-service-requests', 'create')
    OR public.can_access_resource('/end-of-service-requests', 'create')
  )
  WITH CHECK (
    public.can_access_resource('end-of-service-requests', 'create')
    OR public.can_access_resource('/end-of-service-requests', 'create')
  );
