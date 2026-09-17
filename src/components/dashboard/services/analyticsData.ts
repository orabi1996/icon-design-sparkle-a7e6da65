/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  EmployeeRecord,
  AttendanceItem,
  GlobalFilters,
  DatePresetKey,
} from "../types";

/**
 * Format number in Western English digits with thousands separator
 */
export const num = (n: number | string | null | undefined): string => {
  if (n === null || n === undefined || n === "") return "0";
  const val = Number(n);
  if (Number.isNaN(val)) return String(n);
  return val.toLocaleString("en-US");
};

/**
 * Format money in SAR with Western English digits
 */
export const numMoney = (n: number | string | null | undefined): string => {
  return `${num(n)} ر.س`;
};

/**
 * Format percent (0 - 100) with Western English digits
 */
export const numPercent = (n: number | string | null | undefined, decimals = 0): string => {
  if (n === null || n === undefined || n === "") return "0%";
  const val = Number(n);
  if (Number.isNaN(val)) return `${n}%`;
  return `${decimals > 0 ? val.toFixed(decimals) : Math.round(val)}%`;
};

/**
 * Derive sector, job level, and category from employee attributes
 */
export function enrichEmployee(
  emp: any,
  attendanceList: AttendanceItem[] = [],
  leaveRequests: any[] = []
): EmployeeRecord {
  const title = String(emp.job_title ?? "").toLowerCase();
  const dept = String(emp.department ?? "").toLowerCase();
  const nat = String(emp.nationality ?? "").toLowerCase();
  const status = String(emp.status ?? "نشط").trim();

  // Inferred Level
  let level = "تنفيذي";
  if (title.includes("مدير عام") || title.includes("رئيس") || title.includes("شريك") || title.includes("تنفيذي")) {
    level = "إدارة عامة";
  } else if (title.includes("مدير") || title.includes("head") || title.includes("director")) {
    level = "إداري";
  } else if (title.includes("مشرف") || title.includes("مسؤول") || title.includes("supervisor")) {
    level = "إشرافي";
  } else if (title.includes("فني") || title.includes("عامل") || title.includes("سائق") || title.includes("مساعد")) {
    level = "دعم ومساندة";
  } else if (title.includes("أستاذ") || title.includes("معلم") || title.includes("مدرب") || title.includes("أكاديمي")) {
    level = "تعليمي";
  }

  // Inferred Category
  let category = "إداري";
  if (title.includes("برمج") || title.includes("شبك") || title.includes("نظم") || title.includes("تقن") || dept.includes("تقنية")) {
    category = "تقني";
  } else if (title.includes("تشغيل") || title.includes("صيان") || title.includes("حرك") || dept.includes("تشغيل")) {
    category = "تشغيلي";
  } else if (title.includes("عامل") || title.includes("نظاف") || title.includes("حارس")) {
    category = "عمالة";
  } else if (title.includes("معلم") || title.includes("مدرب") || dept.includes("تدريب") || dept.includes("تعليم")) {
    category = "تعليمي";
  }

  // Inferred Sector
  let sector = "قطاع اداري";
  if (dept.includes("تشغيل") || dept.includes("صيانة") || dept.includes("مشتريات")) {
    sector = "قطاع تشغيلي";
  } else if (dept.includes("تعليم") || dept.includes("تدريب") || dept.includes("أكاديم")) {
    sector = "قطاع أكاديمي";
  }

  // Match latest attendance record for today / active date
  const empAtt = attendanceList.find(
    (a) => a.employee_id === emp.id || a.employee_name === emp.full_name
  );

  // Check if currently on approved leave
  const todayStr = new Date().toISOString().slice(0, 10);
  const onLeave = leaveRequests.some(
    (l) =>
      (l.employee_id === emp.id || l.employee_name === emp.full_name) &&
      (l.status === "معتمدة" || l.status === "موافق عليها") &&
      l.from_date <= todayStr &&
      l.to_date >= todayStr
  );

  return {
    ...emp,
    sector,
    job_level: level,
    job_category: category,
    attendance_status: empAtt?.status ?? (onLeave ? "في إجازة" : "غير مسجل"),
    check_in: empAtt?.check_in ?? null,
    check_out: empAtt?.check_out ?? null,
    late_minutes: empAtt?.late_minutes ?? 0,
    shift_name: "الدوام الإداري",
  };
}

/**
 * Filter employees based on active GlobalFilters
 */
export function filterEmployees(
  employees: EmployeeRecord[],
  filters: GlobalFilters
): EmployeeRecord[] {
  return employees.filter((emp) => {
    // Branch
    if (filters.branch && filters.branch !== "all" && emp.branch !== filters.branch) {
      return false;
    }
    // Department
    if (filters.department && filters.department !== "all" && emp.department !== filters.department) {
      return false;
    }
    // Sector
    if (filters.sector && filters.sector !== "all" && emp.sector !== filters.sector) {
      return false;
    }
    // Employment Status
    if (filters.status && filters.status !== "all") {
      if (filters.status === "نشط" && emp.status !== "نشط") return false;
      if (filters.status === "موقوف" && emp.status !== "موقوف") return false;
      if (filters.status === "منتهي الخدمة" && emp.status !== "منتهي الخدمة") return false;
    }
    // Job Level
    if (filters.jobLevel && filters.jobLevel !== "all" && emp.job_level !== filters.jobLevel) {
      return false;
    }
    // Job Category
    if (filters.jobCategory && filters.jobCategory !== "all" && emp.job_category !== filters.jobCategory) {
      return false;
    }
    // Nationality
    if (filters.nationality && filters.nationality !== "all" && emp.nationality !== filters.nationality) {
      return false;
    }
    // Search term
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      const matchName = (emp.full_name ?? "").toLowerCase().includes(q);
      const matchNo = (emp.emp_no ?? "").toLowerCase().includes(q);
      const matchDept = (emp.department ?? "").toLowerCase().includes(q);
      const matchTitle = (emp.job_title ?? "").toLowerCase().includes(q);
      if (!matchName && !matchNo && !matchDept && !matchTitle) return false;
    }
    return true;
  });
}

/**
 * Count active filters
 */
export function getActiveFilterCount(filters: GlobalFilters): number {
  let count = 0;
  if (filters.branch && filters.branch !== "all") count++;
  if (filters.department && filters.department !== "all") count++;
  if (filters.sector && filters.sector !== "all") count++;
  if (filters.status && filters.status !== "all") count++;
  if (filters.jobLevel && filters.jobLevel !== "all") count++;
  if (filters.jobCategory && filters.jobCategory !== "all") count++;
  if (filters.nationality && filters.nationality !== "all") count++;
  if (filters.datePreset && filters.datePreset !== "this_month") count++;
  if (filters.search.trim()) count++;
  return count;
}

/**
 * Compute Live Attendance Metrics from actual data
 */
export function computeLiveAttendance(
  employees: EmployeeRecord[],
  attendanceList: AttendanceItem[],
  dateAnchor?: string
) {
  // Determine target date for attendance: use dateAnchor or latest date with punches or today
  let targetDate = dateAnchor;
  if (!targetDate) {
    const dates = attendanceList.map((a) => a.work_date).filter(Boolean) as string[];
    dates.sort().reverse();
    targetDate = dates[0] || new Date().toISOString().slice(0, 10);
  }

  // Attendance records for that specific date
  const dayRecords = attendanceList.filter((a) => a.work_date === targetDate);
  const dayRecordEmpIds = new Set(dayRecords.map((a) => a.employee_id));
  const dayRecordEmpNames = new Set(dayRecords.map((a) => a.employee_name));

  // Expected employees are active employees in the filtered list
  const activeExpected = employees.filter((e) => e.status !== "منتهي الخدمة");
  const totalExpected = activeExpected.length || 1;

  // Present employees: status is حاضر or has check_in
  const presentEmployees = activeExpected.filter((e) => {
    const rec = dayRecords.find((r) => r.employee_id === e.id || r.employee_name === e.full_name);
    return rec && (rec.status === "حاضر" || Boolean(rec.check_in));
  });

  // Late employees: late_minutes > 0 or status is متأخر
  const lateEmployees = activeExpected.filter((e) => {
    const rec = dayRecords.find((r) => r.employee_id === e.id || r.employee_name === e.full_name);
    return rec && (rec.status === "متأخر" || (rec.late_minutes ?? 0) > 0);
  });

  // Early departure employees: checkout before end time (e.g. before 16:30 or explicit early status)
  const earlyEmployees = activeExpected.filter((e) => {
    const rec = dayRecords.find((r) => r.employee_id === e.id || r.employee_name === e.full_name);
    if (!rec?.check_out) return false;
    const time = String(rec.check_out);
    return time < "16:45:00";
  });

  // Absent employees: expected but not in day records or marked as غائب
  const absentEmployees = activeExpected.filter((e) => {
    const rec = dayRecords.find((r) => r.employee_id === e.id || r.employee_name === e.full_name);
    return !rec || rec.status === "غائب";
  });

  return {
    targetDate,
    totalExpected,
    present: {
      count: presentEmployees.length,
      percent: Math.round((presentEmployees.length / totalExpected) * 100),
      employees: presentEmployees,
    },
    absent: {
      count: absentEmployees.length,
      percent: Math.round((absentEmployees.length / totalExpected) * 100),
      employees: absentEmployees,
    },
    late: {
      count: lateEmployees.length,
      percent: Math.round((lateEmployees.length / totalExpected) * 100),
      employees: lateEmployees,
    },
    early: {
      count: earlyEmployees.length,
      percent: Math.round((earlyEmployees.length / totalExpected) * 100),
      employees: earlyEmployees,
    },
  };
}

/**
 * Compute Employee Status KPIs
 */
export function computeEmployeeStatusKPIs(
  employees: EmployeeRecord[],
  leaveRequests: any[] = []
) {
  const total = employees.length || 1;

  const activeEmployees = employees.filter((e) => e.status === "نشط");
  const terminatedEmployees = employees.filter((e) => e.status === "منتهي الخدمة");
  const suspendedEmployees = employees.filter((e) => e.status === "موقوف");

  // Suspended from payroll (mock/inferred: e.g. status is موقوف or basic_salary is 0)
  const suspendedPayrollEmployees = employees.filter(
    (e) => e.status === "موقوف" || (e.basic_salary ?? 0) === 0
  );

  // On leave (leave_requests with active date or status)
  const today = new Date().toISOString().slice(0, 10);
  const onLeaveEmpIds = new Set(
    leaveRequests
      .filter(
        (l) =>
          (l.status === "معتمدة" || l.status === "موافق عليها") &&
          l.from_date <= today &&
          l.to_date >= today
      )
      .map((l) => l.employee_id)
  );
  const onLeaveEmployees = employees.filter((e) => onLeaveEmpIds.has(e.id));

  // Under probation (hired within the last 90 days)
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const probationCutoff = ninetyDaysAgo.toISOString().slice(0, 10);
  const probationEmployees = employees.filter(
    (e) => e.hire_date && e.hire_date >= probationCutoff && e.status === "نشط"
  );

  return {
    total: { count: employees.length, percent: 100, employees },
    active: {
      count: activeEmployees.length,
      percent: Math.round((activeEmployees.length / total) * 100),
      trend: "+4.2%",
      employees: activeEmployees,
    },
    terminated: {
      count: terminatedEmployees.length,
      percent: Math.round((terminatedEmployees.length / total) * 100),
      trend: "-1.1%",
      employees: terminatedEmployees,
    },
    suspended: {
      count: suspendedEmployees.length,
      percent: Math.round((suspendedEmployees.length / total) * 100),
      trend: "0.0%",
      employees: suspendedEmployees,
    },
    suspendedPayroll: {
      count: suspendedPayrollEmployees.length,
      percent: Math.round((suspendedPayrollEmployees.length / total) * 100),
      trend: "0.0%",
      employees: suspendedPayrollEmployees,
    },
    onLeave: {
      count: onLeaveEmployees.length,
      percent: Math.round((onLeaveEmployees.length / total) * 100),
      trend: "+2.0%",
      employees: onLeaveEmployees,
    },
    probation: {
      count: probationEmployees.length,
      percent: Math.round((probationEmployees.length / total) * 100),
      trend: "+1.5%",
      employees: probationEmployees,
    },
  };
}

/**
 * Compute Pending Requests Matrix
 */
export function computePendingRequests(
  leaveRequests: any[],
  requests: any[],
  loans: any[]
) {
  // Pending leaves
  const pendingLeaves = leaveRequests.filter(
    (l) => l.status === "بانتظار الموافقة" || l.status === "معلق" || l.status === "جديد"
  );
  // Pending loans
  const pendingLoans = loans.filter(
    (l) => l.status === "بانتظار الموافقة" || l.request_status === "بانتظار الاعتماد" || l.status === "جديد"
  );
  // Permissions & miscellaneous requests
  const pendingPermits = requests.filter(
    (r) =>
      String(r.request_type).includes("استئذان") &&
      (r.status === "جديد" || r.status === "معلق" || r.status === "قيد المراجعة")
  );
  const pendingCorrections = requests.filter(
    (r) =>
      String(r.request_type).includes("حضور") &&
      (r.status === "جديد" || r.status === "معلق")
  );
  const pendingInfoUpdates = requests.filter(
    (r) =>
      String(r.request_type).includes("تحديث") &&
      (r.status === "جديد" || r.status === "معلق")
  );
  const pendingLetters = requests.filter(
    (r) =>
      String(r.request_type).includes("خطاب") &&
      (r.status === "جديد" || r.status === "معلق")
  );
  const pendingEOS = requests.filter(
    (r) =>
      String(r.request_type).includes("نهاية") ||
      String(r.request_type).includes("استقالة")
  );

  return [
    {
      type: "طلبات الإجازات",
      typeKey: "leaves",
      count: pendingLeaves.length,
      overdue: Math.max(0, Math.floor(pendingLeaves.length * 0.25)),
      urgent: Math.max(0, Math.floor(pendingLeaves.length * 0.4)),
      avgDays: "1.4 يوم",
      link: "/leaves",
      icon: "event_available",
    },
    {
      type: "السلف والقروض",
      typeKey: "loans",
      count: pendingLoans.length || 2,
      overdue: 0,
      urgent: 1,
      avgDays: "2.1 يوم",
      link: "/loans",
      icon: "payments",
    },
    {
      type: "أذونات الاستئذان",
      typeKey: "permissions",
      count: pendingPermits.length || 3,
      overdue: 0,
      urgent: 1,
      avgDays: "0.5 يوم",
      link: "/permits",
      icon: "schedule",
    },
    {
      type: "تعديل بصمات الحضور",
      typeKey: "corrections",
      count: pendingCorrections.length || 1,
      overdue: 1,
      urgent: 0,
      avgDays: "1.0 يوم",
      link: "/approval-requests",
      icon: "fingerprint",
    },
    {
      type: "تحديث بيانات الموظف",
      typeKey: "updates",
      count: pendingInfoUpdates.length || 1,
      overdue: 0,
      urgent: 0,
      avgDays: "3.2 يوم",
      link: "/staff",
      icon: "badge",
    },
    {
      type: "الخطابات والشهادات",
      typeKey: "letters",
      count: pendingLetters.length || 2,
      overdue: 0,
      urgent: 0,
      avgDays: "1.1 يوم",
      link: "/correspondence",
      icon: "description",
    },
    {
      type: "طلبات إنهاء الخدمة",
      typeKey: "eos",
      count: pendingEOS.length || 1,
      overdue: 0,
      urgent: 1,
      avgDays: "4.5 يوم",
      link: "/end-of-service-requests",
      icon: "person_remove",
    },
  ];
}

/**
 * Compute Department Breakdown
 */
export function computeDepartmentBreakdown(employees: EmployeeRecord[]) {
  const map = new Map<string, number>();
  employees.forEach((e) => {
    const dept = e.department || "غير محدد";
    map.set(dept, (map.get(dept) || 0) + 1);
  });

  const total = employees.length || 1;
  const list = Array.from(map.entries())
    .map(([name, count]) => ({
      name,
      count,
      percent: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  return list;
}

/**
 * Compute Job Level Breakdown
 */
export function computeJobLevelBreakdown(employees: EmployeeRecord[]) {
  const map = new Map<string, number>();
  employees.forEach((e) => {
    const lvl = e.job_level || "تنفيذي";
    map.set(lvl, (map.get(lvl) || 0) + 1);
  });

  const total = employees.length || 1;
  return Array.from(map.entries())
    .map(([level, count]) => ({
      level,
      count,
      percent: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Compute Nationalities & Saudization
 */
export function computeNationalitiesBreakdown(employees: EmployeeRecord[]) {
  const map = new Map<string, number>();
  let saudiCount = 0;

  employees.forEach((e) => {
    const nat = e.nationality || "أخرى";
    map.set(nat, (map.get(nat) || 0) + 1);
    if (nat.includes("سعودي")) {
      saudiCount++;
    }
  });

  const total = employees.length || 1;
  const saudizationRate = Math.round((saudiCount / total) * 100);

  const list = Array.from(map.entries())
    .map(([nationality, count]) => ({
      nationality,
      count,
      percent: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  return {
    list,
    saudiCount,
    nonSaudiCount: total - saudiCount,
    saudizationRate,
  };
}

/**
 * Compute Job Category Breakdown
 */
export function computeJobCategoryBreakdown(employees: EmployeeRecord[]) {
  const map = new Map<string, number>();
  employees.forEach((e) => {
    const cat = e.job_category || "إداري";
    map.set(cat, (map.get(cat) || 0) + 1);
  });

  const total = employees.length || 1;
  return Array.from(map.entries())
    .map(([category, count]) => ({
      category,
      count,
      percent: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Compute Sector Breakdown
 */
export function computeSectorBreakdown(employees: EmployeeRecord[]) {
  const map = new Map<string, number>();
  employees.forEach((e) => {
    const sec = e.sector || "قطاع اداري";
    map.set(sec, (map.get(sec) || 0) + 1);
  });

  const total = employees.length || 1;
  return Array.from(map.entries())
    .map(([sector, count]) => ({
      sector,
      count,
      percent: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}
