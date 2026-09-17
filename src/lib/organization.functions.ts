import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission, logSecurityAudit } from "@/lib/server/authorization";
import {
  validateBranch,
  validateDepartment,
  validateCostCenter,
  validateJob,
  validatePosition,
  type BranchEntity,
  type DepartmentEntity,
} from "./organization-core.mjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function getAdminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as Db;
}

const branchSchema = z.object({
  id: z.string().uuid().optional(),
  tenantId: z.string().uuid(),
  companyId: z.string().uuid(),
  code: z.string().trim().min(1, "رمز الفرع مطلوب").max(50),
  nameAr: z.string().trim().min(1, "اسم الفرع بالعربية مطلوب").max(200),
  nameEn: z.string().trim().optional(),
  city: z.string().trim().optional(),
  district: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().email("البريد الإلكتروني غير صحيح").optional().or(z.literal("")),
  managerId: z.string().uuid().optional().nullable(),
  active: z.boolean().default(true),
  effectiveFrom: z.string().optional(),
  effectiveTo: z.string().optional().nullable(),
});

const departmentSchema = z.object({
  id: z.string().uuid().optional(),
  tenantId: z.string().uuid(),
  companyId: z.string().uuid(),
  branchId: z.string().uuid().optional().nullable(),
  sectorId: z.string().uuid().optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
  costCenterId: z.string().uuid().optional().nullable(),
  level: z.enum(["main_department", "department", "section", "team"]).default("department"),
  code: z.string().trim().min(1, "رمز القسم مطلوب").max(50),
  nameAr: z.string().trim().min(1, "اسم القسم بالعربية مطلوب").max(200),
  nameEn: z.string().trim().optional(),
  managerId: z.string().uuid().optional().nullable(),
  active: z.boolean().default(true),
  effectiveFrom: z.string().optional(),
  effectiveTo: z.string().optional().nullable(),
});

/**
 * List branches for a tenant and company.
 */
export const listBranchesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z.object({ tenantId: z.string().uuid(), companyId: z.string().uuid() }).parse(input);
  })
  .handler(async ({ data, context }): Promise<BranchEntity[]> => {
    await requirePermission(context, "/settings/branches", "read");
    const db = await getAdminDb();
    const { data: rows, error } = await db
      .from("org_branches")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .eq("company_id", data.companyId)
      .order("code", { ascending: true });

    if (error) throw new Error(`تعذر استرجاع الفروع: ${error.message}`);
    return (rows ?? []) as BranchEntity[];
  });

/**
 * Save or update a branch.
 */
export const saveBranchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => branchSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ success: boolean; branch: BranchEntity }> => {
    const actor = await requirePermission(context, "/settings/branches", "update");
    const db = await getAdminDb();

    // Fetch existing branches for uniqueness validation
    const { data: existing, error: fetchErr } = await db
      .from("org_branches")
      .select("*")
      .eq("company_id", data.companyId);

    if (fetchErr) throw new Error(fetchErr.message);

    const validation = validateBranch(
      {
        id: data.id,
        code: data.code,
        name_ar: data.nameAr,
        name_en: data.nameEn,
        active: data.active,
        effective_from: data.effectiveFrom,
        effective_to: data.effectiveTo,
      },
      (existing ?? []) as BranchEntity[],
    );

    if (!validation.isValid) {
      const msg = Object.values(validation.errors).join("، ");
      throw new Error(msg);
    }

    const payload = {
      ...(data.id ? { id: data.id } : {}),
      tenant_id: data.tenantId,
      company_id: data.companyId,
      code: validation.normalized.code,
      name_ar: validation.normalized.name_ar,
      name_en: validation.normalized.name_en,
      city: data.city || null,
      district: data.district || null,
      phone: data.phone || null,
      email: data.email || null,
      manager_id: data.managerId || null,
      active: validation.normalized.active,
      effective_from: validation.normalized.effective_from,
      effective_to: validation.normalized.effective_to,
      updated_at: new Date().toISOString(),
      updated_by: actor.userId,
      ...(!data.id ? { created_by: actor.userId } : {}),
    };

    const { data: saved, error: saveErr } = await db
      .from("org_branches")
      .upsert(payload)
      .select()
      .single();

    if (saveErr) throw new Error(`تعذر حفظ الفرع: ${saveErr.message}`);

    await logSecurityAudit(db, {
      eventType: "sensitive_config_changed",
      status: "success",
      userId: actor.userId,
      actorEmail: actor.email,
      tenantId: data.tenantId,
      resource: "org_branch",
      action: data.id ? "update" : "create",
      details: { branchCode: payload.code, branchName: payload.name_ar },
    });

    return { success: true, branch: saved as BranchEntity };
  });

/**
 * Safely deactivate a branch (never destructive delete).
 */
export const deactivateBranchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z.object({ branchId: z.string().uuid(), tenantId: z.string().uuid() }).parse(input);
  })
  .handler(async ({ data, context }): Promise<{ success: boolean }> => {
    const actor = await requirePermission(context, "/settings/branches", "delete");
    const db = await getAdminDb();

    const { error } = await db
      .from("org_branches")
      .update({
        active: false,
        effective_to: new Date().toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
        updated_by: actor.userId,
      })
      .eq("id", data.branchId)
      .eq("tenant_id", data.tenantId);

    if (error) throw new Error(`تعذر إيقاف الفرع: ${error.message}`);

    await logSecurityAudit(db, {
      eventType: "sensitive_config_changed",
      status: "success",
      userId: actor.userId,
      actorEmail: actor.email,
      tenantId: data.tenantId,
      resource: "org_branch",
      action: "delete",
      details: { branchId: data.branchId, action: "deactivated" },
    });

    return { success: true };
  });

/**
 * List departments for a tenant and company.
 */
export const listDepartmentsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z.object({ tenantId: z.string().uuid(), companyId: z.string().uuid() }).parse(input);
  })
  .handler(async ({ data, context }): Promise<DepartmentEntity[]> => {
    await requirePermission(context, "/departments", "read");
    const db = await getAdminDb();
    const { data: rows, error } = await db
      .from("org_departments")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .eq("company_id", data.companyId)
      .order("code", { ascending: true });

    if (error) throw new Error(`تعذر استرجاع الأقسام: ${error.message}`);
    return (rows ?? []) as DepartmentEntity[];
  });

/**
 * Save or update a department.
 */
export const saveDepartmentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => departmentSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ success: boolean; department: DepartmentEntity }> => {
    const actor = await requirePermission(context, "/departments", "update");
    const db = await getAdminDb();

    const { data: existing, error: fetchErr } = await db
      .from("org_departments")
      .select("*")
      .eq("company_id", data.companyId);

    if (fetchErr) throw new Error(fetchErr.message);

    const validation = validateDepartment(
      {
        id: data.id,
        code: data.code,
        name_ar: data.nameAr,
        name_en: data.nameEn,
        level: data.level,
        parent_id: data.parentId,
        active: data.active,
        effective_from: data.effectiveFrom,
        effective_to: data.effectiveTo,
      },
      (existing ?? []) as DepartmentEntity[],
    );

    if (!validation.isValid) {
      const msg = Object.values(validation.errors).join("، ");
      throw new Error(msg);
    }

    const payload = {
      ...(data.id ? { id: data.id } : {}),
      tenant_id: data.tenantId,
      company_id: data.companyId,
      branch_id: data.branchId || null,
      sector_id: data.sectorId || null,
      parent_id: data.parentId || null,
      cost_center_id: data.costCenterId || null,
      level: validation.normalized.level,
      code: validation.normalized.code,
      name_ar: validation.normalized.name_ar,
      name_en: validation.normalized.name_en,
      manager_id: data.managerId || null,
      active: validation.normalized.active,
      effective_from: validation.normalized.effective_from,
      effective_to: validation.normalized.effective_to,
      updated_at: new Date().toISOString(),
      updated_by: actor.userId,
      ...(!data.id ? { created_by: actor.userId } : {}),
    };

    const { data: saved, error: saveErr } = await db
      .from("org_departments")
      .upsert(payload)
      .select()
      .single();

    if (saveErr) throw new Error(`تعذر حفظ القسم: ${saveErr.message}`);

    await logSecurityAudit(db, {
      eventType: "sensitive_config_changed",
      status: "success",
      userId: actor.userId,
      actorEmail: actor.email,
      tenantId: data.tenantId,
      resource: "org_department",
      action: data.id ? "update" : "create",
      details: { deptCode: payload.code, deptName: payload.name_ar, level: payload.level },
    });

    return { success: true, department: saved as DepartmentEntity };
  });

/**
 * Safely deactivate a department.
 */
export const deactivateDepartmentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z.object({ departmentId: z.string().uuid(), tenantId: z.string().uuid() }).parse(input);
  })
  .handler(async ({ data, context }): Promise<{ success: boolean }> => {
    const actor = await requirePermission(context, "/departments", "delete");
    const db = await getAdminDb();

    const { error } = await db
      .from("org_departments")
      .update({
        active: false,
        effective_to: new Date().toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
        updated_by: actor.userId,
      })
      .eq("id", data.departmentId)
      .eq("tenant_id", data.tenantId);

    if (error) throw new Error(`تعذر إيقاف القسم: ${error.message}`);

    await logSecurityAudit(db, {
      eventType: "sensitive_config_changed",
      status: "success",
      userId: actor.userId,
      actorEmail: actor.email,
      tenantId: data.tenantId,
      resource: "org_department",
      action: "delete",
      details: { departmentId: data.departmentId, action: "deactivated" },
    });

    return { success: true };
  });

/**
 * Run legacy text reconciliation RPC (dry-run or commit).
 */
export const runLegacyOrgReconciliationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        tenantId: z.string().uuid(),
        companyId: z.string().uuid(),
        dryRun: z.boolean().default(true),
      })
      .parse(input);
  })
  .handler(async ({ data, context }): Promise<any> => {
    const actor = await requirePermission(
      context,
      "/settings/general",
      data.dryRun ? "read" : "update",
    );
    const db = await getAdminDb();

    const { data: result, error } = await db.rpc("reconcile_legacy_org_entities", {
      p_tenant_id: data.tenantId,
      p_company_id: data.companyId,
      p_dry_run: data.dryRun,
    });

    if (error) throw new Error(`تعذر مطابقة البيانات النصية القديمة: ${error.message}`);

    if (!data.dryRun) {
      await logSecurityAudit(db, {
        eventType: "sensitive_config_changed",
        status: "success",
        userId: actor.userId,
        actorEmail: actor.email,
        tenantId: data.tenantId,
        resource: "legacy_org_reconciliation",
        action: "update",
        details: { reconciliationResult: result },
      });
    }

    return result;
  });
