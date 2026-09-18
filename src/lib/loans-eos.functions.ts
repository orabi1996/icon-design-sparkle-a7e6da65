import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission, logSecurityAudit } from "@/lib/server/authorization";
import {
  calculateLoanLedgerBalance,
  generateLoanSchedule,
  getStatutoryEosConfig,
  computeFullEosSettlement,
  buildEosCalculationSnapshot,
  roundCurrency,
} from "./loans-eos-core.mjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function getAdminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as Db;
}

/**
 * 1. Disburse Loan (Initializes Loan Ledger with disbursement transaction)
 */
export const disburseLoanFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        loanId: z.string().uuid(),
        disbursementAmount: z.number().positive(),
        installmentsCount: z.number().int().min(1).default(12),
        firstInstallmentDate: z.string().optional(),
        referenceId: z.string().optional(),
        notes: z.string().optional(),
      })
      .parse(input);
  })
  .handler(async ({ context, data }) => {
    const user = await requirePermission(context, "loans", "create");
    const db = await getAdminDb();

    // 1. Fetch Loan
    const { data: loan, error: loanErr } = await db
      .from("loans")
      .select("*")
      .eq("id", data.loanId)
      .single();

    if (loanErr || !loan) {
      throw new Error(`السلفة غير موجودة (${data.loanId})`);
    }

    // 2. Check if already disbursed
    const { data: existingTx } = await db
      .from("loan_transactions")
      .select("id")
      .eq("loan_id", data.loanId)
      .eq("transaction_type", "disbursement")
      .maybeSingle();

    if (existingTx) {
      throw new Error("تم صرف هذه السلفة مسبقاً وتوجد حركة صرف مقيدة بالدفتر");
    }

    const disbursementAmount = roundCurrency(data.disbursementAmount);

    // 3. Create disbursement transaction in immutable ledger
    const { data: tx, error: txErr } = await db
      .from("loan_transactions")
      .insert({
        loan_id: data.loanId,
        employee_id: loan.employee_id,
        company_id: loan.company_id || null,
        transaction_type: "disbursement",
        direction: "debit",
        amount: disbursementAmount,
        balance_after: disbursementAmount,
        reference_id: data.referenceId || `DISBURSE-${Date.now()}`,
        idempotency_key: `disburse:loan:${data.loanId}`,
        notes: data.notes || "صرف السلفة المعتمدة للموظف",
        created_by: user.userId,
      })
      .select()
      .single();

    if (txErr) {
      throw new Error(`فشل تسجيل حركة الصرف بالدفتر: ${txErr.message}`);
    }

    // 4. Generate planned installment schedules
    const startDate = data.firstInstallmentDate || loan.start_date || new Date().toISOString().slice(0, 10);
    const schedule = generateLoanSchedule(disbursementAmount, data.installmentsCount, startDate);

    if (schedule.length > 0) {
      const scheduleRows = schedule.map((s) => ({
        loan_id: data.loanId,
        installment_number: s.installmentNumber,
        due_date: s.dueDate,
        principal_amount: s.principalAmount,
        status: "pending",
      }));
      await db.from("loan_installment_schedules").insert(scheduleRows);
    }

    // 5. Update loan status to 'قيد السداد'
    await db
      .from("loans")
      .update({
        status: "قيد السداد",
        approved_amount: disbursementAmount,
        installments: data.installmentsCount,
        monthly_amount: schedule[0]?.principalAmount || Math.round(disbursementAmount / data.installmentsCount),
      })
      .eq("id", data.loanId);

    // Audit log
    await logSecurityAudit(db, {
      eventType: "sensitive_config_changed",
      status: "success",
      userId: user.userId,
      actorEmail: user.email,
      resource: "loans",
      action: "create",
      details: {
        event: "loan_disbursed",
        loanId: data.loanId,
        amount: disbursementAmount,
        transactionId: tx.id,
      },
    });

    return {
      success: true,
      transactionId: tx.id,
      disbursedAmount: disbursementAmount,
      scheduleCount: schedule.length,
    };
  });

/**
 * 2. Record Loan Transaction (Installment, Manual Payment, or Payroll Deduction)
 * Enforces idempotency to prevent duplicate deductions.
 */
export const recordLoanTransactionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        loanId: z.string().uuid(),
        transactionType: z.enum([
          "installment",
          "manual_payment",
          "payroll_deduction",
          "adjustment",
          "reversal",
        ]),
        amount: z.number().positive(),
        idempotencyKey: z.string().min(5),
        referenceId: z.string().optional(),
        notes: z.string().optional(),
      })
      .parse(input);
  })
  .handler(async ({ context, data }) => {
    const user = await requirePermission(context, "loans", "update");
    const db = await getAdminDb();

    // 1. Idempotency Check: Return existing transaction if key matched
    const { data: existingTx } = await db
      .from("loan_transactions")
      .select("*")
      .eq("idempotency_key", data.idempotencyKey)
      .maybeSingle();

    if (existingTx) {
      return {
        success: true,
        alreadyProcessed: true,
        transaction: existingTx,
        message: "تم معالجة هذا القيد مسبقاً بموجب مفتاح منع التكرار",
      };
    }

    // 2. Fetch loan and current ledger transactions
    const { data: loan, error: loanErr } = await db
      .from("loans")
      .select("*")
      .eq("id", data.loanId)
      .single();

    if (loanErr || !loan) {
      throw new Error(`السلفة غير موجودة (${data.loanId})`);
    }

    const { data: rawTxs = [] } = await db
      .from("loan_transactions")
      .select("*")
      .eq("loan_id", data.loanId);

    const balanceBefore = calculateLoanLedgerBalance(rawTxs, Number(loan.approved_amount || loan.amount || 0));

    // Determine debit vs credit direction
    const isCredit = ["installment", "manual_payment", "payroll_deduction", "reversal"].includes(
      data.transactionType
    );
    const direction = isCredit ? "credit" : "debit";
    const paymentAmount = roundCurrency(data.amount);

    if (isCredit && balanceBefore.outstandingBalance <= 0) {
      throw new Error("رصيد السلفة مسدد بالكامل، لا يمكن تسجيل سداد إضافي");
    }

    // New balance after
    const newBalance = isCredit
      ? Math.max(0, roundCurrency(balanceBefore.outstandingBalance - paymentAmount))
      : roundCurrency(balanceBefore.outstandingBalance + paymentAmount);

    // 3. Insert immutable ledger entry
    const { data: newTx, error: insertErr } = await db
      .from("loan_transactions")
      .insert({
        loan_id: data.loanId,
        employee_id: loan.employee_id,
        company_id: loan.company_id || null,
        transaction_type: data.transactionType,
        direction,
        amount: paymentAmount,
        balance_after: newBalance,
        idempotency_key: data.idempotencyKey,
        reference_id: data.referenceId || null,
        notes: data.notes || null,
        created_by: user.userId,
      })
      .select()
      .single();

    if (insertErr) {
      throw new Error(`فشل ترحيل قيد السلفة: ${insertErr.message}`);
    }

    // 4. If settled, update loan status to 'مسددة'
    if (newBalance <= 0) {
      await db
        .from("loans")
        .update({
          status: "مسددة",
          paid_amount: Number(loan.approved_amount || loan.amount || 0),
        })
        .eq("id", data.loanId);
    } else {
      await db
        .from("loans")
        .update({
          paid_amount: roundCurrency(Number(loan.approved_amount || loan.amount || 0) - newBalance),
        })
        .eq("id", data.loanId);
    }

    return {
      success: true,
      transaction: newTx,
      balanceAfter: newBalance,
      isSettled: newBalance <= 0,
    };
  });

/**
 * 3. Get Authoritative Loan Ledger Statement
 */
export const getLoanLedgerStatementFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        loanId: z.string().uuid(),
      })
      .parse(input);
  })
  .handler(async ({ context, data }) => {
    await requirePermission(context, "loans", "read");
    const db = await getAdminDb();

    const { data: loan } = await db.from("loans").select("*").eq("id", data.loanId).single();
    if (!loan) throw new Error("السلفة غير موجودة");

    const { data: transactions = [] } = await db
      .from("loan_transactions")
      .select("*")
      .eq("loan_id", data.loanId)
      .order("created_at", { ascending: true });

    const { data: schedules = [] } = await db
      .from("loan_installment_schedules")
      .select("*")
      .eq("loan_id", data.loanId)
      .order("installment_number", { ascending: true });

    const balance = calculateLoanLedgerBalance(transactions, Number(loan.approved_amount || loan.amount || 0));

    return {
      loan,
      transactions,
      schedules,
      balance,
    };
  });

/**
 * 4. Calculate EOS Settlement Draft with Saudi Labor Law Country Pack
 */
export const calculateEosDraftFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        employeeId: z.string().uuid(),
        requestId: z.string().uuid().optional(),
        lastWorkingDate: z.string(),
        terminationReason: z.string(),
        leaveBalanceDays: z.number().min(0).default(0),
        unpaidWorkDays: z.number().min(0).default(0),
        otherAdditions: z.number().default(0),
        otherDeductions: z.number().default(0),
        companyId: z.string().uuid().optional(),
      })
      .parse(input);
  })
  .handler(async ({ context, data }) => {
    const user = await requirePermission(context, "end-of-service-requests", "create");
    const db = await getAdminDb();

    // 1. Fetch employee
    const { data: emp, error: empErr } = await db
      .from("employees")
      .select("*")
      .eq("id", data.employeeId)
      .single();

    if (empErr || !emp) throw new Error(`الموظف غير موجود (${data.employeeId})`);
    if (!emp.hire_date) throw new Error("تاريخ تعيين الموظف غير مسجل؛ يلزم لتحديد مدة الخدمة");

    // 2. Fetch employee loan transactions for ledger deduction
    const { data: loanTxs = [] } = await db
      .from("loan_transactions")
      .select("*")
      .eq("employee_id", data.employeeId);

    // 3. Run pure domain calculation engine
    const statutoryConfig = getStatutoryEosConfig("SA");
    const settlementResult = computeFullEosSettlement({
      employee: emp,
      startDate: emp.hire_date,
      lastWorkingDate: data.lastWorkingDate,
      terminationReason: data.terminationReason,
      leaveBalanceDays: data.leaveBalanceDays,
      unpaidWorkDays: data.unpaidWorkDays,
      otherAdditions: data.otherAdditions,
      otherDeductions: data.otherDeductions,
      loanLedgerTransactions: loanTxs,
      config: statutoryConfig,
    });

    const snapshot = buildEosCalculationSnapshot(settlementResult, {
      actorId: user.userId,
      actorEmail: user.email || "hr-admin@internal",
    });

    const settlementNumber = `EOS-SETTLE-${Date.now().toString().slice(-8)}`;

    // 4. Insert or update draft in eos_settlements
    const { data: settlementRecord, error: insertErr } = await db
      .from("eos_settlements")
      .insert({
        request_id: data.requestId || null,
        employee_id: data.employeeId,
        company_id: data.companyId || emp.company_id || null,
        settlement_number: settlementNumber,
        service_start_date: emp.hire_date,
        last_working_date: data.lastWorkingDate,
        service_years: settlementResult.serviceDuration.decimalYears,
        service_months: settlementResult.serviceDuration.months,
        service_days: settlementResult.serviceDuration.days,
        termination_reason: data.terminationReason,
        wage_base: settlementResult.wageBase,
        statutory_eos_amount: settlementResult.gratuity.finalGratuity,
        leave_encashment_days: data.leaveBalanceDays,
        leave_encashment_amount: settlementResult.leaveEncashmentAmount,
        unpaid_payroll_days: data.unpaidWorkDays,
        unpaid_payroll_amount: settlementResult.unpaidPayrollAmount,
        loan_settlement_deduction: settlementResult.loanSettlementDeduction,
        other_additions: settlementResult.otherAdditions,
        other_deductions: settlementResult.otherDeductions,
        net_settlement_amount: settlementResult.netSettlementAmount,
        formula_version: statutoryConfig.version,
        calculation_snapshot: snapshot,
        status: "draft",
        created_by: user.userId,
      })
      .select()
      .single();

    if (insertErr) {
      throw new Error(`فشل إنشاء مسودة تسوية نهاية الخدمة: ${insertErr.message}`);
    }

    return {
      success: true,
      settlement: settlementRecord,
      calculation: settlementResult,
      snapshot,
    };
  });

/**
 * 5. Approve EOS Settlement (Enforces Immutability)
 */
export const approveEosSettlementFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        settlementId: z.string().uuid(),
        notes: z.string().optional(),
      })
      .parse(input);
  })
  .handler(async ({ context, data }) => {
    const user = await requirePermission(context, "end-of-service-requests", "approve");
    const db = await getAdminDb();

    // 1. Fetch settlement
    const { data: settlement, error: fetchErr } = await db
      .from("eos_settlements")
      .select("*")
      .eq("id", data.settlementId)
      .single();

    if (fetchErr || !settlement) throw new Error("تسوية نهاية الخدمة غير موجودة");
    if (settlement.status === "approved" || settlement.status === "settled") {
      throw new Error("التسوية معتمدة بالفعل وغير قابلة لإعادة الاعتماد");
    }

    // 2. Mark Approved and lock
    const { data: approved, error: updateErr } = await db
      .from("eos_settlements")
      .update({
        status: "approved",
        approved_by: user.userId,
        approved_at: new Date().toISOString(),
      })
      .eq("id", data.settlementId)
      .select()
      .single();

    if (updateErr) {
      throw new Error(`تعذر اعتماد تسوية نهاية الخدمة: ${updateErr.message}`);
    }

    // 3. Log security audit
    await logSecurityAudit(db, {
      eventType: "sensitive_config_changed",
      status: "success",
      userId: user.userId,
      actorEmail: user.email,
      resource: "end_of_service_requests",
      action: "approve",
      details: {
        event: "eos_settlement_approved",
        settlementId: data.settlementId,
        settlementNumber: settlement.settlement_number,
        netAmount: settlement.net_settlement_amount,
      },
    });

    return {
      success: true,
      settlement: approved,
      locked: true,
    };
  });

/**
 * 6. Reverse EOS Settlement (Executes corrective reversal without modifying locked record)
 */
export const reverseEosSettlementFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        settlementId: z.string().uuid(),
        reason: z.string().min(5),
      })
      .parse(input);
  })
  .handler(async ({ context, data }) => {
    const user = await requirePermission(context, "end-of-service-requests", "approve");
    const db = await getAdminDb();

    const { data: orig, error: fetchErr } = await db
      .from("eos_settlements")
      .select("*")
      .eq("id", data.settlementId)
      .single();

    if (fetchErr || !orig) throw new Error("التسوية المطلوب عكسها غير موجودة");
    if (orig.status !== "approved" && orig.status !== "settled") {
      throw new Error("يمكن عكس التسويات المعتمدة أو المنصرفة فقط");
    }

    // 1. Mark original as reversed (allowed by trigger check)
    await db
      .from("eos_settlements")
      .update({ status: "reversed" })
      .eq("id", data.settlementId);

    // 2. Create reversal entry
    const reversalNumber = `REV-${orig.settlement_number}`;
    const { data: revRecord, error: revErr } = await db
      .from("eos_settlements")
      .insert({
        request_id: orig.request_id,
        employee_id: orig.employee_id,
        company_id: orig.company_id,
        settlement_number: reversalNumber,
        service_start_date: orig.service_start_date,
        last_working_date: orig.last_working_date,
        service_years: orig.service_years,
        termination_reason: `عكس تسوية: ${data.reason}`,
        wage_base: orig.wage_base,
        statutory_eos_amount: -Math.abs(Number(orig.statutory_eos_amount || 0)),
        leave_encashment_amount: -Math.abs(Number(orig.leave_encashment_amount || 0)),
        unpaid_payroll_amount: -Math.abs(Number(orig.unpaid_payroll_amount || 0)),
        loan_settlement_deduction: -Math.abs(Number(orig.loan_settlement_deduction || 0)),
        net_settlement_amount: -Math.abs(Number(orig.net_settlement_amount || 0)),
        reversal_of_id: orig.id,
        status: "reversed",
        created_by: user.userId,
      })
      .select()
      .single();

    if (revErr) throw new Error(`فشل إنشاء القيد العكسي: ${revErr.message}`);

    await logSecurityAudit(db, {
      eventType: "sensitive_config_changed",
      status: "success",
      userId: user.userId,
      actorEmail: user.email,
      resource: "end_of_service_requests",
      action: "approve",
      details: {
        event: "eos_settlement_reversed",
        originalSettlementId: orig.id,
        reversalSettlementId: revRecord.id,
        reason: data.reason,
      },
    });

    return {
      success: true,
      originalId: orig.id,
      reversalId: revRecord.id,
    };
  });
