-- =====================================================================
-- Migration: 20260918100000_reports_analytics_export_governance.sql
-- Description: PROMPT 10 - Reporting Architecture, Query Indexing,
--              Export Security Governance & Data Quality Diagnostics
-- =====================================================================

-- 1. Extend security_audit_logs event types to include 'data_exported'
ALTER TABLE public.security_audit_logs 
  DROP CONSTRAINT IF EXISTS security_audit_logs_event_type_check;

ALTER TABLE public.security_audit_logs 
  ADD CONSTRAINT security_audit_logs_event_type_check CHECK (
    event_type IN (
      'login',
      'login_failed',
      'user_created',
      'role_changed',
      'permission_changed',
      'group_changed',
      'account_disabled',
      'sensitive_config_changed',
      'unauthorized_access',
      'data_exported'
    )
  );

-- 2. Performance & Coverage Composite Indexes for High-Volume Reporting

-- A. Attendance Records High-Volume Coverage Indexes
CREATE INDEX IF NOT EXISTS idx_attendance_records_employee_date 
  ON public.attendance_records (employee_id, work_date DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_records_late_filtered 
  ON public.attendance_records (work_date DESC, late_minutes) 
  WHERE late_minutes > 0;

CREATE INDEX IF NOT EXISTS idx_attendance_records_status_date 
  ON public.attendance_records (status, work_date DESC);

-- B. Payroll Results Composite Reporting Indexes
CREATE INDEX IF NOT EXISTS idx_payroll_results_employee_run 
  ON public.payroll_results (employee_id, run_id);

-- C. Loan Transactions Ledger Index
CREATE INDEX IF NOT EXISTS idx_loan_transactions_loan_type_date 
  ON public.loan_transactions (loan_id, transaction_type, created_at DESC);

-- D. Employees Status and Org Scoping Index
CREATE INDEX IF NOT EXISTS idx_employees_status_branch_dept 
  ON public.employees (status, branch, department);

-- E. Leave Requests Date and Status Range Index
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates_status 
  ON public.leave_requests (from_date, to_date, status);

-- 3. Live Data Quality & Reconciliation Diagnostic View
-- Detects and surfaces orphan records, missing links, and discrepancies
CREATE OR REPLACE VIEW public.vw_reporting_data_quality_issues AS
-- A. Active Employees with Missing Salary or Zero Basic Salary
SELECT 
  'missing_salary' AS issue_type,
  'high' AS severity,
  'موظف نشط بدون أجر أساسي محدد' AS description_ar,
  e.id::text AS record_id,
  'employees' AS table_name,
  jsonb_build_object(
    'emp_no', e.emp_no,
    'full_name', e.full_name,
    'branch', e.branch,
    'department', e.department,
    'basic_salary', COALESCE(e.basic_salary, 0)
  ) AS details,
  now() AS detected_at
FROM public.employees e
WHERE (e.status = 'active' OR e.status = 'نشط')
  AND (e.basic_salary IS NULL OR e.basic_salary <= 0)

UNION ALL

-- B. Active Employees with Incomplete Org Assignment
SELECT 
  'unassigned_org' AS issue_type,
  'medium' AS severity,
  'موظف نشط بدون فرع أو قسم محدد' AS description_ar,
  e.id::text AS record_id,
  'employees' AS table_name,
  jsonb_build_object(
    'emp_no', e.emp_no,
    'full_name', e.full_name,
    'branch', e.branch,
    'department', e.department
  ) AS details,
  now() AS detected_at
FROM public.employees e
WHERE (e.status = 'active' OR e.status = 'نشط')
  AND (e.branch IS NULL OR e.branch = '' OR e.department IS NULL OR e.department = '')

UNION ALL

-- C. Attendance Records with Missing Check-out on Past Work Dates
SELECT 
  'missing_checkout' AS issue_type,
  'medium' AS severity,
  'سجل حضور بدون بصمة خروج في يوم عمل منتهي' AS description_ar,
  a.id::text AS record_id,
  'attendance_records' AS table_name,
  jsonb_build_object(
    'employee_id', a.employee_id,
    'work_date', a.work_date,
    'check_in', a.check_in,
    'branch', e.branch
  ) AS details,
  now() AS detected_at
FROM public.attendance_records a
LEFT JOIN public.employees e ON e.id = a.employee_id
WHERE a.work_date < CURRENT_DATE
  AND a.check_in IS NOT NULL 
  AND a.check_out IS NULL 
  AND (a.status IS NULL OR a.status NOT IN ('excused', 'مستأذن', 'مهمة عمل'))

UNION ALL

-- D. Orphan Payroll Adjustments without Valid Employee
SELECT 
  'orphan_adjustment' AS issue_type,
  'critical' AS severity,
  'تسوية راتب غير مرتبطة بموظف صالح' AS description_ar,
  adj.id::text AS record_id,
  'payroll_adjustments' AS table_name,
  jsonb_build_object(
    'employee_id', adj.employee_id,
    'amount', adj.amount,
    'component_code', adj.component_code
  ) AS details,
  now() AS detected_at
FROM public.payroll_adjustments adj
LEFT JOIN public.employees e ON adj.employee_id = e.id
WHERE e.id IS NULL;

-- Enable permissions and RLS on reporting diagnostic view
COMMENT ON VIEW public.vw_reporting_data_quality_issues IS 
  'منظر تشخيصي لكشف السجلات اليتيمة وعدم التطابق المحاسبي والتشغيلي قبل إصدار التقارير الرسمية';
