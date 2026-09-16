import { MINUTE, requireRule, instant, interval, union, intersect, subtract, minutes, splitLocalDays, zonedInstant } from './time.mjs';
import { requiredIntervals, approvedLeaveIntervals } from './planning.mjs';

export const ENGINE_VERSION = 'm08/1.0.0';
export function grace(raw, policy) { return raw <= policy.graceMinutes ? 0 : policy.graceMode === 'threshold' ? raw : raw - policy.graceMinutes; }
export function overtimeEligible(raw, policy) { return raw < policy.overtimeThreshold ? 0 : Math.min(policy.overtimeCap, policy.overtimeMode === 'threshold' ? raw : raw - policy.overtimeThreshold); }

/** Matching operates across neighboring published periods, not a calendar day's first/last scan. */
export function matchPunches(assignments, raw, corrections = []) {
  const valid = corrections.filter(c => c.status === 'approved');
  const events = raw.map(p => {
    const edits = valid.filter(c => c.punchId === p.id).sort((a, b) => a.sequence - b.sequence);
    const c = edits.at(-1);
    return c ? { ...p, ...(c.replacement ?? {}), excluded: c.exclude === true, correctionId: c.id, siteCorrected: Boolean(c.replacement?.siteCode), assignmentKey: c.assignmentKey || p.assignmentKey } : { ...p };
  });
  const byAssignment = Object.fromEntries(assignments.map(a => [a.key, []])), exceptions = [], sourceKeys = new Set();
  for (const event of events.sort((a, b) => instant(a.at) - instant(b.at) || a.id.localeCompare(b.id))) {
    if (event.excluded) continue;
    if (event.siteUnverified && !event.siteCorrected) { exceptions.push({ code: 'PUNCH_SITE_UNVERIFIED', punchId: event.id, employeeId: event.employeeId }); continue; }
    const sourceKey = `${event.source}:${event.sourceEventId}`;
    if (sourceKeys.has(sourceKey)) { exceptions.push({ code: 'DUPLICATE_PUNCH', punchId: event.id }); continue; }
    sourceKeys.add(sourceKey);
    let candidates = assignments.filter(a => a.employeeId === event.employeeId && a.dayType === 'WORK' &&
      (!event.siteCode || event.siteCode === a.siteCode) &&
      instant(event.at) >= instant(a.start) - a.shift.windowBefore * MINUTE && instant(event.at) <= instant(a.end) + a.shift.windowAfter * MINUTE);
    if (event.assignmentKey) candidates = candidates.filter(a => a.key === event.assignmentKey);
    if (candidates.length !== 1) { exceptions.push({ code: candidates.length ? 'PUNCH_AMBIGUOUS' : 'PUNCH_OUTSIDE_WINDOW', punchId: event.id, employeeId: event.employeeId }); continue; }
    byAssignment[candidates[0].key].push(event);
  }
  return { byAssignment, exceptions };
}
function pairs(events) {
  let entry = null; const spans = [], issues = [];
  for (const p of events) {
    const kind = p.kind === 'break_end' ? 'in' : p.kind === 'break_start' ? 'out' : p.kind;
    if (kind === 'in') {
      if (entry) issues.push({ code: 'MISSING_OUT', punchId: entry.id });
      entry = p;
    } else if (kind === 'out') {
      if (!entry) issues.push({ code: 'MISSING_IN', punchId: p.id });
      else if (instant(p.at) > instant(entry.at)) { spans.push(interval(entry.at, p.at)); entry = null; }
      else issues.push({ code: 'PUNCH_ORDER', punchId: p.id });
    } else issues.push({ code: 'PUNCH_KIND', punchId: p.id });
  }
  if (entry) issues.push({ code: 'MISSING_OUT', punchId: entry.id });
  return { spans: union(spans), issues };
}
export function calculateAttendance(state, assignment, events, now) {
  const sources = { engine: ENGINE_VERSION, assignmentKey: assignment?.key ?? null, rosterId: assignment?.rosterId ?? null,
    rosterVersion: assignment?.rosterVersion ?? null, shiftId: assignment?.shiftId ?? null, shiftVersion: assignment?.shiftVersion ?? null,
    policyId: assignment?.policyId ?? null, policyVersion: assignment?.policyVersion ?? null,
    punches: events.map(p => p.id).sort(), corrections: events.map(p => p.correctionId).filter(Boolean).sort(),
    leaves: state.leaves.filter(l => l.employeeId === assignment?.employeeId && l.status === 'approved').map(l => ({ id: l.id, version: l.version })).sort((a, b) => a.id.localeCompare(b.id)) };
  if (!assignment || assignment.dayType !== 'WORK') return { status: events.length ? 'unscheduled_presence' : 'unscheduled', sources, actualMinutes: null, presenceMinutes: null, paidMinutes: null, missingMinutes: null, issues: events.length ? [{ code: 'UNSCHEDULED_PRESENCE' }] : [] };
  const a = assignment, policy = a.policy, span = interval(a.start, a.end), breaks = a.breaks.map(b => interval(b.start, b.end));
  const expected = requiredIntervals(a), leave = intersect(expected, approvedLeaveIntervals(state, a.employeeId)), paidLeave = intersect(expected, approvedLeaveIntervals(state, a.employeeId, true));
  const obligation = subtract(expected, leave), required = a.shift.type === 'flex' ? a.shift.requiredMinutes : minutes(expected);
  const base = { sources, employeeId: a.employeeId, employmentId: a.employmentId, workDate: a.workDate, assignmentKey: a.key,
    branch: a.branch, siteCode: a.siteCode, costCenter: a.costCenter, timezone: a.timezone,
    requiredMinutes: required, excusedMinutes: minutes(leave), plannedOvertimeMinutes: a.plannedOvertimeMinutes ?? 0 };
  if (a.shift.punchMode !== 'pairs') {
    const present = events.length > 0;
    return { ...base, status: present ? 'single_punch' : 'pending', presenceEvidence: present, presenceMinutes: null, actualMinutes: null,
      standardPaidMinutes: present && a.shift.punchMode === 'standard' ? required : 0, paidMinutes: present && a.shift.punchMode === 'standard' ? required : minutes(paidLeave),
      missingMinutes: null, rawLateMinutes: null, lateMinutes: null, rawEarlyMinutes: null, earlyMinutes: null,
      observedOvertimeMinutes: 0, eligibleOvertimeMinutes: 0, approvedOvertimeMinutes: 0, payableSegments: [],
      issues: present ? [] : [{ code: 'MISSING_SINGLE_PUNCH' }] };
  }
  const parsed = pairs(events), presence = parsed.spans;
  const deadline = span[1] + (a.shift.windowAfter + policy.arrivalLagMinutes) * MINUTE;
  const complete = instant(now) >= deadline;
  const issues = [...parsed.issues];
  if (!complete) issues.push({ code: 'SOURCE_WINDOW_OPEN' });
  if (!events.length && !complete) issues.push({ code: 'PUNCHES_PENDING' });
  // Absence only becomes reviewable after source arrival cutoff. Incomplete pairs never invent hours.
  const unresolved = parsed.issues.length > 0;
  const workPresence = subtract(presence, breaks);
  let work = intersect(workPresence, [span]), expectedCompletion = a.end, lateRequired = obligation, flexMissing = null;
  if (a.shift.type === 'flex') {
    const latest = instant(zonedInstant(a.workDate, a.shift.flexLatestStart, a.timezone, a.shift.disambiguation).at);
    const first = Math.max(span[0], presence[0]?.[0] ?? span[0]);
    expectedCompletion = new Date(first + (required + minutes(breaks)) * MINUTE).toISOString();
    const core = interval(zonedInstant(a.workDate, a.shift.coreStart, a.timezone).at, zonedInstant(a.workDate, a.shift.coreEnd, a.timezone).at);
    const missingCore = minutes(subtract(subtract([core], breaks), union([...presence, ...leave])));
    if (missingCore > 0 && complete && !unresolved) issues.push({ code: 'FLEX_CORE_MISSING', minutes: missingCore });
    lateRequired = [[latest, Math.max(latest, presence[0]?.[0] ?? latest)]];
    flexMissing = Math.max(0, required - minutes(work) - minutes(leave));
  }
  const after = policy.observeAfter ? intersect(workPresence, [[span[1], span[1] + a.shift.windowAfter * MINUTE]]) : [];
  // Early presence alone is not work evidence. Explicit approved planned ranges are required.
  const planned = (a.overtimeRanges ?? []).map(r => interval(r.start, r.end));
  const plannedOutside = intersect(subtract(workPresence, [span]), planned);
  const actual = union([...work, ...after, ...plannedOutside]);
  const potentialOT = subtract(actual, [span]);
  const observed = minutes(potentialOT);
  const eligibleEvidence = policy.requireOvertimePlan ? intersect(potentialOT, planned) : potentialOT;
  const eligible = overtimeEligible(minutes(eligibleEvidence), policy);
  const missing = subtract(obligation, work), rawMissing = flexMissing ?? minutes(missing);
  const first = presence[0]?.[0] ?? span[1], last = presence.at(-1)?.[1] ?? span[0];
  const rawLate = minutes(intersect(lateRequired, [[span[0], first]]));
  const rawEarly = a.shift.type === 'flex' ? 0 : minutes(intersect(obligation, [[last, span[1]]]));
  const late = grace(rawLate, policy), early = grace(rawEarly, policy);
  const waived = policy.graceWaivesMissing ? Math.min(rawMissing, rawLate - late + rawEarly - early) : 0;
  const paidBreaks = intersect(presence, a.breaks.filter(b => b.paid).map(b => interval(b.start, b.end)));
  // Time categories are disjoint; leave/presence/break overlap can never produce double payment.
  const paid = union([...work, ...paidBreaks, ...paidLeave]);
  const finalMissing = Math.max(0, rawMissing - waived);
  return { ...base, status: unresolved ? 'incomplete' : !complete ? 'pending' : !events.length && minutes(obligation) > 0 ? 'absence_review' : 'calculated',
    presenceMinutes: minutes(presence), actualMinutes: unresolved ? null : minutes(actual), workWithinPlanMinutes: unresolved ? null : minutes(work),
    paidMinutes: unresolved ? null : Math.min(required + minutes(paidBreaks), minutes(paid) + waived), standardPaidMinutes: 0,
    rawMissingMinutes: unresolved ? null : rawMissing, graceWaivedMinutes: waived, missingMinutes: unresolved ? null : finalMissing,
    rawLateMinutes: rawLate, lateMinutes: late, rawEarlyMinutes: rawEarly, earlyMinutes: early,
    // Deduct the missing interval once; late/early are explanatory measures, not additive deductions.
    deductionMinutes: unresolved ? null : finalMissing, expectedCompletion,
    observedOvertimeMinutes: unresolved ? 0 : observed, eligibleOvertimeMinutes: unresolved ? 0 : eligible, approvedOvertimeMinutes: 0,
    payableSegments: splitLocalDays(paid, a.timezone, policy.holidays ?? []), overtimeSegments: splitLocalDays(potentialOT, a.timezone, policy.holidays ?? []),
    issues };
}
/** Stable canonicalization for source identity, command retries and deterministic recomputation. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function payrollQuantities(result) {
  requireRule(result.approval?.status === 'approved', 'ATTENDANCE_APPROVAL', 'الحضور غير معتمد');
  return { paid: result.paidMinutes ?? 0, missing: result.deductionMinutes ?? 0, overtime: result.approvedOvertimeMinutes ?? 0, standard: result.standardPaidMinutes ?? 0 };
}
export function payrollDelta(result, delivered) {
  const quantities = payrollQuantities(result);
  const accepted = delivered.filter(d => ['accepted', 'pending', 'sent'].includes(d.status));
  const totals = { paid: 0, missing: 0, overtime: 0, standard: 0 };
  accepted.forEach(d => Object.keys(totals).forEach(k => { totals[k] += d.quantities[k] ?? 0; }));
  return Object.fromEntries(Object.entries(quantities).map(([k, n]) => [k, n - totals[k]]));
}
