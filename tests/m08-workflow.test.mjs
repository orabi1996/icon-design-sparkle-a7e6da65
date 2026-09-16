import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, actor, reviewer, employee, otherEmployee, now, after, run, punch, row, roster, publishFixture } from './fixtures/m08.mjs';
import { canonical, matchPunches, calculateAttendance, payrollDelta } from '../src/lib/m08/attendance.mjs';
import { effectiveRevisions, publishedAssignments } from '../src/lib/m08/planning.mjs';
import { employeeScope, projectState } from '../src/lib/m08/access.mjs';
import { csvExport, reportRows } from '../src/lib/m08/reports.mjs';

test('shift → template → repeating pattern → binding → approved publication → attendance → payroll → closed correction adjustment', () => {
  let s = fixture(); s.shifts = []; s.templates = []; s.patterns = []; s.bindings = [];
  const shift = { code: 'AM', nameAr: 'صباحي', nameEn: 'Morning', from: '2026-01-01', status: 'active', type: 'fixed', color: '#006B80',
    startTime: '08:00', endTime: '16:00', endDay: 0, timezone: 'UTC', requiredMinutes: 450, punchMode: 'pairs', windowBefore: 60, windowAfter: 120,
    breaks: [{ start: 240, end: 270, paid: false }], requiredSkills: [], disambiguation: 'reject' };
  let r = run(s, 'definition.save', { kind: 'shifts', value: shift, expectedVersion: 0 }); s = r.state; const shiftId = r.result.id;
  r = run(s, 'definition.save', { kind: 'templates', value: { code: 'DAY', nameAr: 'يوم عمل', nameEn: 'Workday', from: '2026-01-01', status: 'active', dayType: 'WORK', periods: [{ shiftId, shiftVersion: 1, siteCode: 'HQ' }] }, expectedVersion: 0 });
  s = r.state; const templateId = r.result.id;
  r = run(s, 'definition.save', { kind: 'patterns', value: { code: 'ROT', nameAr: 'دورة', nameEn: 'Cycle', from: '2026-01-01', status: 'active', type: 'rotating', anchor: '2026-10-01', days: [{ id: templateId, version: 1 }] }, expectedVersion: 0 });
  s = r.state; const patternId = r.result.id;
  r = run(s, 'binding.save', { value: { scope: 'employee', employeeIds: ['e1'], code: 'E-1', from: '2026-01-01', status: 'active', priority: 600, patternId, patternVersion: 1, policyId: 'policy', policyVersion: 1, anchor: '2026-10-01', offset: 0 } }); s = r.state;
  r = run(s, 'roster.create', { name: 'اختبار دورة العمل', from: '2026-10-05', to: '2026-10-05', employeeIds: ['e1'], policyId: 'policy', policyVersion: 1 });
  s = r.state; const rosterId = r.result.id;
  r = run(s, 'roster.generate', { rosterId, version: 1, mode: 'fill' }); s = r.state;
  assert.equal(r.result.assignments[0].shift.id, shiftId);
  for (const step of ['submit', 'approve', 'publish']) { r = run(s, `roster.${step}`, { rosterId, version: r.result.version }, reviewer); s = r.state; }
  assert.equal(s.rosters[0].status, 'published'); assert.equal(s.notifications.length, 1);
  const frozen = canonical(s.rosters[0].assignments);
  r = run(s, 'punch.ingest', { events: [punch('scan-in', '2026-10-05T08:00:00Z', 'in'), punch('scan-out', '2026-10-05T16:00:00Z', 'out')] }, actor, after);
  s = r.state; const rawId = s.punches.find(p => p.sourceEventId === 'scan-out').id;
  r = run(s, 'attendance.calculate', { assignmentKey: s.rosters[0].assignments[0].key }, actor, after); s = r.state;
  assert.equal(r.result.actualMinutes, 450); assert.equal(r.result.issues.length, 0);
  r = run(s, 'attendance.approve', { id: r.result.id }, reviewer, after); s = r.state;
  r = run(s, 'payroll.period', { from: '2026-10-01', to: '2026-10-31', status: 'open' }); s = r.state; const octoberId = r.result.id;
  r = run(s, 'payroll.deliver', { resultId: s.results[0].id, periodId: octoberId }); s = r.state;
  assert.equal(r.result.quantities.paid, 450);
  r = run(s, 'delivery.respond', { id: r.result.id, status: 'accepted', externalReference: 'staging-accepted-1' }); s = r.state;
  const accepted = canonical(s.deliveries[0]), prior = canonical(s.results[0]);
  r = run(s, 'payroll.period', { id: octoberId, from: '2026-10-01', to: '2026-10-31', status: 'closed' }); s = r.state;
  r = run(s, 'correction.request', { punchId: rawId, replacement: { at: '2026-10-05T15:30:00Z', kind: 'out' } }, actor, after); s = r.state;
  r = run(s, 'correction.approve', { id: r.result.id }, reviewer, after); s = r.state;
  r = run(s, 'attendance.calculate', { assignmentKey: s.rosters[0].assignments[0].key }, actor, after); s = r.state;
  assert.equal(r.result.actualMinutes, 420); assert.equal(r.result.previousId, s.results[0].id);
  r = run(s, 'attendance.approve', { id: r.result.id }, reviewer, after); s = r.state;
  r = run(s, 'payroll.period', { from: '2026-11-01', to: '2026-11-30', status: 'open' }); s = r.state; const novemberId = r.result.id;
  r = run(s, 'payroll.deliver', { resultId: s.results.at(-1).id, periodId: novemberId }); s = r.state;
  assert.equal(r.result.quantities.paid, -30); assert.equal(r.result.quantities.missing, 30); assert.deepEqual(r.result.adjustmentOf, [s.deliveries[0].id]);
  assert.equal(canonical(s.deliveries[0]), accepted); assert.equal(canonical(s.results[0]), prior);
  assert.equal(canonical(s.rosters[0].assignments), frozen); assert.equal(s.punches.find(p => p.id === rawId).at, '2026-10-05T16:00:00Z');
  assert.equal(s.corrections[0].status, 'approved'); assert.equal(effectiveRevisions(s.shifts, '2026-10-05')[0].id, shiftId);
});

test('changing active employment to stopped does not resurrect an old revision', () => {
  const s = fixture(); s.employments.push({ ...s.employments[0], version: 2, from: '2026-10-05', status: 'stopped' });
  assert.throws(() => run(s, 'roster.create', { name: 'جدول موقوف', from: '2026-10-05', to: '2026-10-05', employeeIds: ['e1'], policyId: 'policy', policyVersion: 1 }), /ارتباط وظيفي/);
});

test('versioned future definition suspension cannot authorize a new assignment, while historical snapshot remains', () => {
  const s = fixture(); s.shifts.push({ ...s.shifts[0], version: 2, from: '2026-10-05', status: 'stopped' });
  assert.equal(effectiveRevisions(s.shifts, '2026-10-04').find(x => x.id === 'morning').version, 1);
  assert.equal(effectiveRevisions(s.shifts, '2026-10-05').find(x => x.id === 'morning'), undefined);
});

test('two manager approval stages preserve both published rosters until final atomic swap', () => {
  let s = fixture(); s.policies[0].approvalRoles = ['manager', 'hr'];
  let r = run(s, 'roster.create', { name: 'فترتان', from: '2026-10-05', to: '2026-10-05', employeeIds: ['e1', 'e2'], policyId: 'policy', policyVersion: 1 });
  s = r.state; s.rosters[0].assignments = [row(s, 'e1', '2026-10-05', 'short'), row(s, 'e2', '2026-10-05', 'evening')];
  const rosterId = r.result.id, hr = { ...reviewer, id: 'hr-approver', roles: ['hr'] };
  for (const [action, who] of [['submit', reviewer], ['approve', reviewer], ['approve', hr], ['publish', reviewer]]) {
    r = run(s, `roster.${action}`, { rosterId, version: 1 }, who); s = r.state;
  }
  r = run(s, 'request.create', { kind: 'swap', employeeId: 'e1', otherEmployeeId: 'e2', assignmentKey: 'e1:2026-10-05:1', otherAssignmentKey: 'e2:2026-10-05:1' }, employee);
  s = r.state; const requestId = r.result.id;
  s = run(s, 'request.peer', { id: requestId, accept: true }, otherEmployee).state;
  const original = canonical(publishedAssignments(s));
  r = run(s, 'request.approve', { id: requestId }, reviewer); s = r.state;
  assert.equal(r.result.status, 'review'); assert.equal(r.result.managerApprovals.length, 1);
  assert.equal(canonical(publishedAssignments(s)), original);
  r = run(s, 'request.approve', { id: requestId }, hr);
  assert.equal(r.result.status, 'executed'); assert.equal(r.result.managerApprovals.length, 2);
  assert.deepEqual(r.state.rosters.at(-1).approvals.map(a => [a.role, a.actor, a.sourceVersion]), [['manager', reviewer.id, 1], ['hr', hr.id, 1]]);
  assert.equal(r.state.rosters[0].status, 'superseded');
});

test('open-shift manager needs publish scope for the employee being added', () => {
  let s = publishFixture(fixture()); const unchanged = canonical(publishedAssignments(s));
  let r = run(s, 'open.create', { rosterId: s.rosters[0].id, workDate: '2026-10-05', shiftId: 'morning', shiftVersion: 1, siteCode: 'HQ', skill: 'nurse', slots: 1, deadline: '2026-10-04T00:00:00Z' });
  s = r.state; r = run(s, 'request.create', { kind: 'open', employeeId: 'e2', openId: r.result.id }, otherEmployee); s = r.state;
  const narrow = { ...reviewer, grants: [{ actions: ['request_approve'], fields: [] }, { employeeId: 'e1', actions: ['publish'], fields: [] }] };
  assert.throws(() => run(s, 'request.approve', { id: r.result.id }, narrow), /غير مصرح/);
  assert.equal(canonical(publishedAssignments(s)), unchanged); assert.deepEqual(s.openShifts[0].claims, []);
});

test('branch-only read does not expose colleagues raw punches, results or other-branch sites', () => {
  const s = fixture(); s.sites.push({ ...s.sites[0], id: 'site-b', code: 'B-HQ', branch: 'B' });
  s.punches.push(punch('raw-sensitive', '2026-10-05T08:00:00Z', 'in'));
  s.results.push({ id: 'result-sensitive', employeeId: 'e1', workDate: '2026-10-05', status: 'calculated' });
  const colleague = { id: 'branch-reader', grants: [{ branch: 'A', actions: ['read'], fields: [] }] };
  const view = projectState(s, colleague);
  assert.equal(view.employments.length, 2); assert.deepEqual(view.punches, []); assert.deepEqual(view.results, []);
  assert.deepEqual(view.sites.map(site => site.code), ['HQ']);
});

test('historical attendance stays scoped to the employment effective on its work date', () => {
  const s = fixture(); s.employments.push({ ...s.employments[0], version: 2, from: '2026-10-05', branch: 'B' });
  s.results.push({ id: 'before-transfer', employeeId: 'e1', workDate: '2026-10-04' }, { id: 'after-transfer', employeeId: 'e1', workDate: '2026-10-05' });
  assert.equal(employeeScope(s, 'e1', '2026-10-04').branch, 'A'); assert.equal(employeeScope(s, 'e1', '2026-10-05').branch, 'B');
  const scoped = branch => ({ id: 'manager', grants: [{ branch, actions: ['read', 'recalculate'], fields: [] }] });
  assert.deepEqual(projectState(s, scoped('A')).results.map(r => r.id), ['before-transfer']);
  assert.deepEqual(projectState(s, scoped('B')).results.map(r => r.id), ['after-transfer']);
});

test('CSV neutralizes formulas even after leading whitespace while preserving leading zeros', () => {
  const csv = csvExport([{ code: '00104', value: '  =cmd()' }]);
  assert.match(csv, /"00104"/); assert.match(csv, /"'  =cmd\(\)"/);
});

test('night checkout retains the source work date and old-branch punch permission after transfer', () => {
  let s = fixture(); s = publishFixture(s, [row(s, 'e1', '2026-10-05', 'night')]);
  s.employments.push({ ...s.employments[0], version: 2, from: '2026-10-06', branch: 'B' });
  const scan = punch('night-out', '2026-10-06T06:00:00Z', 'out');
  const scoped = branch => ({ id: 'site-device', grants: [{ branch, actions: ['read', 'punch'], fields: [] }] });
  assert.throws(() => run(s, 'punch.ingest', { events: [scan] }, scoped('B'), after), /غير مصرح/);
  const r = run(s, 'punch.ingest', { events: [scan] }, scoped('A'), after);
  assert.equal(r.state.punches[0].workDate, '2026-10-05');
  assert.equal(r.state.punches[0].at, '2026-10-06T06:00:00Z');
});

test('historical attendance approval is unavailable to a newly assigned branch', () => {
  const s = fixture(); s.employments.push({ ...s.employments[0], version: 2, from: '2026-10-05', branch: 'B' });
  s.results.push({ id: 'historical', employeeId: 'e1', workDate: '2026-10-04', assignmentKey: 'old', approval: { status: 'approved' } });
  const scoped = branch => ({ id: 'hr-manager', grants: [{ branch, actions: ['attendance_reopen'], fields: [] }] });
  assert.throws(() => run(s, 'attendance.reopen', { id: 'historical' }, scoped('B')), /غير مصرح/);
  const r = run(s, 'attendance.reopen', { id: 'historical' }, scoped('A'));
  assert.equal(r.state.results[0].approval.status, 'reopened');
});

test('unverified-site scans remain immutable raw evidence until a separately approved correction', () => {
  let s = publishFixture(fixture()); const original = { ...punch('offline-1', '2026-10-05T08:00:00Z', 'in'), siteCode: 'OFFLINE' };
  let r = run(s, 'punch.ingest', { events: [original] }); s = r.state;
  assert.equal(s.punches[0].siteCode, 'OFFLINE'); assert.equal(s.punches[0].siteUnverified, true);
  assert.equal(matchPunches(publishedAssignments(s), s.punches).exceptions[0].code, 'PUNCH_SITE_UNVERIFIED');
  r = run(s, 'correction.request', { punchId: s.punches[0].id, replacement: { siteCode: 'HQ', at: original.at, kind: 'in' } }); s = r.state;
  assert.equal(matchPunches(publishedAssignments(s), s.punches, s.corrections).byAssignment[publishedAssignments(s)[0].key].length, 0);
  s = run(s, 'correction.approve', { id: r.result.id }, reviewer).state;
  assert.equal(matchPunches(publishedAssignments(s), s.punches, s.corrections).byAssignment[publishedAssignments(s)[0].key].length, 1);
  assert.equal(s.punches[0].siteCode, 'OFFLINE');
});

test('recorded break markers and a fixed break subtract the same minutes once', () => {
  const s = fixture(), a = row(s);
  const raw = [punch('in', '2026-10-05T08:00:00Z', 'in'), punch('break-1', '2026-10-05T12:00:00Z', 'break_start'),
    punch('break-2', '2026-10-05T12:30:00Z', 'break_end'), punch('out', '2026-10-05T16:00:00Z', 'out')];
  const actual = calculateAttendance(s, a, matchPunches([a], raw).byAssignment[a.key], after);
  assert.equal(actual.presenceMinutes, 450); assert.equal(actual.actualMinutes, 450); assert.equal(actual.missingMinutes, 0);
});

test('dated policy or shift revision invalidates a previously approved draft before publication', () => {
  let s = fixture(), r = roster(s); s = r.state; s.rosters[0].assignments = [row(s)];
  s = run(s, 'roster.submit', { rosterId: r.result.id, version: 1 }, reviewer).state;
  s = run(s, 'roster.approve', { rosterId: r.result.id, version: 1 }, reviewer).state;
  const approved = canonical(s.rosters[0]);
  const policyChange = structuredClone(s); policyChange.policies.push({ ...s.policies[0], version: 2, from: '2026-10-05', graceMinutes: 1 });
  assert.throws(() => run(policyChange, 'roster.publish', { rosterId: r.result.id, version: 1 }, reviewer), /إصدار السياسة/);
  const shiftChange = structuredClone(s); shiftChange.shifts.push({ ...s.shifts[0], version: 2, from: '2026-10-05', startTime: '09:00' });
  assert.throws(() => run(shiftChange, 'roster.publish', { rosterId: r.result.id, version: 1 }, reviewer), /إصدار الشفت/);
  assert.equal(canonical(s.rosters[0]), approved); assert.equal(publishedAssignments(s).length, 0);
});

test('request manager sees peer details only when authorized for both employees', () => {
  const s = fixture(); s.requests.push({ id: 'peer-request', employeeId: 'e1', otherEmployeeId: 'e2', workDate: '2026-10-05', otherWorkDate: '2026-10-05', createdBy: 'user-e1', status: 'review', reason: 'سبب شخصي' });
  const oneSide = { id: 'manager-only-e1', grants: [{ actions: ['read'], fields: [] }, { employeeId: 'e1', actions: ['request_approve'], fields: [] }] };
  assert.deepEqual(projectState(s, oneSide).requests, []);
  const bothSides = { id: 'manager-both', grants: [{ actions: ['read', 'request_approve'], fields: [] }] };
  assert.equal(projectState(s, bothSides).requests.length, 1);
});

test('old-branch read cannot see a transferred employee new-branch vacancy', () => {
  const s = fixture(); s.sites.push({ ...s.sites[0], id: 'site-b', code: 'B-HQ', branch: 'B' });
  s.employments.push({ ...s.employments[0], version: 2, from: '2026-10-05', branch: 'B', siteCode: 'B-HQ', allowedSites: ['B-HQ'] });
  s.openShifts.push({ id: 'private-vacancy', status: 'open', siteCode: 'B-HQ', workDate: '2026-10-05', skill: 'nurse', claims: [] });
  assert.deepEqual(projectState(s, { id: 'branch-a-reader', grants: [{ branch: 'A', actions: ['read'], fields: [] }] }).openShifts, []);
});

test('night and cost-center reports aggregate published work without fabricating unapproved actual time', () => {
  let s = fixture(); s = publishFixture(s, [row(s, 'e1', '2026-10-05', 'night'), row(s, 'e2', '2026-10-05', 'short')]);
  const nights = reportRows(s, 'night_distribution', '2026-10-05', '2026-10-05');
  assert.deepEqual(nights.map(n => [n.employeeId, n.nights, n.workDates]), [['e1', 1, ['2026-10-05']]]);
  const center = reportRows(s, 'cost_centers', '2026-10-05', '2026-10-05')[0];
  assert.equal(center.headcount, 2); assert.equal(center.nights, 1); assert.equal(center.actualMinutes, null); assert.equal(center.unconfirmedAssignments, 2);
  const assigned = publishedAssignments(s)[0];
  s.results.push({ id: 'approved-night', employeeId: assigned.employeeId, assignmentKey: assigned.key, workDate: assigned.workDate,
    actualMinutes: 480, paidMinutes: 480, approval: { status: 'approved' } });
  const measured = reportRows(s, 'cost_centers', '2026-10-05', '2026-10-05')[0];
  assert.equal(measured.actualMinutes, 480); assert.equal(measured.recordedAssignments, 1); assert.equal(measured.unconfirmedAssignments, 1);
  assert.equal(reportRows(s, 'planned_actual', '2026-10-05', '2026-10-05').find(r => r.employeeId === 'e2').actualMinutes, null);
});

test('payroll action alone does not expose cost-center fields in delivery reads', () => {
  const s = fixture(); s.deliveries.push({ id: 'cost-private', employeeId: 'e1', workDate: '2026-10-05', status: 'pending', costCenter: 'CC1' });
  const actorWithoutCost = { id: 'payroll-read', grants: [{ branch: 'A', actions: ['read', 'payroll'], fields: [] }] };
  const view = projectState(s, actorWithoutCost);
  assert.equal(view.deliveries.length, 1); assert.equal('costCenter' in view.deliveries[0], false);
  const withCost = { ...actorWithoutCost, grants: [{ branch: 'A', actions: ['read', 'payroll'], fields: ['cost'] }] };
  assert.equal(projectState(s, withCost).deliveries[0].costCenter, 'CC1');
});
