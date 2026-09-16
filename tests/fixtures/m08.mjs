import { emptyState, execute } from '../../src/lib/m08/engine.mjs';
import { ACTIONS } from '../../src/lib/m08/access.mjs';
import { assignmentFromShift } from '../../src/lib/m08/planning.mjs';
export const actor = { id: 'manager', roles: ['manager'], grants: [{ actions: ACTIONS, fields: ['cost', 'leave_detail'] }] };
export const reviewer = { ...actor, id: 'reviewer' };
export const employee = { id: 'user-e1', roles: ['employee'], grants: [{ employeeId: 'e1', actions: ['read', 'request', 'export'], fields: [] }] };
export const otherEmployee = { id: 'user-e2', roles: ['employee'], grants: [{ employeeId: 'e2', actions: ['read', 'request', 'export'], fields: [] }] };
export const now = '2026-09-20T09:00:00Z', after = '2026-10-08T10:00:00Z';
export function fixture() {
  const s = emptyState(), base = { version: 1, from: '2026-01-01', to: null, status: 'active', nameAr: 'تجريبي', nameEn: 'Test' };
  s.sites.push({ ...base, id: 'site', code: 'HQ', branch: 'A', timezone: 'UTC', costCenters: ['CC1'] });
  s.policies.push({ ...base, id: 'policy', code: 'POL', countryPackage: 'TEST_ONLY', maxPeriods: 2, maxDailyMinutes: 960, maxWeeklyMinutes: 4800, minRestMinutes: 600,
    maxConsecutiveDays: 7, maxSpanMinutes: 960, splitGapMinutes: 0, travelMinutes: 30, graceMinutes: 10, graceMode: 'threshold', graceWaivesMissing: false,
    overtimeThreshold: 0, overtimeCap: 240, overtimeMode: 'threshold', observeAfter: true, requireOvertimePlan: false, arrivalLagMinutes: 60,
    coverageSeverity: 'blocker', separateApprover: false, weekStart: 1, approvalRoles: ['manager'], holidays: [], changeNoticeMinutes: 0 });
  s.shifts.push({ ...base, id: 'morning', code: 'AM', type: 'fixed', color: '#006B80', startTime: '08:00', endTime: '16:00', endDay: 0, timezone: 'UTC', requiredMinutes: 450,
    punchMode: 'pairs', windowBefore: 60, windowAfter: 120, breaks: [{ start: 240, end: 270, paid: false }], requiredSkills: [] });
  s.shifts.push({ ...s.shifts[0], id: 'night', code: 'N', type: 'night', startTime: '22:00', endTime: '06:00', endDay: 1, requiredMinutes: 480, breaks: [] });
  s.shifts.push({ ...s.shifts[0], id: 'short', code: 'A', startTime: '08:00', endTime: '12:00', requiredMinutes: 240, breaks: [] });
  s.shifts.push({ ...s.shifts[0], id: 'evening', code: 'B', startTime: '17:00', endTime: '21:00', requiredMinutes: 240, breaks: [] });
  s.templates.push({ ...base, id: 'day', code: 'DAY', dayType: 'WORK', periods: [{ shiftId: 'morning', shiftVersion: 1, siteCode: 'HQ' }] }, { ...base, id: 'off', code: 'OFF', dayType: 'OFF', periods: [] });
  s.patterns.push({ ...base, id: 'pattern', code: 'ROT', type: 'rotating', anchor: '2026-10-01', days: [{ id: 'day', version: 1 }, { id: 'off', version: 1 }, { id: 'off', version: 1 }] });
  for (const id of ['e1', 'e2']) {
    s.employments.push({ ...base, id: `employment-${id}`, employeeId: id, code: id === 'e1' ? '00104' : '00105', nameAr: `موظف ${id}`, branch: 'A', department: 'D', team: 'T', job: 'J', siteCode: 'HQ', allowedSites: ['HQ'], costCenter: 'CC1', skills: ['nurse', 'driver'], userId: `user-${id}` });
    s.bindings.push({ ...base, id: `bind-${id}`, code: `B-${id}`, scope: 'employee', employeeIds: [id], priority: 600, patternId: 'pattern', patternVersion: 1, policyId: 'policy', policyVersion: 1, anchor: '2026-10-01', offset: 0 });
  }
  return s;
}
let serial = 0;
export function run(s, type, payload, who = actor, at = now, reason = 'سبب تجريبي موثق') { return execute(s, { type, payload, operationId: `test-operation-${++serial}`, reason }, who, at); }
export function roster(s, options = {}) {
  return run(s, 'roster.create', { name: 'جدول تجريبي', from: '2026-10-05', to: '2026-10-05', employeeIds: ['e1'], policyId: 'policy', policyVersion: 1, ...options });
}
export function row(s, employeeId = 'e1', day = '2026-10-05', shift = 'morning', period = 1) { return assignmentFromShift(s, employeeId, day, s.shifts.find(x => x.id === shift), 'HQ', 'CC1', period, s.policies[0]); }
export function publishFixture(s = fixture(), rows = null) {
  let r = roster(s, { employeeIds: [...new Set((rows ?? [{ employeeId: 'e1' }]).map(r => r.employeeId))] }); s = r.state;
  s.rosters[0].assignments = rows ?? [row(s)];
  for (const action of ['submit', 'approve', 'publish']) { r = run(s, `roster.${action}`, { rosterId: r.result.id, version: r.result.version }, reviewer); s = r.state; }
  return s;
}
export function punch(id, at, kind, employeeId = 'e1') { return { id, at, kind, employeeId, source: 'test', sourceEventId: id, siteCode: 'HQ' }; }
