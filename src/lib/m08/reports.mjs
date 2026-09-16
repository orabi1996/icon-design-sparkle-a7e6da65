import { dates, minutes } from './time.mjs';
import { publishedAssignments, coverage, requiredIntervals, differences } from './planning.mjs';
export function reportRows(state, report, from, to, audit = []) {
  dates(from, to);
  const published = publishedAssignments(state).filter(a => a.workDate >= from && a.workDate <= to);
  const newestApproved = new Map(state.results.filter(r => r.approval?.status === 'approved').map(r => [r.assignmentKey, r]));
  if (report === 'rosters') return state.rosters.flatMap(r => r.assignments.filter(a => a.workDate >= from && a.workDate <= to).map(a => ({
    employeeId: a.employeeId, employeeCode: a.employeeCode, name: a.nameAr, branch: a.branch, department: a.department, team: a.team,
    workDate: a.workDate, dayType: a.dayType, periodNo: a.periodNo, shiftCode: a.shift?.code ?? '', start: a.start ?? '', end: a.end ?? '', timezone: a.timezone ?? '',
    siteCode: a.siteCode, costCenter: a.costCenter ?? '', requiredMinutes: a.dayType === 'WORK' ? minutes(requiredIntervals(a)) : 0,
    night: a.shift?.endDay === 1 ? 1 : 0, source: a.source, rosterId: r.id, version: r.version, status: r.status })));
  if (report === 'coverage') return coverage(state, publishedAssignments(state), state.demands.filter(d => d.workDate >= from && d.workDate <= to)).segments;
  if (report === 'planned_actual') return published.map(a => {
    const result = newestApproved.get(a.key);
    return { employeeId: a.employeeId, employeeCode: a.employeeCode, branch: a.branch, siteCode: a.siteCode, workDate: a.workDate, dayType: a.dayType, shiftCode: a.shift?.code ?? '',
      plannedMinutes: a.dayType === 'WORK' ? minutes(requiredIntervals(a)) : 0, actualMinutes: result?.actualMinutes ?? null, paidMinutes: result?.paidMinutes ?? null,
      missingMinutes: result?.missingMinutes ?? null, resultId: result?.id ?? '', resultVersion: result?.version ?? '', rosterId: a.rosterId, rosterVersion: a.rosterVersion };
  });
  if (report === 'night_distribution') {
    const byEmployee = new Map();
    for (const a of published.filter(a => a.dayType === 'WORK' && a.shift?.endDay === 1)) {
      const key = `${a.employeeId}:${a.branch}:${a.siteCode}`;
      const row = byEmployee.get(key) ?? { employeeId: a.employeeId, employeeCode: a.employeeCode, branch: a.branch, siteCode: a.siteCode, nights: 0, plannedMinutes: 0, workDates: [] };
      row.nights++; row.plannedMinutes += minutes(requiredIntervals(a)); row.workDates.push(a.workDate); byEmployee.set(key, row);
    }
    return [...byEmployee.values()];
  }
  if (report === 'published_changes') return state.rosters.filter(r => r.status === 'published' && r.baseId && r.publishedAt?.slice(0, 10) >= from && r.publishedAt.slice(0, 10) <= to).flatMap(r => {
    const base = state.rosters.find(old => old.id === r.baseId);
    return base ? differences(base.assignments, r.assignments).map(change => ({ employeeId: change.after?.employeeId ?? change.before?.employeeId,
      workDate: change.after?.workDate ?? change.before?.workDate, branch: change.after?.branch ?? change.before?.branch, siteCode: change.after?.siteCode ?? change.before?.siteCode,
      before: change.before?.shift?.code ?? change.before?.dayType ?? '', after: change.after?.shift?.code ?? change.after?.dayType ?? '',
      publishedAt: r.publishedAt, sourceRosterId: base.id, rosterId: r.id, version: r.version, reason: r.reason ?? '' })) : [];
  });
  if (report === 'swaps') return state.requests.filter(r => ['swap', 'give', 'change', 'open'].includes(r.kind) && r.at.slice(0, 10) >= from && r.at.slice(0, 10) <= to)
    .map(r => ({ employeeId: r.employeeId, workDate: r.workDate ?? '', siteCode: r.siteCode ?? '', kind: r.kind, status: r.status, requestId: r.id,
      approvedStages: r.managerApprovals?.length ?? 0, executedAt: r.executedAt ?? '', resultRosterIds: r.resultRosterIds?.join(';') ?? '', reason: r.reason }));
  if (report === 'overtime') return [...newestApproved.values()].filter(r => r.workDate >= from && r.workDate <= to).map(r => ({ employeeId: r.employeeId,
    workDate: r.workDate, branch: r.branch ?? '', siteCode: r.siteCode ?? '', plannedMinutes: r.plannedOvertimeMinutes, observedMinutes: r.observedOvertimeMinutes, eligibleMinutes: r.eligibleOvertimeMinutes,
    approvedMinutes: r.approvedOvertimeMinutes, deliveredMinutes: state.deliveries.filter(d => d.kind === 'payroll' && d.assignmentKey === r.assignmentKey && d.status === 'accepted').reduce((n, d) => n + (d.quantities.overtime ?? 0), 0),
    resultId: r.id, resultVersion: r.version, costCenter: r.costCenter ?? '' }));
  if (report === 'cost_centers') {
    const centers = new Map();
    for (const a of published.filter(a => a.dayType === 'WORK')) {
      const key = `${a.branch}:${a.siteCode}:${a.costCenter ?? ''}`;
      const row = centers.get(key) ?? { branch: a.branch, siteCode: a.siteCode, costCenter: a.costCenter ?? '', plannedMinutes: 0, actualMinutes: 0, paidMinutes: 0,
        plannedAssignments: 0, recordedAssignments: 0, nights: 0, employees: new Set() };
      const result = newestApproved.get(a.key);
      row.plannedMinutes += minutes(requiredIntervals(a)); row.plannedAssignments++;
      if (result?.actualMinutes != null) { row.actualMinutes += result.actualMinutes; row.paidMinutes += result.paidMinutes ?? 0; row.recordedAssignments++; }
      row.nights += a.shift?.endDay === 1 ? 1 : 0;
      row.employees.add(a.employeeId); centers.set(key, row);
    }
    return [...centers.values()].map(({ employees, ...row }) => ({ ...row, actualMinutes: row.recordedAssignments ? row.actualMinutes : null,
      paidMinutes: row.recordedAssignments ? row.paidMinutes : null, unconfirmedAssignments: row.plannedAssignments - row.recordedAssignments, headcount: employees.size }));
  }
  if (report === 'results') return state.results.filter(r => r.workDate >= from && r.workDate <= to).map(r => ({ employeeId: r.employeeId, workDate: r.workDate, branch: r.branch ?? '', siteCode: r.siteCode ?? '', resultId: r.id, version: r.version,
    requiredMinutes: r.requiredMinutes, presenceMinutes: r.presenceMinutes, actualMinutes: r.actualMinutes, paidMinutes: r.paidMinutes, excusedMinutes: r.excusedMinutes,
    missingMinutes: r.missingMinutes, lateMinutes: r.lateMinutes, plannedOvertime: r.plannedOvertimeMinutes, observedOvertime: r.observedOvertimeMinutes,
    eligibleOvertime: r.eligibleOvertimeMinutes, approvedOvertime: r.approvedOvertimeMinutes, exportedOvertime: state.deliveries.filter(d => d.resultId === r.id && d.status === 'accepted').reduce((n, d) => n + (d.quantities.overtime ?? 0), 0),
    costCenter: r.costCenter ?? '', approval: r.approval.status, rosterId: r.sources.rosterId, rosterVersion: r.sources.rosterVersion, policyVersion: r.sources.policyVersion }));
  if (report === 'requests') return state.requests.filter(r => r.at.slice(0, 10) >= from && r.at.slice(0, 10) <= to).map(r => ({ id: r.id, employeeId: r.employeeId, workDate: r.workDate ?? '', siteCode: r.siteCode ?? '', kind: r.kind, status: r.status, at: r.at, executedAt: r.executedAt ?? '', reason: r.reason }));
  if (report === 'deliveries') return state.deliveries.filter(d => (d.workDate ?? d.at.slice(0, 10)) >= from && (d.workDate ?? d.at.slice(0, 10)) <= to).map(d => ({ id: d.id, employeeId: d.employeeId, workDate: d.workDate ?? '', branch: d.branch ?? '', siteCode: d.siteCode ?? '', kind: d.kind, periodId: d.periodId ?? '', resultId: d.resultId ?? '', status: d.status, ...d.quantities, costCenter: d.costCenter ?? '', adjustmentOf: d.adjustmentOf?.join(';') ?? '', reference: d.externalReference ?? '' }));
  if (report === 'audit') return audit.filter(a => a.at.slice(0, 10) >= from && a.at.slice(0, 10) <= to).map(a => ({ revision: a.revision, at: a.at, actor: a.actor_id, action: a.event.type, reason: a.event.reason, before: JSON.stringify(a.event.before), after: JSON.stringify(a.event.after) }));
  throw new Error('تقرير غير مدعوم');
}
export function csvExport(rows, metadata = {}) {
  const safe = value => {
    const s = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    // Prevent formula execution when an exported CSV is opened in spreadsheet applications.
    return `"${(/^(?:\s*[=+\-@]|[\t\r\n])/.test(s) ? "'" + s : s).replaceAll('"', '""')}"`;
  };
  const headers = [...new Set(rows.flatMap(r => Object.keys(r)))];
  return '\uFEFF' + [Object.entries(metadata).map(([k, v]) => safe(`${k}: ${v}`)).join(','), headers.map(safe).join(','), ...rows.map(r => headers.map(k => safe(r[k])).join(','))].join('\r\n');
}
