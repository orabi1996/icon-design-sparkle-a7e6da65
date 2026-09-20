-- ============================================================================
-- PROMPT 9: Operational Modules Enterprise Foundation
-- Tasks, Correspondence, Inquiries & Disciplinary, Surveys, and Document Archive
-- ============================================================================

-- 1. TASKS ENHANCEMENTS & COMMENTS
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS watchers jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS priority_code text DEFAULT 'normal' CHECK (priority_code IN ('low', 'normal', 'high', 'urgent')),
  ADD COLUMN IF NOT EXISTS sla_hours integer,
  ADD COLUMN IF NOT EXISTS sla_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_sla_breached boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurring_config jsonb,
  ADD COLUMN IF NOT EXISTS audit_trail jsonb DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  comment_text text NOT NULL,
  attachments jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_comments_task_idx ON public.task_comments (task_id, created_at ASC);


-- 2. CORRESPONDENCE ENTERPRISE ENHANCEMENTS & CONFIDENTIALITY
ALTER TABLE public.employee_correspondence
  ADD COLUMN IF NOT EXISTS direction_type text NOT NULL DEFAULT 'internal'
    CHECK (direction_type IN ('incoming', 'outgoing', 'internal')),
  ADD COLUMN IF NOT EXISTS reference_number text UNIQUE,
  ADD COLUMN IF NOT EXISTS confidentiality text NOT NULL DEFAULT 'normal'
    CHECK (confidentiality IN ('normal', 'confidential', 'top_secret')),
  ADD COLUMN IF NOT EXISTS classification text DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS related_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS related_request_id uuid,
  ADD COLUMN IF NOT EXISTS audit_metadata jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS employee_correspondence_ref_idx
  ON public.employee_correspondence (reference_number);

CREATE INDEX IF NOT EXISTS employee_correspondence_confidentiality_idx
  ON public.employee_correspondence (confidentiality);

-- Strict RLS: Hide sensitive correspondence unless user has view_sensitive permission
DROP POLICY IF EXISTS employee_correspondence_select_scope ON public.employee_correspondence;
CREATE POLICY employee_correspondence_select_scope ON public.employee_correspondence
  FOR SELECT TO authenticated
  USING (
    (
      confidentiality = 'normal'
      AND (
        public.can_access_resource('correspondence', 'read')
        OR public.can_access_resource('/correspondence', 'read')
        OR employee_id IN (
          SELECT id FROM public.employees WHERE email = auth.email() OR emp_no = (SELECT p.emp_no FROM public.profiles p WHERE p.id = auth.uid())
        )
      )
    )
    OR (
      confidentiality IN ('confidential', 'top_secret')
      AND (
        public.can_access_resource('correspondence', 'view_sensitive')
        OR public.is_permissions_admin()
      )
    )
  );


-- 3. DISCIPLINARY INQUIRIES & INVESTIGATIONS (Immutable Lifecycle & Saudi Cap)
CREATE TABLE IF NOT EXISTS public.disciplinary_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_number text NOT NULL UNIQUE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  employee_name text NOT NULL,
  emp_no text,
  branch text,
  department text,
  incident_date date NOT NULL,
  subject text NOT NULL,
  incident_description text NOT NULL,
  lifecycle_status text NOT NULL DEFAULT 'draft' CHECK (
    lifecycle_status IN (
      'draft',
      'issued',
      'notified',
      'employee_responded',
      'investigation',
      'decision_pending',
      'approved',
      'closed',
      'appealed'
    )
  ),
  evidence_attachments jsonb DEFAULT '[]'::jsonb,
  employee_statement text,
  employee_responded_at timestamptz,
  investigation_findings text,
  investigated_by text,
  investigated_at timestamptz,
  decision_type text CHECK (
    decision_type IN (
      'dismissed',
      'verbal_warning',
      'written_warning',
      'salary_deduction',
      'suspension',
      'termination_art80'
    )
  ),
  deduction_days integer CHECK (deduction_days IS NULL OR (deduction_days >= 0 AND deduction_days <= 5)),
  penalty_amount numeric(18, 2) DEFAULT 0,
  payroll_adjustment_id uuid,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  closed_at timestamptz,
  appeal_notes text,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS disciplinary_inquiries_employee_idx
  ON public.disciplinary_inquiries (employee_id, incident_date DESC);

CREATE INDEX IF NOT EXISTS disciplinary_inquiries_status_idx
  ON public.disciplinary_inquiries (lifecycle_status);

-- Immutability Trigger: Prohibit direct edits or deletions once approved or closed
CREATE OR REPLACE FUNCTION public.trg_fn_disciplinary_inquiry_immutable()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.lifecycle_status IN ('approved', 'closed') THEN
      RAISE EXCEPTION 'لا يمكن حذف تحقيق أو قرار تأديبي معتمد أو مغلق (رقم: %)', OLD.inquiry_number;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.lifecycle_status IN ('approved', 'closed') THEN
      -- Allow transitioning to appealed if within window
      IF NEW.lifecycle_status = 'appealed' AND OLD.lifecycle_status = 'approved' THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'القرار التأديبي المعتمد غير قابل للتعديل المباشر (رقم: %)', OLD.inquiry_number;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_disciplinary_inquiry_immutable ON public.disciplinary_inquiries;
CREATE TRIGGER trg_disciplinary_inquiry_immutable
  BEFORE UPDATE OR DELETE ON public.disciplinary_inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_disciplinary_inquiry_immutable();


-- 4. SURVEYS & TARGETED ANNOUNCEMENTS
CREATE TABLE IF NOT EXISTS public.surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  version integer NOT NULL DEFAULT 1,
  target_filter jsonb DEFAULT '{}'::jsonb,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  window_start date NOT NULL,
  window_end date NOT NULL,
  is_anonymous boolean NOT NULL DEFAULT false,
  max_responses_per_employee integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT surveys_window_check CHECK (window_end >= window_start)
);

CREATE TABLE IF NOT EXISTS public.survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS survey_responses_survey_idx ON public.survey_responses (survey_id);

-- Enforce single vote per employee when survey is not anonymous
CREATE UNIQUE INDEX IF NOT EXISTS survey_responses_unique_employee_idx
  ON public.survey_responses (survey_id, employee_id)
  WHERE employee_id IS NOT NULL;


-- 5. DOCUMENTS & SECURE ARCHIVE
CREATE TABLE IF NOT EXISTS public.archived_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_number text NOT NULL UNIQUE,
  document_type text NOT NULL,
  owner_entity_type text NOT NULL CHECK (owner_entity_type IN ('employee', 'company')),
  owner_id uuid NOT NULL,
  doc_title text NOT NULL,
  issue_date date,
  expiry_date date,
  version integer NOT NULL DEFAULT 1,
  storage_bucket text NOT NULL DEFAULT 'documents-archive',
  storage_path text NOT NULL,
  file_hash text NOT NULL,
  file_size_bytes bigint DEFAULT 0,
  mime_type text DEFAULT 'application/pdf',
  confidentiality text NOT NULL DEFAULT 'normal' CHECK (confidentiality IN ('normal', 'confidential', 'restricted')),
  retention_years integer NOT NULL DEFAULT 10,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'archived', 'superseded')),
  uploaded_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS archived_documents_owner_idx
  ON public.archived_documents (owner_entity_type, owner_id, expiry_date);

CREATE INDEX IF NOT EXISTS archived_documents_hash_idx
  ON public.archived_documents (file_hash);


-- 6. PERMISSIONS & RLS FOR ALL OPERATIONAL TABLES
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disciplinary_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archived_documents ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.task_comments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.disciplinary_inquiries TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.surveys TO authenticated;
GRANT SELECT, INSERT ON public.survey_responses TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.archived_documents TO authenticated;

GRANT ALL ON
  public.task_comments,
  public.disciplinary_inquiries,
  public.surveys,
  public.survey_responses,
  public.archived_documents
TO service_role;

-- Task comments policy
DROP POLICY IF EXISTS task_comments_policy ON public.task_comments;
CREATE POLICY task_comments_policy ON public.task_comments
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Disciplinary inquiries policy
DROP POLICY IF EXISTS disciplinary_inquiries_select_policy ON public.disciplinary_inquiries;
CREATE POLICY disciplinary_inquiries_select_policy ON public.disciplinary_inquiries
  FOR SELECT TO authenticated
  USING (
    public.can_access_resource('inquiries', 'read')
    OR public.can_access_resource('/inquiries', 'read')
    OR employee_id IN (
      SELECT id FROM public.employees WHERE email = auth.email() OR emp_no = (SELECT p.emp_no FROM public.profiles p WHERE p.id = auth.uid())
    )
  );

DROP POLICY IF EXISTS disciplinary_inquiries_write_policy ON public.disciplinary_inquiries;
CREATE POLICY disciplinary_inquiries_write_policy ON public.disciplinary_inquiries
  FOR ALL TO authenticated
  USING (
    public.can_access_resource('inquiries', 'update')
    OR public.can_access_resource('/inquiries', 'update')
  )
  WITH CHECK (
    public.can_access_resource('inquiries', 'update')
    OR public.can_access_resource('/inquiries', 'update')
  );

-- Surveys policies
DROP POLICY IF EXISTS surveys_select_policy ON public.surveys;
CREATE POLICY surveys_select_policy ON public.surveys
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS surveys_write_policy ON public.surveys;
CREATE POLICY surveys_write_policy ON public.surveys
  FOR ALL TO authenticated
  USING (
    public.can_access_resource('surveys', 'update')
    OR public.can_access_resource('/surveys', 'update')
  )
  WITH CHECK (
    public.can_access_resource('surveys', 'update')
    OR public.can_access_resource('/surveys', 'update')
  );

DROP POLICY IF EXISTS survey_responses_policy ON public.survey_responses;
CREATE POLICY survey_responses_policy ON public.survey_responses
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Archived documents policy
DROP POLICY IF EXISTS archived_documents_select_policy ON public.archived_documents;
CREATE POLICY archived_documents_select_policy ON public.archived_documents
  FOR SELECT TO authenticated
  USING (
    (
      confidentiality = 'normal'
      AND (
        public.can_access_resource('reports.archive', 'read')
        OR public.can_access_resource('/reports/archive', 'read')
        OR owner_id IN (
          SELECT id FROM public.employees WHERE email = auth.email() OR emp_no = (SELECT p.emp_no FROM public.profiles p WHERE p.id = auth.uid())
        )
      )
    )
    OR (
      confidentiality IN ('confidential', 'restricted')
      AND (
        public.can_access_resource('reports.archive', 'view_sensitive')
        OR public.is_permissions_admin()
      )
    )
  );

DROP POLICY IF EXISTS archived_documents_write_policy ON public.archived_documents;
CREATE POLICY archived_documents_write_policy ON public.archived_documents
  FOR ALL TO authenticated
  USING (
    public.can_access_resource('reports.archive', 'create')
    OR public.can_access_resource('/reports/archive', 'create')
  )
  WITH CHECK (
    public.can_access_resource('reports.archive', 'create')
    OR public.can_access_resource('/reports/archive', 'create')
  );
