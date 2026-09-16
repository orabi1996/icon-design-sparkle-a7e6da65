-- Existing device scans remain readable for authorized reconciliation; no edits/removals.
BEGIN;
REVOKE INSERT, UPDATE, DELETE ON public.fingerprint_records FROM anon, authenticated;
DROP POLICY IF EXISTS fingerprint_records_all ON public.fingerprint_records;
CREATE POLICY fingerprint_records_admin_review ON public.fingerprint_records
FOR SELECT TO authenticated USING (public.is_permissions_admin());
CREATE TRIGGER m08_legacy_fingerprint_immutable BEFORE UPDATE OR DELETE
ON public.fingerprint_records FOR EACH ROW EXECUTE FUNCTION public.hr_reject_history_change();
COMMIT;
