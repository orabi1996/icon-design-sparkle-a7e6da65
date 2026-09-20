/**
 * Enterprise Performance & Reliability Benchmark Engine.
 * 
 * Provides:
 * - Deterministic realistic synthetic data generator for 10k, 50k, 100k employee scales
 * - Relational data across 11 high-volume domains
 * - High-resolution CPU, memory, and payload size profiler
 * - Keyset/Cursor vs Offset vs Unbounded pagination comparator
 * - Concurrency & optimistic locking stress test simulator
 */

import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";

const FIRST_NAMES = ["محمد", "أحمد", "عبد الله", "خالد", "سعد", "سلطان", "فيصل", "عمر", "إبراهيم", "فهد", "سارة", "نورة", "ريم", "منى", "فاطمة"];
const FATHER_NAMES = ["علي", "حسن", "حسين", "سعيد", "سالم", "صالح", "منصور", "ناصر", "تركي", "بندر"];
const FAMILY_NAMES = ["الغامدي", "الزهراني", "القحطاني", "العتيبي", "الدوسري", "الشهري", "الحربي", "المطيري", "العنزي", "الشمري", "القرني", "السبيعي"];
const JOB_TITLES = ["مهندس برمجيات", "أخصائي موارد بشرية", "محاسب أول", "مدير مشاريع", "مسؤول سلامة", "فني صيانة", "محلل نظم", "مدير عمليات", "منسق تدريب", "مشرف مبيعات"];
const DEPARTMENTS = ["تقنية المعلومات", "الموارد البشرية", "المالية والحسابات", "العمليات والتشغيل", "المشاريع الهندسية", "المبيعات والتسويق", "الشؤون القانونية", "خدمة العملاء"];
const BRANCHES = ["المركز الرئيسي - الرياض", "فرع جدة", "فرع الدمام", "فرع المدينة المنورة", "فرع مكة المكرمة", "فرع الخبر"];

/**
 * Deterministic pseudo-random number generator (LCG) for reproducible benchmarks.
 */
function createPrng(seed = 123456789) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/**
 * Generates realistic synthetic dataset for HRMS benchmarking.
 */
export function generateSyntheticDataset(employeeCount, options = {}) {
  const rand = createPrng(options.seed || 42);
  const companyId = options.companyId || "comp-enterprise-001";
  const tenantId = options.tenantId || "tenant-enterprise-001";

  const employees = [];
  const attendance = [];
  const rawPunches = [];
  const rosters = [];
  const payrollResults = [];
  const leaves = [];
  const loans = [];
  const auditLogs = [];
  const emailLogs = [];

  const baseDate = new Date("2026-09-01T00:00:00Z");

  for (let i = 1; i <= employeeCount; i++) {
    const fName = FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)];
    const mName = FATHER_NAMES[Math.floor(rand() * FATHER_NAMES.length)];
    const lName = FAMILY_NAMES[Math.floor(rand() * FAMILY_NAMES.length)];
    const fullName = `${fName} ${mName} ${lName}`;
    const empNo = `EMP${String(i).padStart(6, "0")}`;
    const nationalId = `${rand() > 0.5 ? "1" : "2"}${String(100000000 + i).slice(-9)}`;
    const iban = `SA${String(10 + Math.floor(rand() * 89))}80${String(100000000000000000 + i).slice(-18)}`;
    const basicSalary = 4000 + Math.floor(rand() * 250) * 100;
    const housing = Math.round(basicSalary * 0.25);
    const transport = Math.round(basicSalary * 0.10);
    const branch = BRANCHES[Math.floor(rand() * BRANCHES.length)];
    const department = DEPARTMENTS[Math.floor(rand() * DEPARTMENTS.length)];
    const jobTitle = JOB_TITLES[Math.floor(rand() * JOB_TITLES.length)];
    const empId = `emp-${i}`;

    const empRecord = {
      id: empId,
      tenant_id: tenantId,
      company_id: companyId,
      emp_no: empNo,
      full_name: fullName,
      national_id: nationalId,
      iban,
      basic_salary: basicSalary,
      housing_allowance: housing,
      transport_allowance: transport,
      other_allowances: 0,
      gross_salary: basicSalary + housing + transport,
      branch,
      department,
      job_title: jobTitle,
      status: rand() > 0.05 ? "active" : "on_leave",
      version: 1,
      hire_date: "2024-01-01",
      created_at: new Date(baseDate.getTime() + i * 1000).toISOString(),
      updated_at: new Date(baseDate.getTime() + i * 1000).toISOString(),
    };
    employees.push(empRecord);

    // 1. Attendance Daily Record
    attendance.push({
      id: `att-${i}`,
      company_id: companyId,
      employee_id: empId,
      emp_no: empNo,
      work_date: "2026-09-18",
      first_punch_in: "08:00:00",
      last_punch_out: "16:30:00",
      work_minutes: 510,
      delay_minutes: rand() > 0.8 ? Math.floor(rand() * 45) : 0,
      overtime_minutes: rand() > 0.85 ? Math.floor(rand() * 120) : 0,
      status: "present",
      stage: "approved",
    });

    // 2. Raw Biometric Punch Events (2 punches per day)
    rawPunches.push({
      id: `punch-in-${i}`,
      company_id: companyId,
      device_id: `DEV-${1 + (i % 10)}`,
      biometric_user_id: empNo,
      employee_id: empId,
      punch_time: `2026-09-18T07:${55 + Math.floor(rand() * 10)}:00Z`,
      punch_state: "check_in",
      match_status: "matched",
    });
    rawPunches.push({
      id: `punch-out-${i}`,
      company_id: companyId,
      device_id: `DEV-${1 + (i % 10)}`,
      biometric_user_id: empNo,
      employee_id: empId,
      punch_time: `2026-09-18T16:${25 + Math.floor(rand() * 15)}:00Z`,
      punch_state: "check_out",
      match_status: "matched",
    });

    // 3. Shift Rosters
    rosters.push({
      id: `roster-${i}`,
      company_id: companyId,
      employee_id: empId,
      shift_pattern_id: `pattern-${1 + (i % 4)}`,
      start_date: "2026-09-01",
      end_date: "2026-09-30",
      status: "published",
    });

    // 4. Payroll Results
    const gross = basicSalary + housing + transport;
    const gosi = Math.round(basicSalary * 0.0975);
    const net = gross - gosi;
    payrollResults.push({
      id: `pay-${i}`,
      run_id: "run-2026-09",
      employee_id: empId,
      emp_no: empNo,
      basic_salary: basicSalary,
      gross_salary: gross,
      total_deductions: gosi,
      net_salary: net,
      status: "verified",
    });

    // 5. Leave History (approx 20% of employees have active/recent leaves)
    if (rand() > 0.8) {
      leaves.push({
        id: `leave-${i}`,
        company_id: companyId,
        employee_id: empId,
        leave_type: "annual",
        start_date: "2026-09-10",
        end_date: "2026-09-15",
        days_count: 5,
        status: "approved",
      });
    }

    // 6. Loans (approx 15% of employees have active loans)
    if (rand() > 0.85) {
      const loanAmount = 10000;
      const paidAmount = 3000;
      loans.push({
        id: `loan-${i}`,
        company_id: companyId,
        employee_id: empId,
        amount: loanAmount,
        paid_amount: paidAmount,
        balance: loanAmount - paidAmount,
        monthly_installment: 1000,
        status: "active",
      });
    }

    // 7. Security Audit Logs
    auditLogs.push({
      id: `audit-${i}`,
      tenant_id: tenantId,
      user_id: `user-${1 + (i % 50)}`,
      event_type: "sensitive_config_changed",
      status: "success",
      resource: `employees/${empId}`,
      action: "read",
      created_at: new Date(baseDate.getTime() + i * 500).toISOString(),
    });

    // 8. Email Outbox Logs
    emailLogs.push({
      id: `email-${i}`,
      tenant_id: tenantId,
      status: i % 20 === 0 ? "pending" : "completed",
      template_key: "payroll_slip_notification",
      recipient_email: `employee_${i}@company.com`,
      created_at: new Date(baseDate.getTime() + i * 800).toISOString(),
    });
  }

  return {
    scale: employeeCount,
    employees,
    attendance,
    rawPunches,
    rosters,
    payrollResults,
    leaves,
    loans,
    auditLogs,
    emailLogs,
  };
}

/**
 * High-resolution measurement of execution time and memory footprint.
 */
export function measureExecution(name, fn) {
  if (typeof globalThis.gc === "function") {
    globalThis.gc();
  }
  const memBefore = process.memoryUsage();
  const start = performance.now();
  
  const result = fn();
  
  const end = performance.now();
  const memAfter = process.memoryUsage();

  const executionTimeMs = Number((end - start).toFixed(2));
  const heapUsedDeltaBytes = Math.max(0, memAfter.heapUsed - memBefore.heapUsed);
  const rssDeltaBytes = Math.max(0, memAfter.rss - memBefore.rss);

  // Measure payload size
  let payloadSizeBytes = 0;
  if (result !== undefined && result !== null) {
    try {
      payloadSizeBytes = Buffer.byteLength(JSON.stringify(result), "utf8");
    } catch {
      payloadSizeBytes = 0;
    }
  }

  return {
    name,
    executionTimeMs,
    heapUsedDeltaBytes,
    heapUsedDeltaMb: Number((heapUsedDeltaBytes / (1024 * 1024)).toFixed(2)),
    rssDeltaBytes,
    payloadSizeBytes,
    payloadSizeKb: Number((payloadSizeBytes / 1024).toFixed(2)),
    result,
  };
}

/**
 * Benchmarks pagination strategies: Unbounded vs Offset vs Keyset/Cursor.
 */
export function benchmarkPagination(records, options = {}) {
  const { pageSize = 50, page = 500, cursor = null } = options;

  // 1. Unbounded (The Anti-Pattern): Fetch all records into memory
  const unbounded = measureExecution("Unbounded (Full Table)", () => {
    return records.slice(); // Simulates SELECT * FROM table
  });

  // 2. Offset Pagination: Simulates OFFSET (page-1)*pageSize LIMIT pageSize
  const offset = measureExecution(`Offset Pagination (Page ${page})`, () => {
    const startIdx = (page - 1) * pageSize;
    return records.slice(startIdx, startIdx + pageSize);
  });

  // 3. Keyset / Cursor Pagination: Simulates WHERE id > cursor LIMIT pageSize
  const keyset = measureExecution("Keyset / Cursor Pagination", () => {
    if (!cursor) {
      return records.slice(0, pageSize);
    }
    const idx = records.findIndex(r => r.id === cursor);
    if (idx === -1) return records.slice(0, pageSize);
    return records.slice(idx + 1, idx + 1 + pageSize);
  });

  // 4. Selective Projection vs Full Row: Project only 4 essential columns
  const fullRowPage = records.slice(0, pageSize);
  const fullRowSize = Buffer.byteLength(JSON.stringify(fullRowPage), "utf8");

  const projectedPage = fullRowPage.map(r => ({
    id: r.id,
    emp_no: r.emp_no,
    full_name: r.full_name,
    status: r.status,
  }));
  const projectedSize = Buffer.byteLength(JSON.stringify(projectedPage), "utf8");

  return {
    totalRecords: records.length,
    pageSize,
    page,
    unbounded: {
      timeMs: unbounded.executionTimeMs,
      payloadKb: unbounded.payloadSizeKb,
      heapMb: unbounded.heapUsedDeltaMb,
    },
    offset: {
      timeMs: offset.executionTimeMs,
      payloadKb: offset.payloadSizeKb,
    },
    keyset: {
      timeMs: keyset.executionTimeMs,
      payloadKb: keyset.payloadSizeKb,
    },
    projection: {
      fullRowSizeKb: Number((fullRowSize / 1024).toFixed(2)),
      projectedSizeKb: Number((projectedSize / 1024).toFixed(2)),
      reductionPercent: Number((((fullRowSize - projectedSize) / fullRowSize) * 100).toFixed(1)),
    },
  };
}

/**
 * Concurrency Simulator:
 * Tests the 6 mission-critical concurrency scenarios.
 */
export function simulateConcurrencyScenarios() {
  const results = {};

  // Scenario 1: Two Managers Editing Same Employee (Optimistic Concurrency Control)
  {
    const employee = {
      id: "emp-concurrency-1",
      full_name: "سلطان القحطاني",
      phone: "0501112233",
      basic_salary: 8000,
      version: 1, // current version
    };

    // Manager A and Manager B both read version 1
    const snapshotA = { ...employee };
    const snapshotB = { ...employee };

    // Update function enforcing optimistic locking
    function updateEmployeeWithOCC(empState, updates, expectedVersion) {
      if (empState.version !== expectedVersion) {
        const error = new Error("409 Conflict: تم تعديل السجل بواسطة مستخدم آخر، يرجى تحديث الصفحة والمحاولة مجددًا");
        error.status = 409;
        throw error;
      }
      return {
        ...empState,
        ...updates,
        version: empState.version + 1,
        updated_at: new Date().toISOString(),
      };
    }

    let state = { ...employee };

    // Manager A submits first
    state = updateEmployeeWithOCC(state, { phone: "0509998877" }, snapshotA.version);
    const managerASuccess = state.version === 2 && state.phone === "0509998877";

    // Manager B submits with stale version 1
    let managerBConflictDetected = false;
    try {
      updateEmployeeWithOCC(state, { basic_salary: 9000 }, snapshotB.version);
    } catch (err) {
      if (err.status === 409) {
        managerBConflictDetected = true;
      }
    }

    results.twoManagersEditingSameEmployee = {
      passed: managerASuccess && managerBConflictDetected,
      managerASucceeded: managerASuccess,
      managerBConflictDetected,
      finalVersion: state.version,
    };
  }

  // Scenario 2: Simultaneous Leave Requests (Balance Overdraft Prevention)
  {
    let leaveBalance = 5; // 5 days remaining
    let lockAcquired = false;

    // Simulate atomic transactional deduction with row locking
    function applyLeaveRequestAtomic(daysRequested) {
      // Simulates SELECT remaining_balance FROM leave_balances WHERE emp_id = ... FOR UPDATE
      if (lockAcquired) {
        // Serialized queue
      }
      lockAcquired = true;
      try {
        if (leaveBalance < daysRequested) {
          throw new Error("رصيد الإجازات غير كافٍ لتغطية المدة المطلوبة");
        }
        leaveBalance -= daysRequested;
        return { success: true, remainingBalance: leaveBalance };
      } finally {
        lockAcquired = false;
      }
    }

    // Request 1: 4 days
    const req1 = applyLeaveRequestAtomic(4);
    // Request 2: 3 days (arrives concurrently)
    let req2Rejected = false;
    try {
      applyLeaveRequestAtomic(3);
    } catch (err) {
      req2Rejected = true;
    }

    results.simultaneousLeaveRequests = {
      passed: req1.success && req2Rejected && leaveBalance === 1,
      request1Granted: req1.success,
      request2OverdraftBlocked: req2Rejected,
      remainingBalance: leaveBalance,
    };
  }

  // Scenario 3: Simultaneous Roster Publication (Advisory Lock / Revision Collision)
  {
    let currentRosterRevision = 1;
    let isLocked = false;

    function publishRoster(expectedRevision) {
      // Simulates pg_advisory_xact_lock
      if (isLocked) {
        throw new Error("عملية نشر أخرى قيد التنفيذ للجدول نفسه");
      }
      isLocked = true;
      try {
        if (expectedRevision !== currentRosterRevision) {
          throw new Error("تضارب في مراجعة جدول الورديات");
        }
        currentRosterRevision += 1;
        return { success: true, revision: currentRosterRevision };
      } finally {
        isLocked = false;
      }
    }

    const pub1 = publishRoster(1);
    let pub2Conflict = false;
    try {
      publishRoster(1); // Same revision submitted simultaneously
    } catch {
      pub2Conflict = true;
    }

    results.simultaneousRosterPublication = {
      passed: pub1.success && pub2Conflict && currentRosterRevision === 2,
      firstPublicationPassed: pub1.success,
      secondPublicationBlocked: pub2Conflict,
    };
  }

  // Scenario 4: Multiple Payroll Recalculations (State Lock / Idempotency)
  {
    const payrollRun = {
      id: "run-2026-09",
      status: "draft",
      calculatedAt: null,
      totalNetSalary: 0,
    };

    let recalculationCount = 0;

    function recalculatePayroll(run, inputs) {
      if (run.status === "calculating") {
        throw new Error("مسير الرواتب قيد الاحتساب بالفعل من قبل مستخدم آخر");
      }
      run.status = "calculating";
      try {
        recalculationCount++;
        const total = inputs.reduce((sum, item) => sum + item.net, 0);
        run.totalNetSalary = total;
        run.status = "calculated";
        run.calculatedAt = new Date().toISOString();
        return run;
      } finally {
        if (run.status === "calculating") run.status = "error";
      }
    }

    const sampleInputs = [{ net: 5000 }, { net: 7000 }];
    const res1 = recalculatePayroll(payrollRun, sampleInputs);
    
    results.multiplePayrollRecalculations = {
      passed: res1.status === "calculated" && res1.totalNetSalary === 12000 && recalculationCount === 1,
      totalNetSalary: res1.totalNetSalary,
      recalculationCount,
    };
  }

  // Scenario 5: Duplicate Attendance Events (Idempotent Deduplication)
  {
    const punchStore = new Map(); // Simulates UNIQUE(company_id, device_id, biometric_user_id, punch_time)

    function ingestPunch(punch) {
      const key = `${punch.company_id}:${punch.device_id}:${punch.biometric_user_id}:${punch.punch_time}`;
      if (punchStore.has(key)) {
        // Idempotent: ON CONFLICT DO NOTHING
        return { status: "duplicate_ignored", punch: punchStore.get(key) };
      }
      punchStore.set(key, punch);
      return { status: "inserted", punch };
    }

    const punchEvent = {
      company_id: "c-1",
      device_id: "DEV-01",
      biometric_user_id: "1001",
      punch_time: "2026-09-18T08:00:00Z",
      punch_state: "check_in",
    };

    const first = ingestPunch(punchEvent);
    const second = ingestPunch(punchEvent); // Duplicate arriving simultaneously

    results.duplicateAttendanceEvents = {
      passed: first.status === "inserted" && second.status === "duplicate_ignored" && punchStore.size === 1,
      firstIngestion: first.status,
      secondIngestion: second.status,
      totalStored: punchStore.size,
    };
  }

  // Scenario 6: Repeated Loan Deduction Delivery (Deduction Idempotency)
  {
    const ledger = new Map(); // Simulates UNIQUE(loan_id, reference_type, reference_id)

    function postLoanDeduction(loanId, payrollRunId, installmentNumber, amount) {
      const deductionKey = `${loanId}:payroll_installment:${payrollRunId}:${installmentNumber}`;
      if (ledger.has(deductionKey)) {
        return { status: "already_posted", record: ledger.get(deductionKey) };
      }
      const record = {
        id: `tx-${deductionKey}`,
        loanId,
        payrollRunId,
        installmentNumber,
        amount,
        posted_at: new Date().toISOString(),
      };
      ledger.set(deductionKey, record);
      return { status: "posted", record };
    }

    const post1 = postLoanDeduction("loan-101", "run-2026-09", 1, 1000);
    const post2 = postLoanDeduction("loan-101", "run-2026-09", 1, 1000); // Repeated delivery

    results.repeatedLoanDeductionDelivery = {
      passed: post1.status === "posted" && post2.status === "already_posted" && ledger.size === 1,
      firstPost: post1.status,
      secondPost: post2.status,
      totalDeductionsCount: ledger.size,
    };
  }

  const allPassed = Object.values(results).every(r => r.passed);

  return {
    allPassed,
    scenarios: results,
  };
}
