import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, actor, reviewer, employee, otherEmployee, now, after, run, roster, row, publishFixture, punch } from './fixtures/m08.mjs';
import { execute } from '../src/lib/m08/engine.mjs';
import { validateRoster, publishedAssignments, generate, previewImport, coverage, assignmentFromShift, cycleDay, employmentAt } from '../src/lib/m08/planning.mjs';
import { calculateAttendance, matchPunches, grace, canonical, payrollDelta } from '../src/lib/m08/attendance.mjs';
import { zonedInstant, interval, minutes, splitLocalDays } from '../src/lib/m08/time.mjs';
import { projectState, allowed } from '../src/lib/m08/access.mjs';
const calculate = (s, a, events) => calculateAttendance(s, a, events, after);
const events = (start = '08:00', end = '16:00') => [punch('in', `2026-10-05T${start}:00Z`, 'in'), ...(end ? [punch('out', `2026-10-05T${end}:00Z`, 'out')] : [])];
const has = (issues, code) => issues.some(i => i.code === code);

test('AC01 definition → template → pattern → binding → generated roster', () => {
  const s = fixture(), r = roster(s, { from: '2026-10-01', to: '2026-10-03' });
  const generated = generate(s, r.result, ['e1']); assert.deepEqual(generated.map(a => a.dayType), ['WORK', 'OFF', 'OFF']); assert.equal(generated[0].shiftVersion, 1);
});
test('AC02 draft changes leave employee schedule and attendance source unchanged', () => {
  const s = publishFixture(), old = canonical(publishedAssignments(s));
  const revised = run(s, 'roster.revise', { rosterId: s.rosters[0].id, version: 1 }).state;
  revised.rosters[1].assignments[0].start = '2026-10-05T09:00:00Z'; assert.equal(canonical(publishedAssignments(revised)), old);
});
test('AC03 approved revision is not the active roster until publication', () => {
  let s = publishFixture(), r = run(s, 'roster.revise', { rosterId: s.rosters[0].id, version: 1 }); s = r.state;
  for (const action of ['submit', 'approve']) { r = run(s, `roster.${action}`, { rosterId: r.result.id, version: 1 }, reviewer); s = r.state; }
  assert.equal(publishedAssignments(s)[0].rosterId, s.rosters[0].id);
});
test('AC04 publication activates the complete snapshot and one notification per employee', () => {
  const s = publishFixture(); assert.equal(s.rosters[0].status, 'published'); assert.equal(s.notifications.length, 1);
  assert.throws(() => run(s, 'roster.publish', { rosterId: s.rosters[0].id, version: 1 }), /اعتماد/); assert.equal(s.notifications.length, 1);
});
test('AC05 third work period is rejected under a two-period policy', () => {
  const s = fixture(), r = roster(s).result; r.assignments = [row(s, 'e1', r.from, 'short', 1), row(s, 'e1', r.from, 'evening', 2), row(s, 'e1', r.from, 'night', 3)];
  assert.ok(has(validateRoster(s, r), 'PERIOD_LIMIT'));
});
test('AC06 overnight checkout belongs to the starting work date', () => {
  const s = fixture(), a = row(s, 'e1', '2026-10-05', 'night'), raw = [punch('in', '2026-10-05T21:55:00Z', 'in'), punch('out', '2026-10-06T06:00:00Z', 'out')];
  const matched = matchPunches([a], raw), r = calculate(s, a, matched.byAssignment[a.key]); assert.equal(r.workDate, '2026-10-05'); assert.equal(r.actualMinutes, 480); assert.equal(r.presenceMinutes, 485);
});
test('AC07 split periods exclude the inter-period gap and retain second-period lateness', () => {
  const s = fixture(), a = row(s, 'e1', '2026-10-05', 'short'), b = row(s, 'e1', '2026-10-05', 'evening', 2);
  const x = calculate(s, a, events('08:00', '12:00')), y = calculate(s, b, events('17:15', '21:00'));
  assert.equal(x.actualMinutes + y.actualMinutes, 465); assert.equal(y.lateMinutes, 15);
});
test('AC08 overlap from a different published roster blocks assignment', () => {
  const s = publishFixture(), r = roster(s).result; r.assignments = [row(s)]; assert.ok(has(validateRoster(s, r), 'SHIFT_OVERLAP'));
});
test('AC09 insufficient rest is detected across a month boundary', () => {
  const s = fixture(); s.shifts[3].endTime = '23:00';
  const previous = roster(s, { from: '2026-09-30', to: '2026-09-30' }).result;
  previous.assignments = [row(s, 'e1', '2026-09-30', 'evening')]; previous.status = 'published'; s.rosters.push(previous);
  const r = roster(s, { from: '2026-10-01', to: '2026-10-01' }).result; r.assignments = [row(s, 'e1', '2026-10-01', 'morning')];
  assert.ok(has(validateRoster(s, r), 'REST_GAP'));
});
test('AC10 both grace modes preserve raw minutes and independent makeup rule', () => {
  const s = fixture(), a = row(s); assert.equal(calculate(s, a, events('08:07')).actualMinutes, 443);
  assert.equal(calculate(s, a, events('08:07')).missingMinutes, 7); assert.equal(calculate(s, a, events('08:18')).lateMinutes, 18);
  a.policy.graceMode = 'excess'; assert.equal(calculate(s, a, events('08:18')).lateMinutes, 8);
  a.policy.graceWaivesMissing = true; assert.equal(calculate(s, a, events('08:18')).missingMinutes, 8);
});
test('AC11 missing checkout has no invented work, payment or final deduction', () => {
  const s = fixture(), r = calculate(s, row(s), events('08:00', null)); assert.equal(r.status, 'incomplete'); assert.equal(r.actualMinutes, null); assert.equal(r.deductionMinutes, null);
});
test('AC12 flexible start at 09:30 is on time with 18:00 completion', () => {
  const s = fixture(); Object.assign(s.shifts[0], { type: 'flex', endTime: '20:00', flexLatestStart: '10:00', coreStart: '11:00', coreEnd: '14:00', requiredMinutes: 480 });
  const a = row(s), r = calculate(s, a, events('09:30', '17:00')); assert.equal(r.lateMinutes, 0); assert.equal(r.missingMinutes, 60); assert.equal(r.expectedCompletion, '2026-10-05T18:00:00.000Z');
});
test('AC13 morning permission exempts only the approved hours', () => {
  const s = fixture(); s.leaves.push({ id: 'l', employeeId: 'e1', start: '2026-10-05T08:00:00Z', end: '2026-10-05T10:00:00Z', status: 'approved', paid: true, version: 1 });
  const r = calculate(s, row(s), events('10:00')); assert.equal(r.actualMinutes, 330); assert.equal(r.excusedMinutes, 120); assert.equal(r.lateMinutes, 0); assert.equal(r.paidMinutes, 450);
});
test('AC14 approved leave conflicting with draft blocks publication', () => {
  const s = fixture(); s.leaves.push({ employeeId: 'e1', start: '2026-10-05T08:00:00Z', end: '2026-10-05T16:00:00Z', status: 'approved' });
  const r = roster(s).result; r.assignments = [row(s)]; assert.ok(has(validateRoster(s, r), 'LEAVE_CONFLICT'));
});
test('AC15 leave after publication preserves assignment and reduces obligation/coverage', () => {
  let s = publishFixture(), before = canonical(s.rosters[0].assignments);
  let r = run(s, 'leave.save', { value: { employeeId: 'e1', start: '2026-10-05T08:00:00Z', end: '2026-10-05T16:00:00Z', paid: true, source: 'approved-intake', sourceId: 'L1', sourceVersion: 1 } });
  s = run(r.state, 'leave.approve', { id: r.result.id }, reviewer).state;
  assert.equal(canonical(s.rosters[0].assignments), before); assert.equal(calculate(s, publishedAssignments(s)[0], []).missingMinutes, 0); assert.equal(s.deliveries[0].kind, 'leave_balance');
});
test('AC16 rotating cycle continues across months', () => {
  const s = fixture(); assert.equal(cycleDay(s.patterns[0], s.bindings[0], '2026-11-01', s), 1);
});
test('AC17 seasonal return supports both continued and paused base cycle', () => {
  const s = fixture(); s.bindings.push({ ...s.bindings[0], id: 'season', scope: 'seasonal', from: '2026-10-02', to: '2026-10-03', returnMode: 'continue' });
  assert.equal(cycleDay(s.patterns[0], s.bindings[0], '2026-10-04', s), 0);
  s.bindings[2].returnMode = 'pause'; assert.equal(cycleDay(s.patterns[0], s.bindings[0], '2026-10-04', s), 1);
});
test('AC18 effective employment transfer invalidates future snapshots, preserves past', () => {
  const s = fixture(), r = roster(s).result; r.assignments = [row(s)];
  s.employments.push({ ...s.employments[0], version: 2, from: '2026-10-05', branch: 'B' });
  assert.ok(has(validateRoster(s, r), 'EMPLOYMENT_CHANGED')); assert.equal(employmentAt(s, 'e1', '2026-10-04').branch, 'A');
});
test('AC19 CSV preview preserves leading zeros and reports duplicate and unknown rows', () => {
  const s = fixture(), r = roster(s).result;
  const good = { employee_code: '00104', work_date: '2026-10-05', day_type: 'WORK', period_no: '1', shift_code: 'AM', site_code: 'HQ', cost_center_code: 'CC1', operation: 'ADD', reason: '' };
  const p = previewImport(s, r, [good, good, { ...good, employee_code: 'not-known' }], { id: 'policy', version: 1 });
  assert.ok(p.errors.some(e => e.row === 3 && e.code === 'DUPLICATE')); assert.ok(p.errors.some(e => e.row === 4 && e.column === 'employee_code')); assert.equal(p.assignments[0].employeeCode, '00104');
});
test('AC20 source retries do not duplicate raw punches or permit payload replacement', () => {
  const s = fixture(), input = { events: events() }; const a = run(s, 'punch.ingest', input); const b = run(a.state, 'punch.ingest', input);
  assert.equal(b.state.punches.length, 2); input.events[0].at = '2026-10-05T09:00:00Z'; assert.throws(() => run(b.state, 'punch.ingest', input), /بيانات مختلفة/);
});
test('AC21 peer acceptance then manager atomically swaps both employees', () => {
  const s = fixture(); let state = publishFixture(s, [row(s, 'e1', '2026-10-05', 'short'), row(s, 'e2', '2026-10-05', 'evening')]);
  let r = run(state, 'request.create', { kind: 'swap', employeeId: 'e1', otherEmployeeId: 'e2', assignmentKey: 'e1:2026-10-05:1', otherAssignmentKey: 'e2:2026-10-05:1' }, employee);
  r = run(r.state, 'request.peer', { id: r.result.id, accept: true }, otherEmployee); const original = canonical(publishedAssignments(r.state));
  assert.equal(original, canonical(publishedAssignments(state))); r = run(r.state, 'request.approve', { id: r.result.id }, reviewer);
  assert.equal(r.result.status, 'executed'); assert.equal(publishedAssignments(r.state).find(a => a.employeeId === 'e1').shift.code, 'B');
});
test('AC22 new leave before swap approval stops both sides without partial change', () => {
  const s = fixture(); let state = publishFixture(s, [row(s, 'e1', '2026-10-05', 'short'), row(s, 'e2', '2026-10-05', 'evening')]);
  let r = run(state, 'request.create', { kind: 'swap', employeeId: 'e1', otherEmployeeId: 'e2', assignmentKey: 'e1:2026-10-05:1', otherAssignmentKey: 'e2:2026-10-05:1' }, employee);
  r = run(r.state, 'request.peer', { id: r.result.id, accept: true }, otherEmployee); state = r.state;
  state.leaves.push({ employeeId: 'e1', status: 'approved', start: '2026-10-05T17:00:00Z', end: '2026-10-05T21:00:00Z' }); const original = canonical(state);
  assert.throws(() => run(state, 'request.approve', { id: r.result.id }, reviewer), /إجازة/); assert.equal(canonical(state), original);
});
test('AC23 last open slot cannot be awarded to two claims', () => {
  const s = fixture(); let state = publishFixture(s); let r = run(state, 'open.create', { rosterId: state.rosters[0].id, workDate: '2026-10-05', shiftId: 'morning', shiftVersion: 1, siteCode: 'HQ', skill: 'nurse', slots: 1, deadline: '2026-10-04T00:00:00Z' });
  const o = r.result; state = r.state;
  r = run(state, 'request.create', { kind: 'open', employeeId: 'e2', openId: o.id }, otherEmployee); const requestId = r.result.id;
  state = run(r.state, 'request.approve', { id: requestId }, reviewer).state;
  assert.equal(state.openShifts[0].claims.length, 1); assert.throws(() => run(state, 'request.create', { kind: 'open', employeeId: 'e1', openId: o.id }, employee), /مغلق/);
});
test('AC24 stale roster edit is rejected without modifying the previous state', () => {
  const s = roster(fixture()).state; s.rosters[0].version = 2; const before = canonical(s);
  assert.throws(() => run(s, 'roster.remove', { rosterId: s.rosters[0].id, version: 1, keys: [] }), /تغيرت النسخة/); assert.equal(canonical(s), before);
});
test('AC25 active shift edit creates a new version without altering published snapshots', () => {
  const s = publishFixture(), old = canonical(publishedAssignments(s)); const value = { ...s.shifts[0], startTime: '09:00', requiredMinutes: 390 };
  const result = run(s, 'definition.save', { kind: 'shifts', value, expectedVersion: 1 }); assert.equal(result.result.version, 2); assert.equal(canonical(publishedAssignments(result.state)), old);
});
test('AC26 correction before payroll close delivers the delta, not full quantity twice', () => {
  const r = { approval: { status: 'approved' }, paidMinutes: 480, deductionMinutes: 0, approvedOvertimeMinutes: 45, standardPaidMinutes: 0 };
  assert.equal(payrollDelta(r, [{ status: 'accepted', quantities: { paid: 480, missing: 0, overtime: 30, standard: 0 } }]).overtime, 15);
});
test('AC27 payroll closed period cannot reopen attendance; prior result remains immutable', () => {
  const s = fixture(); s.results.push({ id: 'r', employeeId: 'e1', assignmentKey: 'a', workDate: '2026-10-05', approval: { status: 'approved' } }); s.payrollPeriods.push({ id: 'p', from: '2026-10-01', to: '2026-10-31', status: 'closed' });
  assert.throws(() => run(s, 'attendance.reopen', { id: 'r' }), /مقفلة/); assert.equal(s.results[0].approval.status, 'approved');
});
test('AC28 early presence is neither automatic actual work nor approved overtime', () => {
  const s = fixture(), r = calculate(s, row(s), events('07:40')); assert.equal(r.presenceMinutes, 500); assert.equal(r.actualMinutes, 450); assert.equal(r.eligibleOvertimeMinutes, 0); assert.equal(r.approvedOvertimeMinutes, 0);
});
test('AC29 overtime interval union prevents double counting overlapping awards', () => {
  const s = fixture(), a = row(s); a.overtimeRanges = [{ start: '2026-10-05T16:00:00Z', end: '2026-10-05T17:00:00Z' }, { start: '2026-10-05T16:30:00Z', end: '2026-10-05T17:00:00Z' }];
  const r = calculate(s, a, events('08:00', '17:00')); assert.equal(r.observedOvertimeMinutes, 60); assert.equal(r.actualMinutes, 510);
});
test('AC30 month/holiday split retains one interval and distinct local-day quantities', () => {
  const segments = splitLocalDays([interval('2026-10-31T22:00:00Z', '2026-11-01T06:00:00Z')], 'UTC', ['2026-11-01']);
  assert.deepEqual(segments.map(s => [s.month, s.holiday, s.minutes]), [['2026-10', false, 120], ['2026-11', true, 360]]);
});
test('AC31 DST gaps reject and repeated times require explicit offset choice', () => {
  assert.throws(() => zonedInstant('2026-03-08', '02:30', 'America/New_York'), /غير موجود/);
  assert.throws(() => zonedInstant('2026-11-01', '01:30', 'America/New_York'), /مكرر/);
  const a = zonedInstant('2026-11-01', '01:30', 'America/New_York', 'earlier'), b = zonedInstant('2026-11-01', '01:30', 'America/New_York', 'later');
  assert.equal((Date.parse(b.at) - Date.parse(a.at)) / 60000, 60);
  assert.equal(minutes([interval(zonedInstant('2026-10-31', '22:00', 'America/New_York').at, zonedInstant('2026-11-01', '06:00', 'America/New_York').at)]), 540);
});
test('AC32 a punch in two windows is an exception and never consumed twice', () => {
  const s = fixture(), a = row(s, 'e1', '2026-10-05', 'short'), b = row(s, 'e1', '2026-10-05', 'evening', 2); a.shift.windowAfter = 360; b.shift.windowBefore = 360;
  const matched = matchPunches([a, b], [punch('p', '2026-10-05T14:00:00Z', 'in')]); assert.equal(matched.exceptions[0].code, 'PUNCH_AMBIGUOUS'); assert.equal(Object.values(matched.byAssignment).flat().length, 0);
});
test('AC33 no roster and no punches is unscheduled, never absence', () => { const r = calculate(fixture(), null, []); assert.equal(r.status, 'unscheduled'); assert.equal(r.missingMinutes, null); });
test('AC34 recorded break plus fixed break is deducted once', () => {
  const s = fixture(), r = calculate(s, row(s), [punch('1', '2026-10-05T08:00:00Z', 'in'), punch('2', '2026-10-05T12:00:00Z', 'out'), punch('3', '2026-10-05T12:30:00Z', 'in'), punch('4', '2026-10-05T16:00:00Z', 'out')]);
  assert.equal(r.actualMinutes, 450); assert.equal(r.missingMinutes, 0);
});
test('AC35 single punch separates presence evidence from standard paid minutes', () => {
  const s = fixture(), a = row(s); a.shift.punchMode = 'presence'; let r = calculate(s, a, events('08:00', null)); assert.equal(r.actualMinutes, null); assert.equal(r.standardPaidMinutes, 0);
  a.shift.punchMode = 'standard'; r = calculate(s, a, events('08:00', null)); assert.equal(r.standardPaidMinutes, 450); assert.equal(r.eligibleOvertimeMinutes, 0);
});
test('AC36 one multi-skilled employee cannot fill two simultaneous required roles', () => {
  const s = fixture(); s.demands = ['nurse', 'driver'].map((skill, i) => ({ id: String(i), skill, siteCode: 'HQ', start: '2026-10-05T08:00:00Z', end: '2026-10-05T09:00:00Z', minimum: 1, target: 1, maximum: 1 }));
  const c = coverage(s, [row(s)]); assert.equal(c.coveredMinutes, 60); assert.equal(c.requiredMinutes, 120);
});
test('AC37 morning surplus never hides night shortage', () => {
  const s = fixture(); s.demands = [{ id: 'morning', siteCode: 'HQ', start: '2026-10-05T08:00:00Z', end: '2026-10-05T09:00:00Z', minimum: 1, target: 1, maximum: 1 }, { id: 'night', siteCode: 'HQ', start: '2026-10-05T22:00:00Z', end: '2026-10-05T23:00:00Z', minimum: 1, target: 1, maximum: 1 }];
  assert.equal(coverage(s, [row(s, 'e1'), row(s, 'e2')]).ratio, 50);
});
test('AC38 notification failure/retry preserves successful publication', () => {
  const s = publishFixture(); let r = run(s, 'notification.respond', { id: s.notifications[0].id, status: 'failed' });
  r = run(r.state, 'notification.retry', { id: s.notifications[0].id }); assert.equal(r.state.rosters[0].status, 'published'); assert.equal(r.state.notifications.length, 1); assert.equal(r.state.notifications[0].attempts, 1);
});
test('AC39 other-branch permissions reject mutations and redact drafts/costs/reasons', () => {
  const s = publishFixture(), outsider = { id: 'outsider', roles: ['planner'], grants: [{ branch: 'B', actions: ['read', 'draft', 'import', 'export'] }] };
  assert.equal(projectState(s, outsider).rosters.length, 0); assert.throws(() => run(s, 'roster.import', { rosterId: s.rosters[0].id, version: 1, rows: [] }, outsider), /غير مصرح/);
  assert.equal(projectState(s, employee).rosters[0].assignments[0].costCenter, undefined); assert.equal(allowed(outsider, 'export', s.employments[0]), false);
});
test('AC40 same sources and policy versions produce identical calculation and references', () => {
  const s = fixture(), a = row(s); assert.equal(canonical(calculate(s, a, events())), canonical(calculate(s, a, events())));
});
