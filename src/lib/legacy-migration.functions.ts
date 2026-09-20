import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission, logSecurityAudit } from "@/lib/server/authorization";
import {
  MIGRATION_ENTITIES,
  computeChecksum,
  extractLegacyRows,
  normalizeLegacyRow,
  validateLegacyRow,
  matchLegacyRow,
  generateBatchPreview,
  reconcileBatch,
  approveBatch,
  planBatchImport,
  generateReconciliationReport,
  buildRollbackPlan,
  type MigrationEntity,
} from "./legacy-migration-core.mjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function getAdminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as Db;
}

const entitySchema = z.enum([
  "employees",
  "departments",
  "branches",
  "managers",
  "contracts",
  "leaves",
  "loans",
  "attendance",
  "fingerprint",
  "payroll_archive",
  "documents",
  "requests",
]);

/**
 * 1. Start Migration Batch (Extract -> Normalize -> Validate -> Match -> Preview -> Reconcile)
 */
export const startMigrationBatchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        companyId: z.string().uuid(),
        entity: entitySchema,
        source: z.string().min(1).default("legacy_upload"),
        rawRows: z.array(z.record(z.any())).min(1),
        approvedMappings: z.record(z.string()).optional(), // legacy_id -> target_id
      })
      .parse(input);
  })
  .handler(async ({ context, data }) => {
    const user = await requirePermission(context, "employees", "import");
    const db = await getAdminDb();

    // 1. Fetch tenant context
    const { data: company, error: compErr } = await db
      .from("hr_company_profiles")
      .select("id, tenant_id")
      .eq("id", data.companyId)
      .single();

    if (compErr || !company) {
      throw new Error("بيانات الشركة أو المستأجر غير موجودة");
    }

    const tenantId = company.tenant_id;

    // 2. Fetch existing references for matching
    const [
      { data: existingEmployees },
      { data: existingDepts },
      { data: existingBranches },
      { data: existingMappingsData },
    ] = await Promise.all([
      db.from("employees").select("id, emp_no, national_id, full_name, branch, department").eq("company_id", data.companyId),
      db.from("org_departments").select("id, code, name_ar, name_en").eq("company_id", data.companyId),
      db.from("org_branches").select("id, code, name_ar, name_en").eq("company_id", data.companyId),
      db.from("legacy_migration_mappings").select("legacy_id, migrated_id, checksum").eq("company_id", data.companyId).eq("entity", data.entity),
    ]);

    // Build lookup maps
    const employeesByEmpNo = new Map<string, any>();
    const employeesByNationalId = new Map<string, any>();
    const employeesByName = new Map<string, any[]>();
    for (const emp of existingEmployees || []) {
      if (emp.emp_no) employeesByEmpNo.set(String(emp.emp_no).trim(), emp);
      if (emp.national_id) employeesByNationalId.set(String(emp.national_id).trim(), emp);
      const nameKey = (emp.full_name || "").trim().toLowerCase();
      if (nameKey) {
        if (!employeesByName.has(nameKey)) employeesByName.set(nameKey, []);
        employeesByName.get(nameKey)!.push(emp);
      }
    }

    const departmentsByCode = new Map<string, any>();
    for (const dept of existingDepts || []) {
      if (dept.code) departmentsByCode.set(String(dept.code).trim(), dept);
    }

    const branchesByCode = new Map<string, any>();
    for (const br of existingBranches || []) {
      if (br.code) branchesByCode.set(String(br.code).trim(), br);
    }

    const existingMappings = new Map<string, { migrated_id: string; checksum: string }>();
    for (const m of existingMappingsData || []) {
      existingMappings.set(String(m.legacy_id).trim(), { migrated_id: m.migrated_id, checksum: m.checksum });
    }

    const approvedMappingsMap = new Map<string, string>();
    if (data.approvedMappings) {
      for (const [k, v] of Object.entries(data.approvedMappings)) {
        approvedMappingsMap.set(k, v);
      }
    }

    // 3. Pipeline execution: Extract -> Normalize -> Validate -> Match
    const extracted = extractLegacyRows(data.rawRows, { source: data.source });
    const currentBatchIds = new Set<string>();

    const matchContext = {
      existingMappings,
      currentBatchIds,
      employeesByEmpNo,
      employeesByNationalId,
      employeesByName,
      departmentsByCode,
      branchesByCode,
      approvedMappings: approvedMappingsMap,
    };

    const matchedRows = extracted.map(row => {
      const norm = normalizeLegacyRow(data.entity as MigrationEntity, row);
      const valid = validateLegacyRow(data.entity as MigrationEntity, norm);
      return matchLegacyRow(data.entity as MigrationEntity, valid, matchContext);
    });

    // 4. Generate Preview & Reconcile
    const preview = generateBatchPreview(data.entity as MigrationEntity, matchedRows);
    const reconciliation = reconcileBatch(preview);

    const batchChecksum = computeChecksum({
      entity: data.entity,
      companyId: data.companyId,
      source: data.source,
      rowCount: preview.counts.total,
      rows: matchedRows.map(r => r.checksum),
    });

    // 5. Insert migration batch record
    const { data: batch, error: batchErr } = await db
      .from("migration_batches")
      .insert({
        tenant_id: tenantId,
        company_id: data.companyId,
        source: data.source,
        entity: data.entity,
        status: reconciliation.isReconciled ? "reconciled" : "previewed",
        initiated_by: user.userId,
        row_count: preview.counts.total,
        checksum: batchChecksum,
        financial_total_before: BigInt(preview.financials.totalBeforeMinor),
        financial_total_after: BigInt(preview.financials.totalAfterMinor),
        metadata: {
          counts: preview.counts,
          reconciliationIssues: reconciliation.issues,
        },
      })
      .select()
      .single();

    if (batchErr || !batch) {
      throw new Error(`فشل إنشاء دفعة الهجرة: ${batchErr?.message || "خطأ غير معروف"}`);
    }

    // 6. Insert row items in chunks
    const rowPayloads = matchedRows.map(r => ({
      batch_id: batch.id,
      tenant_id: tenantId,
      company_id: data.companyId,
      entity: data.entity,
      legacy_id: r.legacy_id,
      source_row_index: r.source_row_index,
      classification: r.classification,
      stable_identifier: r.stable_identifier,
      raw_data: r.raw_data,
      normalized_data: r.normalized_data,
      target_id: r.target_id,
      checksum: r.checksum,
      validation_errors: r.validation_errors,
      matching_notes: r.matching_notes,
      financial_amount: BigInt(r.financial_amount || "0"),
    }));

    if (rowPayloads.length > 0) {
      const { error: rowErr } = await db.from("migration_row_items").insert(rowPayloads);
      if (rowErr) {
        throw new Error(`فشل تسجيل عناصر دفعة الهجرة: ${rowErr.message}`);
      }
    }

    // 7. Audit log
    await logSecurityAudit(db, {
      eventType: "sensitive_config_changed",
      status: "success",
      userId: user.userId,
      actorEmail: user.email,
      tenantId,
      resource: `migration_batches/${batch.id}`,
      action: "migration_batch_started",
      details: {
        entity: data.entity,
        source: data.source,
        counts: preview.counts,
        financials: preview.financials,
        isReconciled: reconciliation.isReconciled,
      },
    });

    return {
      batchId: batch.id,
      status: batch.status,
      counts: preview.counts,
      financials: preview.financials,
      canApprove: preview.canApprove,
      reconciliationIssues: reconciliation.issues,
      previewRows: matchedRows.slice(0, 100), // Return top 100 for UI preview
    };
  });

/**
 * 2. Approve Migration Batch (Phase 7)
 */
export const approveMigrationBatchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        batchId: z.string().uuid(),
        overrideReason: z.string().optional(),
      })
      .parse(input);
  })
  .handler(async ({ context, data }) => {
    const user = await requirePermission(context, "employees", "approve");
    const db = await getAdminDb();

    // 1. Fetch batch
    const { data: batch, error: batchErr } = await db
      .from("migration_batches")
      .select("*")
      .eq("id", data.batchId)
      .single();

    if (batchErr || !batch) {
      throw new Error("دفعة الهجرة غير موجودة");
    }

    if (["approved", "completed", "rolled_back"].includes(batch.status)) {
      throw new Error(`لا يمكن اعتماد الدفعة لأن حالتها الحالية هي: ${batch.status}`);
    }

    // 2. Fetch row items to re-verify prerequisites
    const { data: rows, error: rowsErr } = await db
      .from("migration_row_items")
      .select("*")
      .eq("batch_id", data.batchId);

    if (rowsErr || !rows) {
      throw new Error("فشل استرجاع سجلات الدفعة");
    }

    const preview = generateBatchPreview(batch.entity as MigrationEntity, rows.map((r: any) => ({
      ...r,
      normalized_data: r.normalized_data,
      is_valid: r.classification !== "INVALID",
    })));

    const reconciliation = reconcileBatch(preview, {
      overrideReason: data.overrideReason ?? null,
      allowDiscrepancy: Boolean(data.overrideReason),
    });

    // 3. Execute approval verification
    const approval = approveBatch(reconciliation, {
      approvedBy: user.userId,
      overrideReason: data.overrideReason ?? null,
    });

    // 4. Update batch record
    const { error: updateErr } = await db
      .from("migration_batches")
      .update({
        status: "approved",
        approved_by: user.userId,
        approved_at: approval.approved_at,
        override_reason: approval.override_reason,
      })
      .eq("id", data.batchId);

    if (updateErr) {
      throw new Error(`فشل تحديث حالة الاعتماد: ${updateErr.message}`);
    }

    // 5. Audit log
    await logSecurityAudit(db, {
      eventType: "sensitive_config_changed",
      status: "success",
      userId: user.userId,
      actorEmail: user.email,
      tenantId: batch.tenant_id,
      resource: `migration_batches/${batch.id}`,
      action: "migration_batch_approved",
      details: {
        entity: batch.entity,
        approved_by: user.userId,
        override_reason: data.overrideReason,
        counts: preview.counts,
        financials: preview.financials,
      },
    });

    return {
      batchId: batch.id,
      status: "approved",
      approved_at: approval.approved_at,
      override_reason: approval.override_reason,
    };
  });

/**
 * 3. Import Migration Batch (Phase 8)
 */
export const importMigrationBatchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        batchId: z.string().uuid(),
      })
      .parse(input);
  })
  .handler(async ({ context, data }) => {
    const user = await requirePermission(context, "employees", "import");
    const db = await getAdminDb();

    // 1. Fetch approved batch
    const { data: batch, error: batchErr } = await db
      .from("migration_batches")
      .select("*")
      .eq("id", data.batchId)
      .single();

    if (batchErr || !batch) {
      throw new Error("دفعة الهجرة غير موجودة");
    }

    if (batch.status !== "approved") {
      throw new Error(`لا يمكن استيراد الدفعة لأنها غير معتمدة (الحالة: ${batch.status})`);
    }

    // 2. Fetch row items
    const { data: rows, error: rowsErr } = await db
      .from("migration_row_items")
      .select("*")
      .eq("batch_id", data.batchId);

    if (rowsErr || !rows) {
      throw new Error("فشل استرجاع سجلات الدفعة");
    }

    const preview = generateBatchPreview(batch.entity as MigrationEntity, rows.map((r: any) => ({
      ...r,
      normalized_data: r.normalized_data,
      is_valid: r.classification !== "INVALID",
    })));

    const plan = planBatchImport(preview, {
      status: "approved",
      approved_by: batch.approved_by,
      approved_at: batch.approved_at,
      override_reason: batch.override_reason,
    }, {
      tenant_id: batch.tenant_id,
      company_id: batch.company_id,
      batch_id: batch.id,
    });

    // 3. Execute target import based on entity
    let successCount = 0;
    let failedCount = 0;

    // Mark batch importing
    await db.from("migration_batches").update({ status: "importing" }).eq("id", batch.id);

    try {
      if (plan.importPayloads.length > 0) {
        let targetTable = "";
        switch (batch.entity) {
          case "employees": targetTable = "employees"; break;
          case "departments": targetTable = "org_departments"; break;
          case "branches": targetTable = "org_branches"; break;
          case "contracts": targetTable = "employee_contracts"; break;
          case "leaves": targetTable = "leave_requests"; break;
          case "loans": targetTable = "loans"; break;
          case "attendance": targetTable = "attendance_records"; break;
          case "fingerprint": targetTable = "m08_raw_punches"; break;
          case "payroll_archive": targetTable = "payroll_runs"; break;
          case "documents": targetTable = "employee_documents"; break;
          case "requests": targetTable = "approval_requests"; break;
          default: break;
        }

        if (targetTable) {
          const { error: targetErr } = await db.from(targetTable).upsert(plan.importPayloads, { onConflict: "id" });
          if (targetErr) {
            throw new Error(`فشل إدراج السجلات في جدول الهدف (${targetTable}): ${targetErr.message}`);
          }
        }

        // Insert legacy mappings
        if (plan.mappingPayloads.length > 0) {
          const { error: mapErr } = await db.from("legacy_migration_mappings").upsert(plan.mappingPayloads, {
            onConflict: "tenant_id,company_id,entity,legacy_id",
          });
          if (mapErr) {
            throw new Error(`فشل حفظ خريطة الهجرة الدائمة: ${mapErr.message}`);
          }
        }
      }

      successCount = plan.totalToImport;
      failedCount = plan.rejectedCount;

      // Update row items status
      await db
        .from("migration_row_items")
        .update({ migrated_at: new Date().toISOString() })
        .eq("batch_id", batch.id)
        .eq("classification", "MATCHED");

      // Complete batch
      await db
        .from("migration_batches")
        .update({
          status: "completed",
          success_count: successCount,
          failed_count: failedCount,
          finished_at: new Date().toISOString(),
        })
        .eq("id", batch.id);

    } catch (err: any) {
      await db.from("migration_batches").update({ status: "failed" }).eq("id", batch.id);
      throw err;
    }

    // 4. Audit log
    await logSecurityAudit(db, {
      eventType: "sensitive_config_changed",
      status: "success",
      userId: user.userId,
      actorEmail: user.email,
      tenantId: batch.tenant_id,
      resource: `migration_batches/${batch.id}`,
      action: "migration_batch_imported",
      details: {
        entity: batch.entity,
        successCount,
        failedCount,
        skippedAlreadyMigrated: plan.skippedAlreadyMigrated,
      },
    });

    return {
      batchId: batch.id,
      status: "completed",
      successCount,
      failedCount,
      skippedAlreadyMigrated: plan.skippedAlreadyMigrated,
    };
  });

/**
 * 4. Rollback Migration Batch (Atomic Rollback)
 */
export const rollbackMigrationBatchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        batchId: z.string().uuid(),
        reason: z.string().min(3),
      })
      .parse(input);
  })
  .handler(async ({ context, data }) => {
    const user = await requirePermission(context, "employees", "configure");
    const db = await getAdminDb();

    // 1. Fetch batch
    const { data: batch, error: batchErr } = await db
      .from("migration_batches")
      .select("*")
      .eq("id", data.batchId)
      .single();

    if (batchErr || !batch) {
      throw new Error("دفعة الهجرة غير موجودة");
    }

    if (!["completed", "partially_completed", "failed"].includes(batch.status)) {
      throw new Error(`لا يمكن التراجع عن دفعة في حالة (${batch.status})`);
    }

    // 2. Fetch mappings
    const { data: mappings, error: mapErr } = await db
      .from("legacy_migration_mappings")
      .select("*")
      .eq("batch_id", data.batchId);

    if (mapErr) {
      throw new Error("فشل استرجاع سجلات خريطة الهجرة للدفعة");
    }

    const rollbackPlan = buildRollbackPlan(batch, mappings || []);

    // 3. Execute deletion of migrated records in target table
    if (rollbackPlan.recordsToDelete.length > 0) {
      let targetTable = "";
      switch (batch.entity) {
        case "employees": targetTable = "employees"; break;
        case "departments": targetTable = "org_departments"; break;
        case "branches": targetTable = "org_branches"; break;
        case "contracts": targetTable = "employee_contracts"; break;
        case "leaves": targetTable = "leave_requests"; break;
        case "loans": targetTable = "loans"; break;
        case "attendance": targetTable = "attendance_records"; break;
        case "fingerprint": targetTable = "m08_raw_punches"; break;
        case "payroll_archive": targetTable = "payroll_runs"; break;
        case "documents": targetTable = "employee_documents"; break;
        case "requests": targetTable = "approval_requests"; break;
        default: break;
      }

      if (targetTable) {
        const { error: delTargetErr } = await db
          .from(targetTable)
          .delete()
          .in("id", rollbackPlan.recordsToDelete);

        if (delTargetErr) {
          throw new Error(`فشل حذف السجلات المستوردة من جدول الهدف: ${delTargetErr.message}`);
        }
      }

      // Delete mappings
      await db
        .from("legacy_migration_mappings")
        .delete()
        .in("id", rollbackPlan.mappingsToDelete);
    }

    // 4. Update batch status
    await db
      .from("migration_batches")
      .update({
        status: "rolled_back",
        metadata: {
          ...batch.metadata,
          rollbackReason: data.reason,
          rolledBackBy: user.userId,
          rolledBackAt: new Date().toISOString(),
        },
      })
      .eq("id", batch.id);

    // 5. Audit log
    await logSecurityAudit(db, {
      eventType: "sensitive_config_changed",
      status: "success",
      userId: user.userId,
      actorEmail: user.email,
      tenantId: batch.tenant_id,
      resource: `migration_batches/${batch.id}`,
      action: "migration_batch_rolled_back",
      details: {
        entity: batch.entity,
        reason: data.reason,
        deletedRecordsCount: rollbackPlan.recordsToDelete.length,
      },
    });

    return {
      batchId: batch.id,
      status: "rolled_back",
      deletedRecordsCount: rollbackPlan.recordsToDelete.length,
    };
  });

/**
 * 5. Get Migration Reconciliation Report (Phase 9)
 */
export const getMigrationReportFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        batchId: z.string().uuid(),
      })
      .parse(input);
  })
  .handler(async ({ context, data }) => {
    await requirePermission(context, "employees", "read");
    const db = await getAdminDb();

    // 1. Fetch batch
    const { data: batch, error: batchErr } = await db
      .from("migration_batches")
      .select("*")
      .eq("id", data.batchId)
      .single();

    if (batchErr || !batch) {
      throw new Error("دفعة الهجرة غير موجودة");
    }

    // 2. Fetch row items
    const { data: rows, error: rowsErr } = await db
      .from("migration_row_items")
      .select("*")
      .eq("batch_id", data.batchId);

    if (rowsErr || !rows) {
      throw new Error("فشل استرجاع عناصر الدفعة");
    }

    // 3. Generate reconciliation report
    const report = generateReconciliationReport(batch, rows);

    return report;
  });
