import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission, logSecurityAudit } from "@/lib/server/authorization";
import {
  validateEmployee,
  validateStatusTransition,
  maskNationalId,
  maskIban,
  maskFinancialValue,
  EMPLOYMENT_STATUSES,
  STATUS_LABELS_AR,
  type EmployeeEntity,
} from "./employee-core.mjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function getAdminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as Db;
}

const employeeSchema = z.object({
  id: z.string().uuid().optional(),
  tenantId: z.string().uuid(),
  companyId: z.string().uuid(),
  empNo: z.string().trim().min(1, "الرقم الوظيفي مطلوب").max(50),
  fullName: z.string().trim().min(2, "اسم الموظف مطلوب").max(200),
  employeeNameEn: z.string().trim().optional().nullable(),
  nationalId: z.string().trim().optional().nullable(),
  iban: z.string().trim().optional().nullable(),
  basicSalary: z.number().min(0, "الراتب الأساسي لا يمكن أن يكون سالباً").default(0),
  allowances: z.number().min(0, "البدلات لا يمكن أن تكون سالبة").default(0),
  employmentStatus: z
    .enum(["active", "probation", "suspended", "on_leave", "terminated", "resigned"])
    .default("active"),
  branchId: z.string().uuid().optional().nullable(),
  departmentId: z.string().uuid().optional().nullable(),
  jobId: z.string().uuid().optional().nullable(),
  positionId: z.string().uuid().optional().nullable(),
  hireDate: z.string().optional(),
  contractEnd: z.string().optional().nullable(),
  birthDate: z.string().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().email("صيغة البريد الإلكتروني غير صحيحة").optional().nullable().or(z.literal("")),
  gender: z.string().default("ذكر"),
  nationality: z.string().default("سعودي"),
});

/**
 * List employees with tenant scoping and dynamic masking of sensitive data.
 */
export const listEmployeesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        tenantId: z.string().uuid(),
        companyId: z.string().uuid(),
        search: z.string().optional(),
        status: z.string().optional(),
        branchId: z.string().uuid().optional(),
        departmentId: z.string().uuid().optional(),
      })
      .parse(input);
  })
  .handler(async ({ data, context }) => {
    const actor = await requirePermission(context, "/staff", "read");
    const db = await getAdminDb();

    // Check if actor has permission to see unmasked sensitive fields
    const canViewSensitive =
      actor.role === "admin" ||
      actor.groupNames.some((g) =>
        g.includes("إدارة") || g.includes("مالي") || g.includes("مدير") || g.includes("رواتب")
      );

    let query = db
      .from("employees")
      .select("*")
      .or(`tenant_id.eq.${data.tenantId},tenant_id.is.null`)
      .order("emp_no", { ascending: true });

    if (data.companyId) {
      query = query.or(`company_id.eq.${data.companyId},company_id.is.null`);
    }

    if (data.branchId) {
      query = query.eq("branch_id", data.branchId);
    }

    if (data.departmentId) {
      query = query.eq("department_id", data.departmentId);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(`تعذر جلب بيانات الموظفين: ${error.message}`);

    // Mask sensitive fields if unauthorized
    const sanitized = (rows ?? []).map((row: any) => ({
      ...row,
      national_id: maskNationalId(row.national_id, canViewSensitive),
      iban: maskIban(row.iban, canViewSensitive),
      basic_salary: maskFinancialValue(row.basic_salary, canViewSensitive),
      allowances: maskFinancialValue(row.allowances, canViewSensitive),
      is_masked: !canViewSensitive,
    }));

    return sanitized;
  });

/**
 * Get employee details by ID with sensitive data masking.
 */
export const getEmployeeByIdFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        tenantId: z.string().uuid(),
        employeeId: z.string().uuid(),
      })
      .parse(input);
  })
  .handler(async ({ data, context }) => {
    const actor = await requirePermission(context, "/staff", "read");
    const db = await getAdminDb();

    const canViewSensitive =
      actor.role === "admin" ||
      actor.groupNames.some((g) =>
        g.includes("إدارة") || g.includes("مالي") || g.includes("مدير") || g.includes("رواتب")
      );

    const { data: emp, error } = await db
      .from("employees")
      .select("*")
      .eq("id", data.employeeId)
      .single();

    if (error || !emp) throw new Error("الموظف غير موجود");

    return {
      ...emp,
      national_id: maskNationalId(emp.national_id, canViewSensitive),
      iban: maskIban(emp.iban, canViewSensitive),
      basic_salary: maskFinancialValue(emp.basic_salary, canViewSensitive),
      allowances: maskFinancialValue(emp.allowances, canViewSensitive),
      is_masked: !canViewSensitive,
    };
  });

/**
 * Save or update employee master record with business validation and historical tracking.
 */
export const saveEmployeeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => employeeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const action = data.id ? "update" : "create";
    const actor = await requirePermission(context, "/staff", action);
    const db = await getAdminDb();

    // Fetch existing employees for uniqueness validation
    const { data: existing, error: fetchErr } = await db
      .from("employees")
      .select("id, emp_no")
      .eq("company_id", data.companyId);

    if (fetchErr) throw new Error(fetchErr.message);

    const validation = validateEmployee(
      {
        id: data.id,
        emp_no: data.empNo,
        full_name: data.fullName,
        employee_name_en: data.employeeNameEn,
        national_id: data.nationalId,
        iban: data.iban,
        basic_salary: data.basicSalary,
        allowances: data.allowances,
        employment_status: data.employmentStatus,
        branch_id: data.branchId,
        department_id: data.departmentId,
        job_id: data.jobId,
        position_id: data.positionId,
        hire_date: data.hireDate,
        contract_end: data.contractEnd,
        birth_date: data.birthDate,
        phone: data.phone,
        email: data.email,
        gender: data.gender,
        nationality: data.nationality,
      },
      (existing ?? []) as EmployeeEntity[]
    );

    if (!validation.isValid) {
      const msg = Object.values(validation.errors).join("، ");
      throw new Error(msg);
    }

    const norm = validation.normalized;
    const payload = {
      ...(data.id ? { id: data.id } : {}),
      tenant_id: data.tenantId,
      company_id: data.companyId,
      emp_no: norm["emp_no"],
      full_name: norm["full_name"],
      employee_name_en: norm["employee_name_en"] || null,
      national_id: norm["national_id"] || null,
      iban: norm["iban"] || null,
      basic_salary: norm["basic_salary"],
      allowances: norm["allowances"],
      employment_status: norm["employment_status"],
      status: norm["status"],
      branch_id: norm["branch_id"] || null,
      department_id: norm["department_id"] || null,
      job_id: norm["job_id"] || null,
      position_id: norm["position_id"] || null,
      hire_date: norm["hire_date"],
      contract_end: norm["contract_end"] || null,
      birth_date: data.birthDate || null,
      phone: norm["phone"] || null,
      email: norm["email"] || null,
      gender: norm["gender"] || "ذكر",
      nationality: norm["nationality"] || "سعودي",
      updated_at: new Date().toISOString(),
    };

    const { data: saved, error: saveErr } = await db
      .from("employees")
      .upsert(payload)
      .select()
      .single();

    if (saveErr) throw new Error(`تعذر حفظ بيانات الموظف: ${saveErr.message}`);

    await logSecurityAudit(db, {
      eventType: "sensitive_config_changed",
      status: "success",
      userId: actor.userId,
      actorEmail: actor.email,
      tenantId: data.tenantId,
      resource: "employee_master",
      action: data.id ? "update" : "create",
      details: { empNo: payload.emp_no, fullName: payload.full_name },
    });

    return { success: true, employee: saved };
  });

/**
 * Safely transition employee lifecycle status without destructive deletion.
 */
export const transitionEmployeeStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        tenantId: z.string().uuid(),
        companyId: z.string().uuid(),
        employeeId: z.string().uuid(),
        targetStatus: z.enum([
          "active",
          "probation",
          "suspended",
          "on_leave",
          "terminated",
          "resigned",
        ]),
        reason: z.string().trim().min(3, "سبب تغيير الحالة إلزامي (3 أحرف على الأقل)"),
        notes: z.string().optional(),
        effectiveDate: z.string().optional(),
      })
      .parse(input);
  })
  .handler(async ({ data, context }) => {
    const actor = await requirePermission(context, "/staff", "update");
    const db = await getAdminDb();

    // Call database RPC to perform atomic transition
    const { data: rpcRes, error: rpcErr } = await db.rpc("transition_employee_lifecycle_status", {
      p_tenant_id: data.tenantId,
      p_company_id: data.companyId,
      p_employee_id: data.employeeId,
      p_target_status: data.targetStatus,
      p_reason: data.reason,
      p_notes: data.notes || null,
      p_effective_date: data.effectiveDate || new Date().toISOString().slice(0, 10),
    });

    if (rpcErr) throw new Error(`تعذر تعديل حالة الموظف: ${rpcErr.message}`);

    await logSecurityAudit(db, {
      eventType: "sensitive_config_changed",
      status: "success",
      userId: actor.userId,
      actorEmail: actor.email,
      tenantId: data.tenantId,
      resource: "employee_lifecycle",
      action: "transition",
      details: {
        employeeId: data.employeeId,
        targetStatus: data.targetStatus,
        reason: data.reason,
      },
    });

    return { success: true, ...rpcRes };
  });

/**
 * List historical service assignments for an employee.
 */
export const listEmployeeAssignmentsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        tenantId: z.string().uuid(),
        employeeId: z.string().uuid(),
      })
      .parse(input);
  })
  .handler(async ({ data, context }) => {
    await requirePermission(context, "/staff", "read");
    const db = await getAdminDb();

    const { data: rows, error } = await db
      .from("org_historical_assignments")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .eq("employee_id", data.employeeId)
      .order("effective_date", { ascending: false });

    if (error) throw new Error(`تعذر جلب التكليفات التاريخية: ${error.message}`);
    return rows ?? [];
  });

/**
 * List lifecycle status transitions for an employee.
 */
export const listEmployeeLifecycleTransitionsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        tenantId: z.string().uuid(),
        employeeId: z.string().uuid(),
      })
      .parse(input);
  })
  .handler(async ({ data, context }) => {
    await requirePermission(context, "/staff", "read");
    const db = await getAdminDb();

    const { data: rows, error } = await db
      .from("employee_lifecycle_transitions")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .eq("employee_id", data.employeeId)
      .order("effective_date", { ascending: false });

    if (error) throw new Error(`تعذر جلب سجل الحالات التشغيلية: ${error.message}`);
    return rows ?? [];
  });
