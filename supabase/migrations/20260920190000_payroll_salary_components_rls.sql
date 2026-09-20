-- Migration: 20260920190000_payroll_salary_components_rls.sql
-- Add RLS policies for payroll_salary_components and payroll_periods so authenticated users can manage them.

BEGIN;

DROP POLICY IF EXISTS payroll_salary_components_sel ON public.payroll_salary_components;
CREATE POLICY payroll_salary_components_sel ON public.payroll_salary_components
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS payroll_salary_components_mgmt ON public.payroll_salary_components;
CREATE POLICY payroll_salary_components_mgmt ON public.payroll_salary_components
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS payroll_periods_sel ON public.payroll_periods;
CREATE POLICY payroll_periods_sel ON public.payroll_periods
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS payroll_periods_mgmt ON public.payroll_periods;
CREATE POLICY payroll_periods_mgmt ON public.payroll_periods
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
