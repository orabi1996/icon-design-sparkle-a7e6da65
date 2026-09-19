// =====================================================================
// PROMPT 10: Reports & Analytics Core Pure Domain Engine
// Authoritative reporting math, CSV formula injection sanitization,
// server query contract, data quality diagnostics, and dashboard KPIs.
// =====================================================================

/**
 * 1. CSV Formula Injection Sanitization (RFC 4180 + Excel DDE Protection)
 * Strips or prefixes cells starting with dangerous characters: =, +, -, @, \t, \r, \n
 */
export function sanitizeCsvCell(value) {
  if (value === null || value === undefined) {
    return '""';
  }

  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);

  // Check for CSV Formula Injection attack characters:
  // If the cell starts with whitespace followed by =, +, -, @, \t, \r, \n
  const isDangerousFormula = /^\s*[=+\-@\t\r\n]/.test(str);

  // Neutralize formula by prefixing with a single quote (')
  const neutralized = isDangerousFormula ? `'${str}` : str;

  // RFC 4180 escaping: double up quotes and wrap in quotes
  const escaped = neutralized.replaceAll('"', '""');
  return `"${escaped}"`;
}

/**
 * 2. Generate Safe, Scoped, and Validated CSV Document
 */
export function generateSecureCsv(options) {
  const {
    title = 'تقرير المنظومة',
    headers = [],
    rows = [],
    metadata = {},
    userEmail = 'غير محدد',
    generatedAt = new Date().toISOString(),
  } = options;

  if (!Array.isArray(headers) || headers.length === 0) {
    throw new Error('يجب تحديد ترويسات التقرير (headers) بشكل صحيح');
  }

  const lines = [];

  // UTF-8 BOM for proper Arabic text rendering in MS Excel
  const BOM = '\uFEFF';

  // Metadata comments / header block
  lines.push(`${sanitizeCsvCell(`# عنوان التقرير: ${title}`)},${sanitizeCsvCell(`# تاريخ الاستخراج: ${generatedAt}`)}`);
  lines.push(`${sanitizeCsvCell(`# المستخدم المستخرج: ${userEmail}`)},${sanitizeCsvCell(`# إجمالي السجلات: ${rows.length}`)}`);

  for (const [k, v] of Object.entries(metadata)) {
    lines.push(`${sanitizeCsvCell(`# ${k}: ${v}`)}`);
  }

  // Column Headers
  const headerLine = headers.map(h => sanitizeCsvCell(h.label || h.key)).join(',');
  lines.push(headerLine);

  // Data Rows
  for (const row of rows) {
    const rowValues = headers.map(h => {
      const val = row[h.key];
      return sanitizeCsvCell(val);
    });
    lines.push(rowValues.join(','));
  }

  return BOM + lines.join('\r\n');
}

/**
 * 3. Server-Side Query & Scope Contract Builder
 * Enforces pagination limits (max 500) and prevents branch/department scope bypass
 */
export function buildReportQueryContract(reportId, filters = {}, userScope = {}, pagination = {}) {
  const page = Math.max(1, Number(pagination.page) || 1);
  const requestedPageSize = Number(pagination.pageSize) || 50;
  // Hard cap pagination to 500 per query to prevent DOS / memory exhaustion
  const pageSize = Math.min(500, Math.max(1, requestedPageSize));
  const offset = (page - 1) * pageSize;
  const limit = pageSize;

  const appliedFilters = { ...filters };
  let isScoped = false;
  let scopeNotice = null;

  // Scope enforcement for restricted managers
  if (userScope.type === 'branch' && userScope.branchId) {
    if (appliedFilters.branch && appliedFilters.branch !== userScope.branchId) {
      throw new Error(`محاولة غير مصرح بها: لا يمكنك الوصول لتقارير الفرع ${appliedFilters.branch}`);
    }
    appliedFilters.branch = userScope.branchId;
    isScoped = true;
    scopeNotice = `البيانات مقيدة بنطاق فرع المستخدم: ${userScope.branchId}`;
  }

  if (userScope.type === 'department' && userScope.departmentId) {
    if (appliedFilters.department && appliedFilters.department !== userScope.departmentId) {
      throw new Error(`محاولة غير مصرح بها: لا يمكنك الوصول لتقارير القسم ${appliedFilters.department}`);
    }
    appliedFilters.department = userScope.departmentId;
    isScoped = true;
    scopeNotice = `البيانات مقيدة بنطاق قسم المستخدم: ${userScope.departmentId}`;
  }

  if (userScope.type === 'self' && userScope.targetEmpNo) {
    appliedFilters.emp_no = userScope.targetEmpNo;
    isScoped = true;
    scopeNotice = `البيانات مقيدة بالسجل الشخصي للموظف: ${userScope.targetEmpNo}`;
  }

  return {
    reportId,
    page,
    pageSize,
    limit,
    offset,
    appliedFilters,
    isScoped,
    scopeNotice,
  };
}

/**
 * 4. High-Precision Pure Analytical Aggregation Engine
 */
export function aggregateReportMetrics(rows = [], rules = []) {
  if (!Array.isArray(rows)) return {};

  const results = {};

  for (const rule of rules) {
    const { key, field, type } = rule;
    if (!key || !type) continue;

    switch (type) {
      case 'count':
        results[key] = rows.length;
        break;

      case 'sum': {
        const sum = rows.reduce((acc, row) => {
          const val = Number(row[field]);
          return acc + (Number.isFinite(val) ? val : 0);
        }, 0);
        results[key] = Math.round((sum + Number.EPSILON) * 100) / 100;
        break;
      }

      case 'avg': {
        const count = rows.length;
        if (count === 0) {
          results[key] = 0;
          break;
        }
        const sum = rows.reduce((acc, row) => {
          const val = Number(row[field]);
          return acc + (Number.isFinite(val) ? val : 0);
        }, 0);
        results[key] = Math.round(((sum / count) + Number.EPSILON) * 100) / 100;
        break;
      }

      case 'min': {
        const values = rows.map(r => Number(r[field])).filter(Number.isFinite);
        results[key] = values.length ? Math.min(...values) : 0;
        break;
      }

      case 'max': {
        const values = rows.map(r => Number(r[field])).filter(Number.isFinite);
        results[key] = values.length ? Math.max(...values) : 0;
        break;
      }

      case 'distinctCount': {
        const unique = new Set(rows.map(r => String(r[field] ?? '')).filter(Boolean));
        results[key] = unique.size;
        break;
      }

      default:
        break;
    }
  }

  return results;
}

/**
 * 5. Data Quality & Reconciliation Diagnostic Engine
 * Detects orphan records, missing links, and calculation discrepancies
 */
export function detectReportDataQualityIssues(dataset = {}) {
  const {
    employees = [],
    attendance = [],
    payrollItems = [],
    loans = [],
  } = dataset;

  const issues = [];

  // A. Check active employees for missing basic salary
  for (const emp of employees) {
    const isActive = emp.status === 'active' || emp.status === 'نشط';
    if (isActive) {
      const basic = Number(emp.basic_salary);
      if (!Number.isFinite(basic) || basic <= 0) {
        issues.push({
          id: `emp-nosalary-${emp.id || emp.emp_no}`,
          type: 'missing_salary',
          severity: 'high',
          description: `الموظف النشط (${emp.emp_no || ''} - ${emp.full_name || ''}) ليس لديه راتب أساسي محدد`,
          recordId: emp.id || emp.emp_no,
          details: { emp_no: emp.emp_no, branch: emp.branch, department: emp.department },
        });
      }

      if (!emp.branch || !emp.department) {
        issues.push({
          id: `emp-noorg-${emp.id || emp.emp_no}`,
          type: 'unassigned_org',
          severity: 'medium',
          description: `الموظف النشط (${emp.emp_no || ''}) غير مسكن على فرع أو قسم رسمي`,
          recordId: emp.id || emp.emp_no,
          details: { emp_no: emp.emp_no, branch: emp.branch, department: emp.department },
        });
      }
    }
  }

  // B. Check attendance anomalies (missing checkout on past work days)
  const todayStr = new Date().toISOString().slice(0, 10);
  for (const att of attendance) {
    const isPast = att.work_date && att.work_date < todayStr;
    if (isPast && att.check_in && !att.check_out && !['excused', 'مستأذن', 'مهمة عمل'].includes(att.status)) {
      issues.push({
        id: `att-nocheckout-${att.id || `${att.employee_id}-${att.work_date}`}`,
        type: 'missing_checkout',
        severity: 'medium',
        description: `سجل حضور بتاريخ (${att.work_date}) للموظف (${att.employee_id || ''}) بدون بصمة انصراف`,
        recordId: att.id,
        details: { work_date: att.work_date, employee_id: att.employee_id, check_in: att.check_in },
      });
    }

    if (att.late_minutes && Number(att.late_minutes) > 720) {
      issues.push({
        id: `att-excessive-late-${att.id}`,
        type: 'suspicious_attendance',
        severity: 'high',
        description: `دقائق تأخير مشبوهة تتجاوز 12 ساعة (${att.late_minutes} دقيقة) في يوم ${att.work_date}`,
        recordId: att.id,
        details: { late_minutes: att.late_minutes, work_date: att.work_date },
      });
    }
  }

  // C. Check payroll items reconciliation (Gross - Deductions === Net)
  for (const item of payrollItems) {
    const gross = Number(item.gross_salary || item.total_entitlements || 0);
    const deductions = Number(item.total_deductions || 0);
    const net = Number(item.net_salary || 0);

    const calculatedNet = Math.round((gross - deductions + Number.EPSILON) * 100) / 100;
    const diff = Math.abs(calculatedNet - net);

    if (diff > 0.01) {
      issues.push({
        id: `payroll-unreconciled-${item.id || item.employee_id}`,
        type: 'payroll_unreconciled',
        severity: 'critical',
        description: `عدم تطابق في مسير الراتب للموظف (${item.employee_id || item.emp_no}): الإجمالي (${gross}) - الاستقطاعات (${deductions}) لا يساوي الصافي (${net})`,
        recordId: item.id,
        details: { gross, deductions, net, difference: diff },
      });
    }
  }

  // D. Check loans for unlinked active employees
  const empIdSet = new Set(employees.map(e => String(e.id || e.emp_no)));
  for (const loan of loans) {
    const loanEmp = String(loan.employee_id || loan.emp_no || '');
    if (loanEmp && empIdSet.size > 0 && !empIdSet.has(loanEmp)) {
      issues.push({
        id: `loan-orphan-${loan.id}`,
        type: 'orphan_loan',
        severity: 'critical',
        description: `سلفة قائمة برقم (${loan.id}) غير مرتبطة بأي موظف مسجل بالمنظومة`,
        recordId: loan.id,
        details: { employee_id: loan.employee_id, amount: loan.amount },
      });
    }
  }

  const counts = {
    critical: issues.filter(i => i.severity === 'critical').length,
    high: issues.filter(i => i.severity === 'high').length,
    medium: issues.filter(i => i.severity === 'medium').length,
  };

  return {
    hasIssues: issues.length > 0,
    issues,
    summary: {
      total: issues.length,
      ...counts,
    },
  };
}

/**
 * 6. Executive Dashboard KPIs Pure Calculation Engine
 * Replaces any mock/random values with verifiable, real domain arithmetic
 */
export function evaluateDashboardWidgetMetrics(params) {
  const {
    employees = [],
    attendanceToday = [],
    payrollRuns = [],
    loans = [],
  } = params;

  // A. Workforce Metrics
  const activeEmployees = employees.filter(e => e.status === 'active' || e.status === 'نشط');
  const totalActive = activeEmployees.length;

  const saudiEmployees = activeEmployees.filter(e => {
    const nat = String(e.nationality || '').trim();
    return nat === 'سعودي' || nat === 'سعودية' || nat.toLowerCase() === 'saudi';
  });

  const saudizationRate = totalActive > 0
    ? Math.round(((saudiEmployees.length / totalActive) * 100 + Number.EPSILON) * 10) / 10
    : 0;

  // B. Attendance Metrics for Today
  const totalAttendanceLogged = attendanceToday.length;
  const presentEmployees = attendanceToday.filter(a => a.check_in != null);
  const lateEmployees = attendanceToday.filter(a => Number(a.late_minutes) > 0);

  const totalLateMins = lateEmployees.reduce((sum, a) => sum + (Number(a.late_minutes) || 0), 0);
  const avgLateMins = lateEmployees.length > 0
    ? Math.round(totalLateMins / lateEmployees.length)
    : 0;

  const attendanceAdherenceRate = totalActive > 0
    ? Math.round(((presentEmployees.length / totalActive) * 100 + Number.EPSILON) * 10) / 10
    : 0;

  // C. Payroll Financial Liabilities
  const latestApprovedRun = payrollRuns.find(r => r.status === 'approved' || r.status === 'paid') || payrollRuns[0];
  const monthlyPayrollCost = Number(latestApprovedRun?.total_net_salaries || latestApprovedRun?.total_net || 0);

  // D. Loans Recovery Metrics
  const totalLoanAmount = loans.reduce((acc, l) => acc + (Number(l.approved_amount || l.amount) || 0), 0);
  const totalPaidAmount = loans.reduce((acc, l) => acc + (Number(l.paid_amount) || 0), 0);
  const outstandingLoans = Math.max(0, totalLoanAmount - totalPaidAmount);
  const loanRecoveryRate = totalLoanAmount > 0
    ? Math.round(((totalPaidAmount / totalLoanAmount) * 100 + Number.EPSILON) * 10) / 10
    : 0;

  return {
    saudizationRate: {
      metricId: 'kpi_saudization_rate',
      displayName: 'نسبة التوطين (نطاقات)',
      value: saudizationRate,
      unit: '%',
      saudiCount: saudiEmployees.length,
      totalActive,
      isMock: false,
      sourceTable: 'employees',
    },
    attendanceAdherence: {
      metricId: 'kpi_attendance_adherence',
      displayName: 'نسبة الحضور والانضباط',
      value: attendanceAdherenceRate,
      unit: '%',
      presentCount: presentEmployees.length,
      lateCount: lateEmployees.length,
      avgLateMinutes: avgLateMins,
      isMock: false,
      sourceTable: 'attendance_records',
    },
    monthlyPayrollCost: {
      metricId: 'kpi_monthly_payroll',
      displayName: 'إجمالي التكلفة الشهرية للرواتب',
      value: monthlyPayrollCost,
      currency: 'SAR',
      periodKey: latestApprovedRun?.period_key || 'N/A',
      isMock: false,
      sourceTable: 'payroll_runs',
    },
    loanPortfolio: {
      metricId: 'kpi_loan_portfolio',
      displayName: 'محفظة السلف القائمة',
      outstandingAmount: outstandingLoans,
      recoveryRate: loanRecoveryRate,
      currency: 'SAR',
      isMock: false,
      sourceTable: 'loans',
    },
  };
}
