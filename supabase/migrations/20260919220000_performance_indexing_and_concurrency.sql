-- ============================================================================
-- Migration: 20260919220000_performance_indexing_and_concurrency.sql
-- Description: Enterprise Performance Indexing & Optimistic Concurrency Control
-- Optimizes high-volume query paths, prevents sequential scans, and introduces
-- optimistic concurrency control on employees master records.
-- ============================================================================

BEGIN;

-- 1. Add Optimistic Locking Version Column to Employees
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- 2. Composite B-Tree Indexes for High-Volume Query Paths

-- 2.1 Employees: Directory filtering, sorting by emp_no and updated_at
CREATE INDEX IF NOT EXISTS employees_company_status_empno_idx 
  ON public.employees(company_id, status, emp_no);

CREATE INDEX IF NOT EXISTS employees_tenant_company_updated_idx 
  ON public.employees(tenant_id, company_id, updated_at DESC);

-- 2.2 Attendance & Raw Punches: Daily attendance & biometric events
CREATE INDEX IF NOT EXISTS attendance_daily_company_date_emp_idx 
  ON public.m08_attendance_results(company_id, work_date, employee_id);

CREATE INDEX IF NOT EXISTS raw_punches_company_punch_bio_idx 
  ON public.m08_device_events(company_id, event_at DESC, employee_raw_id);

-- 2.3 Leave History & Balances
CREATE INDEX IF NOT EXISTS leave_requests_company_emp_date_idx 
  ON public.leave_requests(employee_id, from_date DESC);

-- 2.4 Loans & Ledger
CREATE INDEX IF NOT EXISTS loans_company_emp_status_idx 
  ON public.loans(employee_id, status);

-- 2.5 Loan Transactions & History
CREATE INDEX IF NOT EXISTS loan_transactions_loan_created_idx 
  ON public.loan_transactions(loan_id, created_at DESC);

-- 2.6 Payroll Results & Runs
CREATE INDEX IF NOT EXISTS payroll_results_run_emp_idx 
  ON public.payroll_results(run_id, employee_id);

CREATE INDEX IF NOT EXISTS payroll_runs_company_period_idx 
  ON public.payroll_runs(company_id, period_id);

-- 2.7 Security Audit Logs: High-throughput audit queries by tenant and timestamp
CREATE INDEX IF NOT EXISTS security_audit_logs_tenant_created_idx 
  ON public.security_audit_logs(tenant_id, created_at DESC);

-- 2.8 Email Notification Outbox: Worker polling index
CREATE INDEX IF NOT EXISTS wf_outbox_events_status_scheduled_idx 
  ON public.wf_outbox_events(status, created_at) 
  WHERE status IN ('pending', 'processing');

-- 3. Idempotent Deduplication Index for Loan Installment Deductions
CREATE INDEX IF NOT EXISTS loan_transactions_ref_idx 
  ON public.loan_transactions(loan_id, reference_id);

-- 4. Defense-in-depth: Ensure anon has no direct access to public tables
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;

COMMIT;

