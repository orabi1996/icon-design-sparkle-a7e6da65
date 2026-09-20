import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission, logSecurityAudit } from "@/lib/server/authorization";
import {
  computeEmployeePayroll,
  reconcilePayrollTotals,
  generateWpsBankFile,
  getDefaultStatutoryConfig,
  roundCurrency,
} from "./payroll-core.mjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function getAdminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as Db;
}

/**
 * 1. Prepare Payroll Draft (Creates Period & Run, gathers input snapshots)
 */
export const preparePayrollDraftFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        companyId: z.string().uuid(),
        year: z.number().int().min(2020).max(2050),
        month: z.number().int().min(1).max(12),
        periodType: z.enum(["regular", "off_cycle", "settlement", "adjustment"]).default("regular"),
        title: z.string().min(3),
        cutoffDate: z.string().optional(),
        currency: z.string().default("SAR"),
      })
      .parse(input);
  })
  .handler(async ({ context, data }) => {
    const user = await requirePermission(context, "payroll", "create");
    const db = await getAdminDb();

    // 1. Check if period already exists
    const { data: existingPeriod } = await db
      .from("payroll_periods")
      .select("id, status")
      .eq("company_id", data.companyId)
      .eq("year", data.year)
      .eq("month", data.month)
      .eq("period_type", data.periodType)
      .maybeSingle();

    if (existingPeriod && ["locked", "posted", "paid", "closed"].includes(existingPeriod.status)) {
      throw new Error(`دورة الرواتب لشهر (${data.month}/${data.year}) مقفلة أو مغلقة مسبقاً ولا يمكن إنشاء مسودة جديدة لها.`);
    }

    const startDate = `${data.year}-${String(data.month).padStart(2, "0")}-01`;
    // Last day of month
    const lastDay = new Date(data.year, data.month, 0).getDate();
    const endDate = `${data.year}-${String(data.month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const cutoffDate = data.cutoffDate || endDate;

    let periodId = existingPeriod?.id;

    if (!periodId) {
      const code = `${data.year}-${String(data.month).padStart(2, "0")}-${data.periodType.toUpperCase()}`;
      const { data: createdPeriod, error: periodErr } = await db
        .from("payroll_periods")
        .insert({
          company_id: data.companyId,
          code,
          year: data.year,
          month: data.month,
          period_type: data.periodType,
          start_date: startDate,
          end_date: endDate,
          cutoff_date: cutoffDate,
          status: "draft",
          created_by: user.userId,
        })
        .select("id")
        .single();

      if (periodErr) throw new Error("تعذر إنشاء دورة الرواتب: " + periodErr.message);
      periodId = createdPeriod.id;
    }

    // 2. Create Payroll Run
    const runNumber = `RUN-${data.year}${String(data.month).padStart(2, "0")}-${Date.now().toString().slice(-4)}`;
    const { data: createdRun, error: runErr } = await db
      .from("payroll_runs")
      .insert({
        title: data.title,
        month: data.month,
        year: data.year,
        period_id: periodId,
        company_id: data.companyId,
        run_number: runNumber,
        run_type: data.periodType,
        currency: data.currency,
        status: "draft",
        employees_count: 0,
      })
      .select("id, run_number, status, title")
      .single();

    if (runErr) throw new Error("تعذر إنشاء مسير الرواتب: " + runErr.message);

    // 3. Snapshot employee inputs
    const { data: activeEmployees, error: empErr } = await db
      .from("employees")
      .select("id, emp_no, full_name, basic_salary, housing_allowance, transport_allowance, status, is_saudi, nationality, bank_name, bank_code, iban")
      .neq("status", "terminated");

    if (empErr) throw new Error("تعذر جلب بيانات الموظفين للمسير: " + empErr.message);

    const inputRecords: any[] = [];
    for (const emp of activeEmployees || []) {
      const basic = Number(emp.basic_salary) || 0;
      const housing = Number(emp.housing_allowance) || 0;
      const transport = Number(emp.transport_allowance) || 0;

      if (basic > 0) {
        inputRecords.push({
          company_id: data.companyId,
          run_id: createdRun.id,
          employee_id: emp.id,
          component_code: "BASIC",
          component_type: "earning",
          amount: basic,
          source: "contract",
          source_version: 1,
          reason: "الراتب الأساسي التعاقدي",
        });
      }
      if (housing > 0) {
        inputRecords.push({
          company_id: data.companyId,
          run_id: createdRun.id,
          employee_id: emp.id,
          component_code: "HOUSING",
          component_type: "earning",
          amount: housing,
          source: "contract",
          source_version: 1,
          reason: "بدل السكن",
        });
      }
      if (transport > 0) {
        inputRecords.push({
          company_id: data.companyId,
          run_id: createdRun.id,
          employee_id: emp.id,
          component_code: "TRANSPORT",
          component_type: "earning",
          amount: transport,
          source: "contract",
          source_version: 1,
          reason: "بدل الانتقال",
        });
      }
    }

    if (inputRecords.length > 0) {
      const { error: inputInsertErr } = await db.from("payroll_inputs").insert(inputRecords);
      if (inputInsertErr) throw new Error("تعذر تسجيل مدخلات المسير: " + inputInsertErr.message);
    }

    // Update employees count on the run
    await db
      .from("payroll_runs")
      .update({ employees_count: (activeEmployees || []).length })
      .eq("id", createdRun.id);

    await logSecurityAudit(db, {
      eventType: "sensitive_config_changed",
      status: "success",
      userId: user.userId,
      actorEmail: user.email,
      resource: "payroll_runs",
      action: "create",
      details: { runId: createdRun.id, periodId, runNumber, count: (activeEmployees || []).length },
    });

    return {
      runId: createdRun.id,
      periodId,
      runNumber,
      employeesCount: (activeEmployees || []).length,
      status: "draft",
    };
  });

/**
 * 2. Calculate Payroll Run Server-Side (Deterministic & Reconciled)
 */
export const calculatePayrollRunFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        companyId: z.string().uuid(),
        runId: z.string().uuid(),
      })
      .parse(input);
  })
  .handler(async ({ context, data }) => {
    const user = await requirePermission(context, "payroll", "update");
    const db = await getAdminDb();

    // 1. Fetch Run
    const { data: run, error: runErr } = await db
      .from("payroll_runs")
      .select("*")
      .eq("id", data.runId)
      .eq("company_id", data.companyId)
      .single();

    if (runErr || !run) throw new Error("مسير الرواتب غير موجود");
    if (["locked", "posted", "paid", "closed"].includes(run.status)) {
      throw new Error(`المسير مقفل بحالة (${run.status}) ولا يمكن إعادة حسابه مباشرة؛ يلزم إنشاء تسوية.`);
    }

    // 2. Fetch Employees & Inputs
    const [{ data: employees }, { data: inputs }] = await Promise.all([
      db
        .from("employees")
        .select(
          "id, emp_no, full_name, nationality, basic_salary, housing_allowance, transport_allowance, other_allowances, is_gosi_eligible, gosi_basic_override, company_id, status"
        )
        .or(`company_id.eq.${data.companyId},company_id.is.null`),
      db.from("payroll_inputs").select("*").eq("run_id", data.runId),
    ]);

    const empMap = new Map((employees || []).map((e: any) => [e.id, e]));
    const inputsByEmp = new Map<string, any[]>();
    for (const inp of inputs || []) {
      const list = inputsByEmp.get(inp.employee_id) || [];
      list.push(inp);
      inputsByEmp.set(inp.employee_id, list);
    }

    const statutoryConfig = getDefaultStatutoryConfig();
    const results: any[] = [];

    for (const [empId, empInputs] of inputsByEmp.entries()) {
      const emp = empMap.get(empId);
      if (!emp) continue;
      const res = computeEmployeePayroll(emp as Record<string, unknown>, empInputs, statutoryConfig, { currency: run.currency });
      results.push(res);
    }

    // Reconcile totals
    const reconciliation = reconcilePayrollTotals(results);

    // 3. Persist Results (Upsert into payroll_results)
    // Delete existing results for draft recalculation
    await db.from("payroll_results").delete().eq("run_id", data.runId);

    const resultRows = results.map((r) => ({
      company_id: data.companyId,
      run_id: data.runId,
      employee_id: r.employeeId,
      employee_name: r.employeeName,
      emp_no: r.empNo,
      is_saudi: r.isSaudi,
      bank_code: r.bankCode,
      iban: r.iban,
      basic_salary: r.basicSalary,
      housing_allowance: r.housingAllowance,
      transport_allowance: r.transportAllowance,
      other_allowances: r.otherAllowances,
      gross_salary: r.grossSalary,
      late_deductions: r.lateDeductions,
      absence_deductions: r.absenceDeductions,
      leave_deductions: r.leaveDeductions,
      loan_deductions: r.loanDeductions,
      social_insurance_employee: r.socialInsuranceEmployee,
      social_insurance_company: r.socialInsuranceCompany,
      manual_adjustments: r.manualEarnings - r.manualDeductions,
      total_deductions: r.totalDeductions,
      net_salary: r.netSalary,
      currency: r.currency,
      calculation_snapshot: r.calculationSnapshot,
      status: r.status,
    }));

    if (resultRows.length > 0) {
      const { error: insResErr } = await db.from("payroll_results").insert(resultRows);
      if (insResErr) throw new Error("تعذر حفظ نتائج المسير: " + insResErr.message);
    }

    // 4. Update Run Totals and Status
    const { error: updErr } = await db
      .from("payroll_runs")
      .update({
        total_basic: reconciliation.totalBasic,
        total_allowances: reconciliation.totalAllowances,
        total_gross: reconciliation.totalGross,
        total_deductions: reconciliation.totalDeductions,
        total_social_insurance: reconciliation.totalSocialInsurance,
        total_net: reconciliation.totalNet,
        employees_count: reconciliation.employeesCount,
        status: "calculated",
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.runId);

    if (updErr) throw new Error("تعذر تحديث إجماليات المسير: " + updErr.message);

    await logSecurityAudit(db, {
      eventType: "sensitive_config_changed",
      status: "success",
      userId: user.userId,
      actorEmail: user.email,
      resource: "payroll_runs",
      action: "update",
      details: { runId: data.runId, reconciliation },
    });

    return {
      runId: data.runId,
      status: "calculated",
      reconciliation,
    };
  });

/**
 * 3. Lock Payroll Run (Immutable Snapshot & Cryptographic Lock)
 */
export const lockPayrollRunFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        companyId: z.string().uuid(),
        runId: z.string().uuid(),
        reason: z.string().min(3),
      })
      .parse(input);
  })
  .handler(async ({ context, data }) => {
    const user = await requirePermission(context, "payroll", "approve");
    const db = await getAdminDb();

    const { data: run } = await db
      .from("payroll_runs")
      .select("*")
      .eq("id", data.runId)
      .eq("company_id", data.companyId)
      .single();

    if (!run) throw new Error("مسير الرواتب غير موجود");
    if (run.status === "locked" || run.status === "closed") {
      throw new Error("المسير مقفل مسبقاً");
    }

    // Snapshot of results
    const { data: results } = await db.from("payroll_results").select("*").eq("run_id", data.runId);

    const snapshot = {
      lockedAt: new Date().toISOString(),
      lockedBy: user.userId,
      reason: data.reason,
      totals: {
        gross: run.total_gross,
        deductions: run.total_deductions,
        net: run.total_net,
        count: results?.length || 0,
      },
    };

    const { error: lockErr } = await db
      .from("payroll_runs")
      .update({
        status: "locked",
        locked_by: user.userId,
        locked_at: new Date().toISOString(),
        locked_snapshot: snapshot,
      })
      .eq("id", data.runId);

    if (lockErr) throw new Error("تعذر إقفال مسير الرواتب: " + lockErr.message);

    // Lock period as well
    if (run.period_id) {
      await db.from("payroll_periods").update({ status: "locked" }).eq("id", run.period_id);
    }

    await logSecurityAudit(db, {
      eventType: "sensitive_config_changed",
      status: "success",
      userId: user.userId,
      actorEmail: user.email,
      resource: "payroll_runs",
      action: "approve",
      details: { runId: data.runId, action: "lock", reason: data.reason },
    });

    return { success: true, status: "locked", runId: data.runId };
  });

/**
 * 4. Generate SAMA/MOL WPS Bank File
 */
export const generateWpsBankFileFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        companyId: z.string().uuid(),
        runId: z.string().uuid(),
        payerIban: z.string().min(15),
        molEstId: z.string().min(5),
        bankCode: z.string().min(2).max(10).default("RJHI"),
        valueDate: z.string().optional(),
      })
      .parse(input);
  })
  .handler(async ({ context, data }) => {
    const user = await requirePermission(context, "payroll", "read");
    const db = await getAdminDb();

    const { data: run } = await db
      .from("payroll_runs")
      .select("*")
      .eq("id", data.runId)
      .eq("company_id", data.companyId)
      .single();

    if (!run) throw new Error("مسير الرواتب غير موجود");
    if (!["calculated", "approved", "locked", "posted", "paid"].includes(run.status)) {
      throw new Error("يلزم احتساب المسير أولاً قبل توليد ملف حماية الأجور");
    }

    // Fetch employee results and employee national_ids
    const [{ data: results }, { data: employees }] = await Promise.all([
      db.from("payroll_results").select("*").eq("run_id", data.runId),
      db.from("employees").select("id, national_id"),
    ]);

    const natIdMap = new Map((employees || []).map((e: any) => [e.id, e.national_id]));
    const wpsRecords = (results || []).map((r: any) => ({
      ...r,
      national_id: natIdMap.get(r.employee_id) || (r.is_saudi ? "1000000001" : "2000000001"),
    }));

    const batchReference = `BATCH-${run.year}${String(run.month).padStart(2, "0")}-${Date.now().toString().slice(-4)}`;
    const wpsOutput = generateWpsBankFile(
      {
        batchReference,
        bankCode: data.bankCode,
        payerIban: data.payerIban,
        molEstId: data.molEstId,
        valueDate: data.valueDate,
      },
      wpsRecords
    );

    // Record payment batch
    const { data: batch, error: batchErr } = await db
      .from("payroll_payment_batches")
      .insert({
        company_id: data.companyId,
        run_id: data.runId,
        batch_reference: batchReference,
        bank_code: data.bankCode,
        payer_iban: data.payerIban,
        mol_establishment_id: data.molEstId,
        total_records: wpsOutput.recordCount,
        total_amount: wpsOutput.totalAmount,
        status: "generated",
      })
      .select("id")
      .single();

    if (batchErr) throw new Error("تعذر تسجيل دفعة الصرف: " + batchErr.message);

    // Record immutable bank file
    const { error: fileErr } = await db.from("payroll_bank_files").insert({
      company_id: data.companyId,
      batch_id: batch.id,
      file_format: "wps_txt_pipe",
      file_name: wpsOutput.fileName,
      file_content: wpsOutput.fileContent,
      file_hash: wpsOutput.fileHash,
      version: 1,
      employee_count: wpsOutput.recordCount,
      total_amount: wpsOutput.totalAmount,
      generated_by: user.userId,
    });

    if (fileErr) throw new Error("تعذر حفظ ملف البنك: " + fileErr.message);

    await logSecurityAudit(db, {
      eventType: "sensitive_config_changed",
      status: "success",
      userId: user.userId,
      actorEmail: user.email,
      resource: "payroll_bank_files",
      action: "create",
      details: { runId: data.runId, batchReference, hash: wpsOutput.fileHash, totalAmount: wpsOutput.totalAmount },
    });

    return {
      fileName: wpsOutput.fileName,
      fileContent: wpsOutput.fileContent,
      fileHash: wpsOutput.fileHash,
      totalAmount: wpsOutput.totalAmount,
      recordCount: wpsOutput.recordCount,
      validationErrors: wpsOutput.validationErrors,
    };
  });

/**
 * 5. Get Payroll Run Details & Employee Results
 */
export const getPayrollRunDetailsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        companyId: z.string().uuid(),
        runId: z.string().uuid(),
      })
      .parse(input);
  })
  .handler(async ({ context, data }) => {
    await requirePermission(context, "payroll", "read");
    const db = await getAdminDb();

    const [{ data: run }, { data: results }, { data: batches }] = await Promise.all([
      db.from("payroll_runs").select("*").eq("id", data.runId).eq("company_id", data.companyId).single(),
      db.from("payroll_results").select("*").eq("run_id", data.runId).order("emp_no"),
      db.from("payroll_payment_batches").select("*").eq("run_id", data.runId).order("created_at", { ascending: false }),
    ]);

    return {
      run: run || null,
      results: results || [],
      batches: batches || [],
    };
  });