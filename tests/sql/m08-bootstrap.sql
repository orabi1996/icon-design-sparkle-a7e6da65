-- Only run against a disposable PostgreSQL 16+ instance in CI.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE public.employees(id uuid PRIMARY KEY, emp_no text NOT NULL, full_name text NOT NULL);
CREATE TABLE public.fingerprint_records(id uuid PRIMARY KEY, employee_id uuid, punch_at timestamptz);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.fingerprint_records TO authenticated;
ALTER TABLE public.fingerprint_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY fingerprint_records_all ON public.fingerprint_records FOR ALL TO authenticated USING(true) WITH CHECK(true);
INSERT INTO public.fingerprint_records VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','00000000-0000-0000-0000-000000000003','2026-10-05T08:00:00Z');
CREATE TABLE public.user_roles(user_id uuid, role text);
CREATE FUNCTION public.is_permissions_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin') $$;
INSERT INTO auth.users VALUES
('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002'), ('00000000-0000-0000-0000-000000000003');
INSERT INTO public.user_roles VALUES('00000000-0000-0000-0000-000000000001','admin');
INSERT INTO public.employees VALUES('00000000-0000-0000-0000-000000000003','00104','Employee A');
