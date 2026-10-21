CREATE OR REPLACE FUNCTION public.prevent_duplicate_employee_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE v_other text;
BEGIN
  IF NEW.national_id IS NOT NULL AND btrim(NEW.national_id) <> '' THEN
    SELECT full_name INTO v_other FROM public.employees
     WHERE id <> NEW.id AND btrim(national_id) = btrim(NEW.national_id) LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'يوجد تشابه مع بيانات موظف آخر: رقم الهوية % مسجل للموظف "%"', btrim(NEW.national_id), v_other
        USING ERRCODE = '23505';
    END IF;
  END IF;
  IF NEW.full_name IS NOT NULL AND btrim(NEW.full_name) <> '' THEN
    SELECT emp_no INTO v_other FROM public.employees
     WHERE id <> NEW.id
       AND lower(regexp_replace(btrim(full_name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(NEW.full_name), '\s+', ' ', 'g'))
     LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'يوجد تشابه مع بيانات موظف آخر: الاسم "%" مسجل للموظف رقم %', btrim(NEW.full_name), coalesce(v_other, '—')
        USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_employee_identity ON public.employees;
CREATE TRIGGER trg_prevent_duplicate_employee_identity
BEFORE INSERT OR UPDATE OF full_name, national_id ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_employee_identity();