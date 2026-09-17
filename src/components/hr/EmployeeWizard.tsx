import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { MaterialIcon } from "@/components/MaterialIcon";
import { Breadcrumbs } from "@/components/hr/ui";
import { useRows, useSaveRow, type Row } from "@/lib/hr-db";
import { supabase } from "@/integrations/supabase/client";
import { isValidSaudiNationalId, isValidIban } from "@/lib/employee-core.mjs";

type Value = string | number | boolean;

type FieldProps = {
  label: string;
  required?: boolean | undefined;
  children: ReactNode;
  className?: string | undefined;
};

const controlClass =
  "h-10 w-full rounded-md border border-slate-400 bg-white px-3 text-[13px] font-medium text-slate-900 outline-none transition focus:border-[#1679bd] focus:ring-2 focus:ring-[#1679bd]/15 disabled:bg-slate-100 disabled:text-slate-500";

const steps = [
  { title: "البيانات الشخصية", icon: "location_on" },
  { title: "بيانات العمل", icon: "work" },
  { title: "بيانات التواصل", icon: "mail" },
  { title: "البيانات المالية", icon: "account_balance" },
  { title: "العقود", icon: "description" },
];

const nationalities = ["سعودي", "مصري", "سوداني", "يمني", "أردني", "سوري", "هندي", "باكستاني", "أخرى"];
const religions = ["مسلم", "مسيحي", "أخرى"];
const socialStatuses = ["أعزب", "متزوج", "مطلق", "أرمل"];
const branches = ["الفرع الرئيسي", "فرع جدة", "فرع الدمام", "فرع الرياض"];
const regions = ["الرياض", "مكة المكرمة", "المدينة المنورة", "المنطقة الشرقية", "أخرى"];
const sectors = ["قطاع السعودية", "قطاع مصر", "قطاع التشغيل", "قطاع الخدمات"];
const careerPaths = ["مسار أساسي", "مسار السعودية", "مسار إداري", "مسار تقني"];
const jobLevels = ["إداري", "تعليمي", "تشغيلي", "إشرافي", "قيادي"];
const schedules = ["دوام صباحي", "دوام مسائي", "دوام مرن", "مناوبات"];
const jobCategories = ["إداري", "تعليمي", "فني", "تشغيلي"];
const contractCategories = ["دوام كامل", "دوام جزئي", "موسمي", "تدريب"];
const paymentMethods = ["نقدي", "تحويل بنكي", "شيك"];
const contractTypes = ["محدد المدة", "غير محدد المدة", "تجربة", "مؤقت"];
const leavePolicies = ["30 يوم سنويًا", "21 يوم سنويًا", "حسب العقد"];
const workTypes = ["دوام كامل", "دوام جزئي", "عن بعد", "هجين"];
const workScopes = ["داخل المملكة", "خارج المملكة", "حسب موقع المشروع"];
const hourStandards = ["يومي", "أسبوعي", "شهري"];
const contractTerms = ["العقد القياسي", "عقد إداري", "عقد تشغيلي", "عقد تعليمي"];

const emptyForm = {
  emp_no: "",
  full_name: "",
  employee_name_en: "",
  social_status: "",
  national_id: "",
  fingerprint_no: "",
  nationality: "",
  religion: "",
  gender: "",
  family_members: 0,
  on_duty: true,
  fingerprint_deduction_exempt: false,
  show_in_fingerprint_reports: true,
  region: "",
  branch: "",
  main_department: "",
  career_path: "",
  department: "",
  sector: "",
  job_level: "",
  manager_name: "",
  attendance_schedule: "",
  job_title: "",
  specialization: "",
  job_designation: "",
  birth_date: "",
  hire_date: "",
  start_date: "",
  annual_leave_calc_date: "",
  experience_years: 0,
  probation_days: 90,
  kingdom_entry_date: "",
  landline: "",
  phone: "",
  home_country_phone: "",
  home_country_mobile: "",
  home_country_address: "",
  current_address: "",
  building_no: "",
  postal_code: "",
  additional_no: "",
  district: "",
  email: "",
  private_email: "",
  birth_place: "",
  short_address: "",
  street: "",
  city: "",
  address_region: "",
  unit_no: "",
  address_extra_no: "",
  address_notes: "",
  basic_salary: 0,
  employment_category: "",
  contract_category: "",
  sponsor_name: "",
  payment_method: "نقدي",
  bank_account_holder: "",
  custody_account: "",
  labor_office_no: "",
  bank_data_blocked: false,
  resource_restricted: true,
  add_entitlements_deductions: false,
  contract_type: "",
  annual_leave_policy: "",
  contract_end: "",
  work_type: "",
  work_scope: "",
  weekly_work_days: 5,
  work_hours_standard: "",
  daily_work_hours: 8,
  weekly_rest_days: 2,
  contract_terms: "",
  status: "نشط",
  allowances: 0,
  bank_name: "",
  iban: "",
} satisfies Record<string, Value>;

type EmployeeForm = { [K in keyof typeof emptyForm]: Value };

const labels: Record<string, string> = {
  emp_no: "الرقم الوظيفي",
  full_name: "اسم الموظف رباعي",
  national_id: "رقم الهوية",
  nationality: "الجنسية",
  religion: "الديانة",
  gender: "الجنس",
  region: "المنطقة",
  branch: "الفرع",
  department: "القسم",
  job_level: "المستوى الوظيفي",
  attendance_schedule: "جدول الدوام",
  job_title: "الوظيفة الحالية",
  birth_date: "تاريخ الميلاد",
  hire_date: "تاريخ التعيين",
  start_date: "تاريخ مباشرة العمل",
  annual_leave_calc_date: "احتساب الإجازة السنوية",
  email: "البريد الإلكتروني",
  basic_salary: "الراتب الأساسي",
  employment_category: "الفئة الوظيفية",
  sponsor_name: "اسم الكفيل",
  contract_type: "نوع العقد",
  annual_leave_policy: "لائحة الإجازة السنوية",
  contract_end: "تاريخ نهاية العقد",
  work_type: "نوع العمل",
  work_scope: "نطاق العمل",
  weekly_work_days: "عدد أيام العمل الأسبوعية",
  work_hours_standard: "معيار ساعات العمل",
  daily_work_hours: "عدد ساعات العمل",
  weekly_rest_days: "عدد أيام الراحة الأسبوعية",
};

const requiredByStep: (keyof EmployeeForm)[][] = [
  ["emp_no", "full_name", "national_id", "nationality", "religion", "gender"],
  [
    "region",
    "branch",
    "department",
    "job_level",
    "attendance_schedule",
    "job_title",
    "birth_date",
    "hire_date",
    "start_date",
    "annual_leave_calc_date",
  ],
  ["email"],
  ["basic_salary", "employment_category", "sponsor_name"],
  [
    "contract_type",
    "annual_leave_policy",
    "contract_end",
    "work_type",
    "work_scope",
    "weekly_work_days",
    "work_hours_standard",
    "daily_work_hours",
    "weekly_rest_days",
  ],
];

function Field({ label, required, children, className = "" }: FieldProps) {
  return (
    <label className={"grid gap-1.5 text-right " + className}>
      <span className="text-[13px] font-bold text-slate-900">
        {label}
        {required ? <span className="mr-1 text-lg leading-none text-red-600">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function InputControl({
  value,
  onChange,
  type = "text",
  placeholder,
  disabled,
  min,
}: {
  value: Value;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  min?: number | undefined;
}) {
  return (
    <input
      className={controlClass}
      type={type}
      min={min}
      value={String(value ?? "")}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function SelectControl({
  value,
  onChange,
  options,
}: {
  value: Value;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <select className={controlClass} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}>
      <option value="">اختر ....</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function Panel({
  title,
  index,
  children,
  className = "",
}: {
  title?: string;
  index?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={
        "rounded-md border border-slate-300 bg-[#eef5ff] p-4 shadow-sm md:p-5 " + className
      }
    >
      {title ? (
        <h3 className="mb-4 text-right text-[15px] font-extrabold text-slate-950">
          {index ? String(index) + "- " : ""}
          {title}
        </h3>
      ) : null}
      {children}
    </section>
  );
}

function CheckCard({
  label,
  helper,
  checked,
  onChange,
}: {
  label: string;
  helper: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-20 cursor-pointer items-start justify-between gap-3 rounded-xl border border-slate-300 bg-white p-4 shadow-sm">
      <span className="grid gap-1 text-right">
        <span className="text-[13px] font-extrabold text-slate-900">{label}</span>
        <span className="text-[11px] text-slate-500">{helper}</span>
      </span>
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 accent-[#1679bd]"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function hijriDate(value: Value) {
  if (!value) return "";
  const date = new Date(String(value) + "T12:00:00");
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return "";
  }
}

function DualDate({
  label,
  required,
  value,
  onChange,
}: {
  label: string;
  required?: boolean | undefined;
  value: Value;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} required={required}>
      <div className="grid gap-1 rounded-md border border-slate-300 bg-white p-1.5">
        <span className="px-1 text-[10px] font-bold text-slate-600">ميلادي</span>
        <input
          type="date"
          className="h-9 w-full border-0 bg-transparent px-2 text-[12px] outline-none"
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="border-t border-slate-200 px-1 pt-1 text-[10px] font-bold text-slate-600">هجري</span>
        <input
          readOnly
          className="h-8 w-full bg-slate-50 px-2 text-[12px] text-slate-600 outline-none"
          value={hijriDate(value)}
          placeholder="يُحسب تلقائيًا"
        />
      </div>
    </Field>
  );
}

export function EmployeeWizard() {
  const navigate = useNavigate();
  const save = useSaveRow("employees");
  const { data: departments = [] } = useRows("departments", {
    orderBy: "name",
    ascending: true,
  });
  const { data: employees = [] } = useRows("employees", {
    orderBy: "created_at",
    ascending: false,
    limit: 500,
  });

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<EmployeeForm>({ ...emptyForm });
  const [draftReady, setDraftReady] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");

  const departmentOptions = useMemo(
    () => departments.map((row) => String(row["name"] ?? "")).filter(Boolean),
    [departments],
  );

  const set = <K extends keyof EmployeeForm>(key: K, value: EmployeeForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    try {
      const draft = sessionStorage.getItem("employee-wizard-draft");
      if (draft) setForm({ ...emptyForm, ...(JSON.parse(draft) as EmployeeForm) });
    } catch {
      sessionStorage.removeItem("employee-wizard-draft");
    } finally {
      setDraftReady(true);
    }
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    sessionStorage.setItem("employee-wizard-draft", JSON.stringify(form));
  }, [draftReady, form]);

  useEffect(() => {
    if (form.emp_no) return;
    const nextNumber =
      Math.max(
        100000,
        ...employees.map((row) => Number.parseInt(String(row["emp_no"] ?? "0"), 10) || 0),
      ) + 1;
    setForm((current) => ({
      ...current,
      emp_no: String(nextNumber),
      fingerprint_no: String(new Date().getFullYear()) + String(nextNumber).slice(-6),
    }));
  }, [employees, form.emp_no]);

  useEffect(() => {
    return () => {
      if (photoPreview.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const changePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setPhotoFile(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : "");
  };

  const validateStep = (index: number) => {
    const missing = (requiredByStep[index] ?? []).filter((key) => {
      const value = form[key];
      if (typeof value === "number") return value <= 0;
      return !String(value ?? "").trim();
    });
    if (missing.length) {
      toast.error("يرجى استكمال: " + missing.map((key) => labels[key] ?? key).join("، "));
      return false;
    }
    if (index === 0 && form.national_id) {
      const nid = String(form.national_id).trim();
      if (/^[12]\d{9}$/.test(nid) && !isValidSaudiNationalId(nid)) {
        toast.error("رقم الهوية الوطنية / الإقامة غير صحيح وفق خوارزمية التدقيق الرسمية");
        return false;
      }
      if (form.birth_date) {
        const bDate = new Date(String(form.birth_date));
        const today = new Date();
        const age = (today.getTime() - bDate.getTime()) / (365.25 * 24 * 3600 * 1000);
        if (age < 18) {
          toast.error("يجب ألا يقل عمر الموظف عن 18 عاماً نظاماً");
          return false;
        }
      }
    }
    if (index === 2 && !String(form.email).includes("@")) {
      toast.error("يرجى إدخال بريد إلكتروني صحيح");
      return false;
    }
    if (index === 3 && form.iban) {
      const ibanClean = String(form.iban).replaceAll(/\s+/g, "").toUpperCase();
      if (!isValidIban(ibanClean)) {
        toast.error("صيغة الآيبان البنكي غير صحيحة أو رمز التدقيق البنكي غير مطابق");
        return false;
      }
    }
    return true;
  };

  const next = () => {
    if (!validateStep(step)) return;
    setStep((current) => Math.min(current + 1, steps.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const previous = () => {
    setStep((current) => Math.max(current - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const upload = async (file: File, folder: string) => {
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || !data.user) throw new Error("يجب تسجيل الدخول لرفع المرفقات");
    const safeName = file.name.replace(/[^\w.\-]+/g, "-");
    const path =
      data.user.id + "/" + folder + "/" + crypto.randomUUID() + "-" + safeName;
    const { error } = await supabase.storage
      .from("employee-documents")
      .upload(path, file, { upsert: false });
    if (error) throw error;
    return path;
  };

  const submit = async () => {
    for (let index = 0; index < requiredByStep.length; index += 1) {
      if (!validateStep(index)) {
        setStep(index);
        return;
      }
    }

    try {
      const photoPath = photoFile ? await upload(photoFile, "profiles") : "";
      const contractPath = contractFile ? await upload(contractFile, "contracts") : "";
      const payload: Row = {
        ...form,
        photo_path: photoPath || null,
        contract_attachment_path: contractPath || null,
        status: form.on_duty ? "نشط" : "موقوف",
        basic_salary: Number(form.basic_salary) || 0,
        allowances: Number(form.allowances) || 0,
        family_members: Number(form.family_members) || 0,
        experience_years: Number(form.experience_years) || 0,
        probation_days: Number(form.probation_days) || 0,
        weekly_work_days: Number(form.weekly_work_days) || 0,
        daily_work_hours: Number(form.daily_work_hours) || 0,
        weekly_rest_days: Number(form.weekly_rest_days) || 0,
      };
      for (const key of [
        "birth_date",
        "hire_date",
        "start_date",
        "annual_leave_calc_date",
        "kingdom_entry_date",
        "contract_end",
      ]) {
        if (!payload[key]) payload[key] = null;
      }
      await save.mutateAsync(payload);
      sessionStorage.removeItem("employee-wizard-draft");
      toast.success("تم حفظ الموظف وجميع بياناته بنجاح");
      navigate({ to: "/staff" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "خطأ غير معروف";
      if (/column|schema cache|bucket/i.test(message)) {
        toast.error("يلزم تطبيق تحديث قاعدة بيانات إضافة الموظف قبل الحفظ");
      }
    }
  };

  const personalStep = (
    <div className="grid gap-4">
      <div className="border-b-8 border-[#1679bd] pb-2 text-right text-[16px] font-extrabold text-slate-950">
        البيانات الشخصية
      </div>
      <Panel>
        <div className="grid gap-4 xl:grid-cols-[240px_1fr]">
          <label className="group flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white p-3 shadow-sm">
            {photoPreview ? (
              <img src={photoPreview} alt="صورة الموظف" className="h-40 w-40 rounded-lg object-cover" />
            ) : (
              <MaterialIcon name="person" size={120} className="text-slate-700" />
            )}
            <span className="text-xs font-bold text-[#1679bd]">اختيار صورة الموظف</span>
            <input type="file" accept="image/*" className="hidden" onChange={changePhoto} />
          </label>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="اسم الموظف رباعي" required>
              <InputControl value={form.full_name} onChange={(value) => set("full_name", value)} />
            </Field>
            <Field label="اسم الموظف بالإنجليزية">
              <InputControl value={form.employee_name_en} onChange={(value) => set("employee_name_en", value)} />
            </Field>
            <Field label="الحالة الاجتماعية">
              <SelectControl value={form.social_status} onChange={(value) => set("social_status", value)} options={socialStatuses} />
            </Field>
            <Field label="رقم الهوية" required>
              <InputControl value={form.national_id} onChange={(value) => set("national_id", value)} />
            </Field>
            <Field label="الرقم الوظيفي">
              <InputControl value={form.emp_no} onChange={(value) => set("emp_no", value)} disabled />
            </Field>
            <Field label="رقم البصمة">
              <InputControl value={form.fingerprint_no} onChange={(value) => set("fingerprint_no", value)} disabled />
            </Field>
            <Field label="الجنسية" required>
              <SelectControl value={form.nationality} onChange={(value) => set("nationality", value)} options={nationalities} />
            </Field>
            <Field label="الديانة" required>
              <SelectControl value={form.religion} onChange={(value) => set("religion", value)} options={religions} />
            </Field>
            <Field label="الجنس" required>
              <SelectControl value={form.gender} onChange={(value) => set("gender", value)} options={["ذكر", "أنثى"]} />
            </Field>
            <Field label="عدد أفراد الأسرة">
              <InputControl type="number" min={0} value={form.family_members} onChange={(value) => set("family_members", Number(value))} />
            </Field>
          </div>
        </div>
      </Panel>
    </div>
  );

  const workStep = (
    <div className="grid gap-4">
      <div className="border-b-8 border-[#1679bd] pb-2 text-right text-[16px] font-extrabold text-slate-950">
        بيانات العمل
      </div>
      <Panel title="حالة العمل والبصمة والتقارير">
        <div className="grid gap-4 md:grid-cols-3">
          <CheckCard label="على رأس العمل" helper="حالة العمل والبصمة والتقارير" checked={Boolean(form.on_duty)} onChange={(value) => set("on_duty", value)} />
          <CheckCard label="مستثنى من خصومات البصمة" helper="استثناء من نظام البصمة" checked={Boolean(form.fingerprint_deduction_exempt)} onChange={(value) => set("fingerprint_deduction_exempt", value)} />
          <CheckCard label="عرض في تقارير البصمة" helper="إظهار في التقارير" checked={Boolean(form.show_in_fingerprint_reports)} onChange={(value) => set("show_in_fingerprint_reports", value)} />
        </div>
      </Panel>

      <Panel index={1} title="البيانات الأساسية للعمل">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="المنطقة" required>
            <SelectControl value={form.region} onChange={(value) => set("region", value)} options={regions} />
          </Field>
          <Field label="الفرع" required>
            <SelectControl value={form.branch} onChange={(value) => set("branch", value)} options={branches} />
          </Field>
          <Field label="القسم الرئيسي">
            <SelectControl value={form.main_department} onChange={(value) => set("main_department", value)} options={departmentOptions} />
          </Field>
          <Field label="المسار">
            <SelectControl value={form.career_path} onChange={(value) => set("career_path", value)} options={careerPaths} />
          </Field>
        </div>
      </Panel>

      <Panel index={2} title="بيانات الوظيفة والتفاصيل الإدارية">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="القسم" required>
            <SelectControl value={form.department} onChange={(value) => set("department", value)} options={departmentOptions} />
          </Field>
          <Field label="القطاع">
            <SelectControl value={form.sector} onChange={(value) => set("sector", value)} options={sectors} />
          </Field>
          <Field label="المستوى الوظيفي" required>
            <SelectControl value={form.job_level} onChange={(value) => set("job_level", value)} options={jobLevels} />
          </Field>
          <Field label="المدير المباشر">
            <InputControl value={form.manager_name} onChange={(value) => set("manager_name", value)} />
          </Field>
          <Field label="جدول الدوام" required>
            <SelectControl value={form.attendance_schedule} onChange={(value) => set("attendance_schedule", value)} options={schedules} />
          </Field>
          <Field label="الوظيفة الحالية" required>
            <InputControl value={form.job_title} onChange={(value) => set("job_title", value)} />
          </Field>
          <Field label="التخصص">
            <InputControl value={form.specialization} onChange={(value) => set("specialization", value)} />
          </Field>
          <Field label="المسمى الوظيفي">
            <InputControl value={form.job_designation} onChange={(value) => set("job_designation", value)} />
          </Field>
        </div>
      </Panel>

      <Panel index={3} title="بيانات التواريخ الوظيفية">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DualDate label="تاريخ الميلاد" required value={form.birth_date} onChange={(value) => set("birth_date", value)} />
          <DualDate label="تاريخ التعيين" required value={form.hire_date} onChange={(value) => set("hire_date", value)} />
          <DualDate label="تاريخ مباشرة العمل" required value={form.start_date} onChange={(value) => set("start_date", value)} />
          <DualDate label="احتساب الإجازة السنوية" required value={form.annual_leave_calc_date} onChange={(value) => set("annual_leave_calc_date", value)} />
        </div>
      </Panel>

      <Panel index={4} title="بيانات الخبرة العملية">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="عدد سنوات الخبرة">
            <InputControl type="number" min={0} value={form.experience_years} onChange={(value) => set("experience_years", Number(value))} />
          </Field>
          <Field label="فترة التجربة بالأيام">
            <InputControl type="number" min={0} value={form.probation_days} onChange={(value) => set("probation_days", Number(value))} />
          </Field>
          <Field label="تاريخ دخول المملكة">
            <InputControl type="date" value={form.kingdom_entry_date} onChange={(value) => set("kingdom_entry_date", value)} />
          </Field>
        </div>
      </Panel>
    </div>
  );

  const contactStep = (
    <div className="grid gap-4">
      <div className="border-b-8 border-[#1679bd] pb-2 text-right text-[16px] font-extrabold text-slate-950">
        بيانات التواصل
      </div>
      <Panel index={1} title="أرقام التواصل">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="التلفون">
            <InputControl value={form.landline} onChange={(value) => set("landline", value)} />
          </Field>
          <Field label="رقم الجوال 1">
            <InputControl value={form.phone} onChange={(value) => set("phone", value)} />
          </Field>
          <Field label="رقم التلفون في البلد الأصل">
            <InputControl value={form.home_country_phone} onChange={(value) => set("home_country_phone", value)} />
          </Field>
          <Field label="رقم الجوال في البلد الأصل">
            <InputControl value={form.home_country_mobile} onChange={(value) => set("home_country_mobile", value)} />
          </Field>
        </div>
      </Panel>

      <Panel index={2} title="عناوين الإقامة">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="العنوان في البلد الأصل">
            <textarea className={controlClass + " min-h-20 py-2"} value={String(form.home_country_address)} onChange={(event) => set("home_country_address", event.target.value)} />
          </Field>
          <Field label="العنوان الحالي">
            <textarea className={controlClass + " min-h-20 py-2"} value={String(form.current_address)} onChange={(event) => set("current_address", event.target.value)} />
          </Field>
        </div>
      </Panel>

      <Panel index={3} title="معلومات بريدية">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="رقم المبنى"><InputControl value={form.building_no} onChange={(value) => set("building_no", value)} /></Field>
          <Field label="الرقم البريدي"><InputControl value={form.postal_code} onChange={(value) => set("postal_code", value)} /></Field>
          <Field label="الرقم الإضافي"><InputControl value={form.additional_no} onChange={(value) => set("additional_no", value)} /></Field>
          <Field label="الحي"><InputControl value={form.district} onChange={(value) => set("district", value)} /></Field>
        </div>
      </Panel>

      <Panel index={4} title="البريد الإلكتروني">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="البريد الإلكتروني" required><InputControl type="email" value={form.email} onChange={(value) => set("email", value)} /></Field>
          <Field label="البريد الإلكتروني الخاص"><InputControl type="email" value={form.private_email} onChange={(value) => set("private_email", value)} /></Field>
          <Field label="مكان الميلاد"><SelectControl value={form.birth_place} onChange={(value) => set("birth_place", value)} options={regions} /></Field>
        </div>
      </Panel>

      <Panel index={5} title="المزيد من التفاصيل">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="العنوان المختصر"><InputControl value={form.short_address} onChange={(value) => set("short_address", value)} /></Field>
          <Field label="الشارع"><InputControl value={form.street} onChange={(value) => set("street", value)} /></Field>
          <Field label="المدينة"><InputControl value={form.city} onChange={(value) => set("city", value)} /></Field>
          <Field label="المنطقة"><InputControl value={form.address_region} onChange={(value) => set("address_region", value)} /></Field>
          <Field label="رقم الوحدة"><InputControl value={form.unit_no} onChange={(value) => set("unit_no", value)} /></Field>
          <Field label="الرقم الإضافي"><InputControl value={form.address_extra_no} onChange={(value) => set("address_extra_no", value)} /></Field>
          <Field label="ملاحظات العنوان" className="md:col-span-2 xl:col-span-3">
            <textarea className={controlClass + " min-h-20 py-2"} value={String(form.address_notes)} onChange={(event) => set("address_notes", event.target.value)} />
          </Field>
        </div>
      </Panel>
    </div>
  );

  const financialStep = (
    <div className="grid gap-5">
      <div className="border-b-8 border-[#1679bd] pb-2 text-right text-[16px] font-extrabold text-slate-950">
        البيانات المالية
      </div>
      <Panel>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="الراتب الأساسي" required>
            <InputControl type="number" min={0} value={form.basic_salary} onChange={(value) => set("basic_salary", Number(value))} />
          </Field>
          <Field label="الفئة الوظيفية" required>
            <SelectControl value={form.employment_category} onChange={(value) => set("employment_category", value)} options={jobCategories} />
          </Field>
          <Field label="فئات العقد">
            <SelectControl value={form.contract_category} onChange={(value) => set("contract_category", value)} options={contractCategories} />
          </Field>
          <Field label="اسم الكفيل" required>
            <InputControl value={form.sponsor_name} onChange={(value) => set("sponsor_name", value)} />
          </Field>
        </div>
      </Panel>

      <Panel>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="طريقة القبض">
            <SelectControl value={form.payment_method} onChange={(value) => set("payment_method", value)} options={paymentMethods} />
          </Field>
          <Field label="صاحب الحساب البنكي">
            <InputControl value={form.bank_account_holder} onChange={(value) => set("bank_account_holder", value)} />
          </Field>
          <Field label="حساب العهد">
            <InputControl value={form.custody_account} onChange={(value) => set("custody_account", value)} />
          </Field>
          <Field label="رقم مكتب العمل">
            <InputControl value={form.labor_office_no} onChange={(value) => set("labor_office_no", value)} />
          </Field>
        </div>
      </Panel>

      <Panel>
        <div className="grid gap-4 md:grid-cols-3">
          <CheckCard label="حظر تعديل البيانات البنكية" helper="منع الموظف من تعديل بياناته البنكية" checked={Boolean(form.bank_data_blocked)} onChange={(value) => set("bank_data_blocked", value)} />
          <CheckCard label="مقيد موارد" helper="ربط الموظف بقيود الموارد" checked={Boolean(form.resource_restricted)} onChange={(value) => set("resource_restricted", value)} />
          <CheckCard label="إضافة استحقاقات واستقطاعات" helper="إتاحة إعداد عناصر الرواتب" checked={Boolean(form.add_entitlements_deductions)} onChange={(value) => set("add_entitlements_deductions", value)} />
        </div>
      </Panel>
    </div>
  );

  const contractStep = (
    <div className="grid gap-5">
      <div className="border-b-8 border-[#1679bd] pb-2 text-right text-[16px] font-extrabold text-slate-950">
        العقود
      </div>
      <Panel index={1} title="تفاصيل العقد الأساسية">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="نوع العقد" required><SelectControl value={form.contract_type} onChange={(value) => set("contract_type", value)} options={contractTypes} /></Field>
          <Field label="لائحة الإجازة السنوية" required><SelectControl value={form.annual_leave_policy} onChange={(value) => set("annual_leave_policy", value)} options={leavePolicies} /></Field>
          <Field label="تاريخ نهاية العقد" required><InputControl type="date" value={form.contract_end} onChange={(value) => set("contract_end", value)} /></Field>
        </div>
      </Panel>

      <Panel index={2} title="تنظيم أوقات العمل">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Field label="نوع العمل" required><SelectControl value={form.work_type} onChange={(value) => set("work_type", value)} options={workTypes} /></Field>
          <Field label="نطاق العمل" required><SelectControl value={form.work_scope} onChange={(value) => set("work_scope", value)} options={workScopes} /></Field>
          <Field label="عدد أيام العمل الأسبوعية" required><InputControl type="number" min={1} value={form.weekly_work_days} onChange={(value) => set("weekly_work_days", Number(value))} /></Field>
          <Field label="معيار ساعات العمل" required><SelectControl value={form.work_hours_standard} onChange={(value) => set("work_hours_standard", value)} options={hourStandards} /></Field>
          <Field label="عدد ساعات العمل" required><InputControl type="number" min={1} value={form.daily_work_hours} onChange={(value) => set("daily_work_hours", Number(value))} /></Field>
        </div>
      </Panel>

      <Panel index={3} title="تنظيم الإجازات والأجرة">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="عدد أيام الراحة الأسبوعية" required><InputControl type="number" min={1} value={form.weekly_rest_days} onChange={(value) => set("weekly_rest_days", Number(value))} /></Field>
          <Field label="بنود العقد"><SelectControl value={form.contract_terms} onChange={(value) => set("contract_terms", value)} options={contractTerms} /></Field>
          <Field label="المرفقات">
            <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-[#1679bd] bg-white px-3 text-xs font-bold text-[#1679bd]">
              <MaterialIcon name="cloud_upload" size={18} />
              {contractFile ? contractFile.name : "اختيار مرفق العقد"}
              <input type="file" className="hidden" onChange={(event) => setContractFile(event.target.files?.[0] ?? null)} />
            </label>
          </Field>
        </div>
      </Panel>
    </div>
  );

  const bodies = [personalStep, workStep, contactStep, financialStep, contractStep];

  return (
    <div className="mt-4" dir="rtl">
      <Breadcrumbs trail={["عمليات شؤون الموظفين", "شؤون الموظفين", "إضافة موظف"]} />

      <div className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-5 shadow-sm">
        <div className="grid grid-cols-5">
          {steps.map((item, index) => {
            const active = index === step;
            const completed = index < step;
            const enabled = index <= step;
            return (
              <button
                key={item.title}
                type="button"
                disabled={!enabled}
                onClick={() => enabled && setStep(index)}
                className="relative grid min-w-0 justify-items-center gap-2 px-1 disabled:cursor-default"
              >
                {index < steps.length - 1 ? (
                  <span className={"absolute right-1/2 top-5 h-0.5 w-full " + (index < step ? "bg-[#1679bd]" : "bg-slate-200")} />
                ) : null}
                <span
                  className={
                    "relative z-10 grid h-10 w-10 place-items-center rounded-full " +
                    (active || completed ? "bg-[#1679bd] text-white" : "bg-slate-200 text-slate-400")
                  }
                >
                  <MaterialIcon name={completed ? "check" : item.icon} size={20} />
                </span>
                <span className={"truncate text-[11px] font-extrabold md:text-[13px] " + (active ? "text-[#1679bd]" : "text-slate-900")}>
                  {item.title}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3">{bodies[step]}</div>

      <div className="sticky bottom-0 z-20 mt-6 flex items-center justify-between border-t border-slate-200 bg-white/95 px-3 py-3 backdrop-blur">
        <button
          type="button"
          onClick={previous}
          disabled={step === 0 || save.isPending}
          className="inline-flex items-center gap-2 rounded-full bg-[#1679bd] px-6 py-2.5 text-sm font-bold text-white shadow disabled:cursor-not-allowed disabled:opacity-40"
        >
          <MaterialIcon name="arrow_forward" size={19} />
          السابق
        </button>

        {step < steps.length - 1 ? (
          <button
            type="button"
            onClick={next}
            className="inline-flex items-center gap-2 rounded-full bg-[#1679bd] px-6 py-2.5 text-sm font-bold text-white shadow"
          >
            التالي
            <MaterialIcon name="arrow_back" size={19} />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={save.isPending}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-7 py-2.5 text-sm font-bold text-white shadow disabled:cursor-wait disabled:opacity-60"
          >
            <MaterialIcon name="save" size={19} />
            {save.isPending ? "جارٍ الحفظ..." : "حفظ"}
          </button>
        )}
      </div>
    </div>
  );
}
