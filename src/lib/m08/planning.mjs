import { DAY, MINUTE, RuleError, requireRule, date, dates, addDays, clock, zonedInstant, interval, overlap, union, subtract, intersect, minutes } from './time.mjs';

export const PRIORITIES = Object.freeze({ override: 700, employee: 600, seasonal: 500, team: 400, department: 300, branch: 200, company: 100 });
export const effective = (x, day) => x.status === 'active' && x.from <= day && (!x.to || x.to >= day);
export const latest = (items, id) => items.filter(x => x.id === id).sort((a, b) => b.version - a.version)[0];
export function effectiveRevisions(items, day) {
  const begun = items.filter(x => x.from <= day);
  return [...new Set(begun.map(x => x.id))].map(id => latest(begun, id)).filter(x => effective(x, day));
}
export function atVersion(items, id, version) { const x = items.find(x => x.id === id && x.version === version); requireRule(x, 'REFERENCE', 'الإصدار المرجعي غير موجود'); return x; }
export function activeVersion(items, code, day) {
  const matches = effectiveRevisions(items, day).filter(x => x.code === code).sort((a, b) => b.version - a.version);
  requireRule(matches.length, 'INACTIVE', `الرمز ${code} غير ساري في ${day}`);
  return matches[0];
}
export function employmentAt(state, employeeId, day) {
  const candidates = effectiveRevisions(state.employments, day).filter(x => x.employeeId === employeeId);
  const ids = [...new Set(candidates.map(x => x.id))];
  requireRule(ids.length === 1, 'EMPLOYMENT', `لا يوجد ارتباط وظيفي واحد ساري للموظف في ${day}`, { employeeId, day });
  return candidates.sort((a, b) => b.version - a.version)[0];
}
export function validateDefinition(kind, input) {
  requireRule(input && typeof input === 'object', 'INPUT', 'البيانات غير صحيحة');
  requireRule(/^[A-Za-z0-9_-]{1,40}$/.test(input.code ?? ''), 'CODE', 'الرمز مطلوب ويحتوي على حروف لاتينية أو أرقام أو شرطة');
  requireRule(typeof input.nameAr === 'string' && input.nameAr.trim().length >= 2 && typeof input.nameEn === 'string' && input.nameEn.trim().length >= 2, 'NAME', 'الاسم العربي والإنجليزي مطلوبان');
  date(input.from); if (input.to) requireRule(date(input.to) >= input.from, 'EFFECTIVE', 'نهاية السريان قبل بدايته');
  requireRule(['draft', 'active', 'stopped'].includes(input.status), 'STATUS', 'حالة التعريف غير صحيحة');
  if (kind === 'shifts') {
    requireRule(['fixed', 'night', 'flex', 'split', 'seasonal'].includes(input.type), 'SHIFT_TYPE', 'نوع الشفت غير صحيح');
    const start = clock(input.startTime), end = clock(input.endTime) + Number(input.endDay) * 1440;
    requireRule([0, 1].includes(input.endDay) && end > start && end - start <= 1440, 'SHIFT_TIME', 'وقت الشفت أو إزاحة النهاية غير صحيحة');
    zonedInstant('2026-02-02', '12:00', input.timezone);
    requireRule(Number.isInteger(input.requiredMinutes) && input.requiredMinutes > 0 && input.requiredMinutes <= end - start, 'REQUIRED', 'دقائق العمل المطلوبة غير صحيحة');
    requireRule(['pairs', 'presence', 'standard'].includes(input.punchMode), 'PUNCH_MODE', 'حدد وضع البصمة');
    for (const key of ['windowBefore', 'windowAfter']) requireRule(Number.isInteger(input[key]) && input[key] >= 0 && input[key] <= 1440, 'WINDOW', 'نافذة الربط غير صحيحة');
    const breaks = (input.breaks ?? []).map(b => {
      requireRule(Number.isInteger(b.start) && Number.isInteger(b.end) && b.start >= 0 && b.end > b.start && b.end <= end - start && typeof b.paid === 'boolean', 'BREAK', 'الاستراحة يجب أن تكون داخل الشفت وبنوع دفع واضح'); return [b.start, b.end];
    });
    requireRule(breaks.reduce((s, b) => s + b[1] - b[0], 0) === minutes(union(breaks)) * MINUTE, 'BREAK_OVERLAP', 'الاستراحات متداخلة');
    requireRule(input.type === 'flex' || input.requiredMinutes === end - start - breaks.reduce((n, b) => n + b[1] - b[0], 0), 'REQUIRED_FIXED', 'دقائق الدوام المحدد يجب أن تساوي زمن العمل بعد الاستراحات');
    if (input.type === 'flex') {
      requireRule(clock(input.flexLatestStart) >= start && clock(input.flexLatestStart) < end, 'FLEX', 'نهاية نافذة البدء غير صحيحة');
      requireRule(clock(input.coreStart) >= clock(input.flexLatestStart) && clock(input.coreEnd) > clock(input.coreStart) && clock(input.coreEnd) <= end, 'FLEX_CORE', 'الفترة الإلزامية يجب أن تكون داخل نافذة العمل');
    }
  } else if (kind === 'policies') {
    for (const key of ['maxPeriods', 'maxDailyMinutes', 'maxWeeklyMinutes', 'minRestMinutes', 'maxConsecutiveDays', 'maxSpanMinutes', 'splitGapMinutes', 'travelMinutes', 'graceMinutes', 'overtimeThreshold', 'overtimeCap', 'arrivalLagMinutes']) {
      requireRule(Number.isInteger(input[key]) && input[key] >= 0, 'POLICY', `قيمة السياسة غير صحيحة: ${key}`);
    }
    requireRule(input.maxPeriods >= 1 && input.maxPeriods <= 8 && input.maxDailyMinutes > 0 && input.maxWeeklyMinutes > 0 && input.maxConsecutiveDays > 0 && input.maxSpanMinutes > 0, 'POLICY_LIMIT', 'يلزم تحديد حدود العمل المعتمدة');
    requireRule(['threshold', 'excess'].includes(input.graceMode) && ['threshold', 'excess'].includes(input.overtimeMode), 'POLICY_MODE', 'حدد طريقة السماح وحد فتح الإضافي');
    requireRule(typeof input.graceWaivesMissing === 'boolean' && typeof input.separateApprover === 'boolean', 'POLICY_MODE', 'حدد أثر السماح وفصل الاعتماد');
    requireRule(['warning', 'exception', 'blocker'].includes(input.coverageSeverity), 'SEVERITY', 'حدد شدة نقص التغطية');
    requireRule(Number.isInteger(input.weekStart) && input.weekStart >= 0 && input.weekStart <= 6, 'WEEK', 'بداية الأسبوع غير صحيحة');
    requireRule(Array.isArray(input.approvalRoles) && input.approvalRoles.length > 0 && input.approvalRoles.every(x => typeof x === 'string' && x.length > 0), 'APPROVAL_CHAIN', 'سلسلة الاعتماد مطلوبة');
    requireRule(typeof input.countryPackage === 'string' && input.countryPackage.trim().length > 0, 'COUNTRY', 'حزمة الدولة المعتمدة مطلوبة');
    requireRule(typeof input.observeAfter === 'boolean' && typeof input.requireOvertimePlan === 'boolean', 'OVERTIME_POLICY', 'حدد مصدر إثبات الإضافي والتكليف المسبق');
    (input.holidays ?? []).forEach(date);
  } else if (kind === 'templates') {
    requireRule(['WORK', 'OFF', 'HOLIDAY'].includes(input.dayType), 'DAY_TYPE', 'نوع اليوم غير صحيح');
    requireRule(Array.isArray(input.periods) && (input.dayType === 'WORK' ? input.periods.length > 0 : input.periods.length === 0), 'PERIODS', 'فترات القالب لا تتطابق مع نوع اليوم');
    requireRule(input.periods.length <= 8, 'PERIODS', 'عدد الفترات أكبر من الحد المدعوم');
  } else if (kind === 'patterns') {
    date(input.anchor);
    requireRule(['fixed', 'weekly', 'rotating', 'seasonal'].includes(input.type) && Array.isArray(input.days) && input.days.length > 0 && input.days.length <= 370, 'CYCLE', 'حدد نوع النمط وقوالب أيام الدورة');
    requireRule(!['fixed', 'weekly'].includes(input.type) || input.days.length === 7, 'WEEKLY', 'النمط الأسبوعي يجب أن يحتوي على سبعة أيام');
    requireRule(input.type !== 'seasonal' || Boolean(input.to), 'SEASON', 'النمط الموسمي يحتاج نهاية سريان');
  } else if (kind === 'sites') {
    zonedInstant('2026-02-02', '12:00', input.timezone);
    requireRule(Boolean(input.branch), 'BRANCH', 'الفرع مطلوب');
  }
  return input;
}
export function assignmentFromShift(state, employeeId, day, shift, siteCode, costCenter, periodNo, policy, source = 'manual', disambiguation = 'reject') {
  const employment = employmentAt(state, employeeId, day);
  const site = activeVersion(state.sites, siteCode || employment.siteCode, day);
  requireRule(effective(shift, day) && effective(policy, day), 'EFFECTIVE', 'الشفت أو السياسة غير ساري في تاريخ العمل');
  const start = zonedInstant(day, shift.startTime, site.timezone, disambiguation);
  const end = zonedInstant(addDays(day, shift.endDay), shift.endTime, site.timezone, disambiguation);
  interval(start.at, end.at);
  requireRule(employment.allowedSites.includes(site.code), 'SITE', 'الموظف غير مصرح بالموقع المحدد');
  requireRule(site.branch === employment.branch || employment.allowedSites.includes(site.code), 'SITE_BRANCH', 'الموقع خارج ارتباط الموظف');
  const center = costCenter || employment.costCenter;
  requireRule(!site.costCenters?.length || site.costCenters.includes(center), 'COST_CENTER', 'مركز التكلفة غير صالح للموقع');
  const frozenShift = structuredClone(shift);
  if (shift.type !== 'flex') frozenShift.requiredMinutes = (instantMillis(end.at) - instantMillis(start.at)) / MINUTE - (shift.breaks ?? []).reduce((n, b) => n + b.end - b.start, 0);
  return { key: `${employeeId}:${day}:${periodNo}`, employeeId, employmentId: employment.id, employmentVersion: employment.version,
    employeeCode: employment.code, nameAr: employment.nameAr, nameEn: employment.nameEn, branch: employment.branch, department: employment.department, team: employment.team, job: employment.job,
    workDate: day, periodNo, dayType: 'WORK', shiftId: shift.id, shiftVersion: shift.version, shift: frozenShift, siteCode: site.code, siteVersion: site.version,
    costCenter: costCenter || employment.costCenter, start: start.at, end: end.at, startOffset: start.offsetMinutes, endOffset: end.offsetMinutes,
    timezone: site.timezone, policyId: policy.id, policyVersion: policy.version, policy: structuredClone(policy), source, skills: [...(employment.skills ?? [])],
    breaks: (shift.breaks ?? []).map(b => ({ ...b, start: new Date(Date.parse(start.at) + b.start * MINUTE).toISOString(), end: new Date(Date.parse(start.at) + b.end * MINUTE).toISOString() })) };
}
export function explicitDay(state, employeeId, day, dayType, policy, source) {
  const e = employmentAt(state, employeeId, day);
  return { key: `${employeeId}:${day}:0`, employeeId, employmentId: e.id, employmentVersion: e.version, employeeCode: e.code, nameAr: e.nameAr, nameEn: e.nameEn,
    branch: e.branch, department: e.department, team: e.team, job: e.job, skills: e.skills, workDate: day, periodNo: 0, dayType,
    siteCode: e.siteCode, costCenter: e.costCenter, policyId: policy.id, policyVersion: policy.version, policy: structuredClone(policy), source };
}
export function bindingFor(state, employee, day) {
  const matches = effectiveRevisions(state.bindings, day).filter(b => (
    b.scope === 'employee' || b.scope === 'seasonal' || b.scope === 'override' ? b.employeeIds.includes(employee.employeeId) :
      b.scope === 'company' || employee[b.scope] === b.scopeValue));
  // A later version of the SAME link is a revision; distinct equal-priority links are conflicts.
  const current = [...new Set(matches.map(b => b.id))].map(id => latest(matches, id)).sort((a, b) => b.priority - a.priority);
  requireRule(!current[1] || current[0].priority !== current[1].priority, 'PRIORITY_TIE', `مصدران بنفس الأولوية للموظف ${employee.code} في ${day}`, { sources: current.slice(0, 2).map(b => b.code) });
  return current[0];
}
export function cycleDay(pattern, binding, day, state) {
  let elapsed = (Date.parse(day) - Date.parse(binding.anchor || pattern.anchor)) / DAY;
  // Paused seasons explicitly suspend the base cycle for their calendar span.
  if (binding.scope !== 'seasonal') {
    const paused = [...new Set(state.bindings.map(b => b.id))].map(id => latest(state.bindings, id)).filter(b => b.scope === 'seasonal' && b.status === 'active' && b.returnMode === 'pause' && b.employeeIds.some(id => binding.employeeIds?.includes(id)) && b.from < day);
    const spans = paused.map(b => [Date.parse(b.from), Math.min(Date.parse(addDays(b.to, 1)), Date.parse(day))]);
    elapsed -= minutes(spans) * MINUTE / DAY;
  }
  return ((elapsed + binding.offset) % pattern.days.length + pattern.days.length) % pattern.days.length;
}
export function generate(state, roster, employeeIds, mode = 'fill') {
  requireRule(['fill', 'replace'].includes(mode), 'MODE', 'حدد ملء الفراغات أو الاستبدال');
  let output = structuredClone(roster.assignments);
  for (const employeeId of employeeIds) for (const day of dates(roster.from, roster.to)) {
    let employment; try { employment = employmentAt(state, employeeId, day); } catch (error) { if (error.code === 'EMPLOYMENT' && !effectiveRevisions(state.employments, day).some(e => e.employeeId === employeeId)) continue; throw error; }
    if (mode === 'fill' && output.some(a => a.employeeId === employeeId && a.workDate === day)) continue;
    const binding = bindingFor(state, employment, day);
    requireRule(binding, 'NO_BINDING', `لا يوجد نمط ساري للموظف ${employment.code} في ${day}`);
    const pattern = atVersion(state.patterns, binding.patternId, binding.patternVersion);
    requireRule(effective(pattern, day), 'PATTERN', 'النمط غير ساري في تاريخ العمل');
    const templateRef = pattern.days[cycleDay(pattern, binding, day, state)];
    const template = atVersion(state.templates, templateRef.id, templateRef.version);
    requireRule(effective(template, day), 'TEMPLATE', 'قالب اليوم غير ساري');
    const policy = atVersion(state.policies, binding.policyId, binding.policyVersion);
    output = output.filter(a => a.employeeId !== employeeId || a.workDate !== day);
    if (template.dayType !== 'WORK') output.push(explicitDay(state, employeeId, day, template.dayType, policy, binding.code));
    else template.periods.forEach((p, i) => output.push(assignmentFromShift(state, employeeId, day, atVersion(state.shifts, p.shiftId, p.shiftVersion), p.siteCode, p.costCenter, i + 1, policy, binding.code, p.disambiguation)));
  }
  return output;
}
export const publishedAssignments = state => state.rosters.filter(r => r.status === 'published').flatMap(r => r.assignments.map(a => ({ ...a, rosterId: r.id, rosterVersion: r.version })));
export function requiredIntervals(a) { return a.dayType !== 'WORK' ? [] : subtract([interval(a.start, a.end)], a.breaks.map(b => interval(b.start, b.end))); }
export function approvedLeaveIntervals(state, employeeId, paidOnly = false) {
  return state.leaves.filter(l => l.employeeId === employeeId && l.status === 'approved' && (!paidOnly || l.paid)).map(l => interval(l.start, l.end));
}
export function validateRoster(state, roster) {
  const issues = [], add = (a, code, message, required, severity = 'blocker') => issues.push({ key: `${a.key}:${code}`, employeeId: a.employeeId, employeeCode: a.employeeCode, workDate: a.workDate, code, severity, required, message: `${a.employeeCode} — ${a.workDate}: ${message}${required == null ? '' : ` (${required})`}` });
  const others = publishedAssignments(state).filter(a => a.rosterId !== roster.id && a.rosterId !== roster.baseId);
  const all = [...others, ...roster.assignments], work = all.filter(a => a.dayType === 'WORK');
  const seen = new Set();
  for (const a of roster.assignments) {
    if (seen.has(a.key)) add(a, 'DUPLICATE', 'إسناد مكرر'); seen.add(a.key);
    try {
      const e = employmentAt(state, a.employeeId, a.workDate);
      requireRule(e.id === a.employmentId && e.version === a.employmentVersion, 'EMPLOYMENT_CHANGED', 'تغير الارتباط الوظيفي؛ أعد التسكين');
      requireRule((e.allowedSites ?? [e.siteCode]).includes(a.siteCode), 'SITE', 'الموظف غير مصرح له بالموقع');
      const currentSite = activeVersion(state.sites, a.siteCode, a.workDate);
      requireRule(!currentSite.costCenters?.length || currentSite.costCenters.includes(a.costCenter), 'COST_CENTER', 'مركز التكلفة لم يعد صالحًا للموقع');
      requireRule(effective(atVersion(state.policies, a.policyId, a.policyVersion), a.workDate), 'POLICY', 'السياسة غير سارية');
      requireRule(activeVersion(state.policies, a.policy.code, a.workDate).version === a.policyVersion, 'POLICY_CHANGED', 'تغير إصدار سياسة الدوام؛ أعد تقييم الإسناد واعتماده');
      if (a.dayType === 'WORK') {
        requireRule(effective(atVersion(state.shifts, a.shiftId, a.shiftVersion), a.workDate), 'SHIFT', 'الشفت غير ساري');
        requireRule(activeVersion(state.shifts, a.shift.code, a.workDate).version === a.shiftVersion, 'SHIFT_CHANGED', 'تغير إصدار الشفت؛ اختر النسخة السارية لإسناد جديد');
        requireRule((a.shift.requiredSkills ?? []).every(skill => e.skills?.some(s => (typeof s === 'string' ? s === skill : s.code === skill && s.from <= a.workDate && (!s.to || s.to >= a.workDate)))), 'SKILL', 'المهارة المطلوبة غير سارية');
        interval(a.start, a.end);
      }
    } catch (error) { add(a, error.code || 'ELIGIBILITY', error.message); }
    if (a.workDate < roster.from || a.workDate > roster.to || !roster.employeeIds.includes(a.employeeId)) add(a, 'SCOPE', 'الإسناد خارج نطاق الجدول');
    if (a.dayType !== 'WORK') {
      if (all.some(b => b.employeeId === a.employeeId && b.workDate === a.workDate && b.dayType === 'WORK')) add(a, 'DAY_MIX', 'لا يمكن جمع العمل والراحة في نفس يوم العمل');
      continue;
    }
    if (all.some(b => b.employeeId === a.employeeId && b.workDate === a.workDate && b.dayType !== 'WORK')) add(a, 'DAY_MIX', 'لا يمكن جمع عمل وراحة في يوم واحد');
    const span = interval(a.start, a.end), sameDay = work.filter(b => b.employeeId === a.employeeId && b.workDate === a.workDate);
    if (sameDay.length > a.policy.maxPeriods) add(a, 'PERIOD_LIMIT', 'تجاوز عدد فترات اليوم', a.policy.maxPeriods);
    if (sameDay.reduce((n, b) => n + b.shift.requiredMinutes, 0) > a.policy.maxDailyMinutes) add(a, 'DAILY_LIMIT', 'تجاوز دقائق العمل اليومية', a.policy.maxDailyMinutes);
    if ((Math.max(...sameDay.map(b => Date.parse(b.end))) - Math.min(...sameDay.map(b => Date.parse(b.start)))) / MINUTE > a.policy.maxSpanMinutes) add(a, 'SPAN', 'تجاوز امتداد يوم العمل', a.policy.maxSpanMinutes);
    const weekday = new Date(a.workDate).getUTCDay(), week = addDays(a.workDate, -((weekday - a.policy.weekStart + 7) % 7));
    if (work.filter(b => b.employeeId === a.employeeId && b.workDate >= week && b.workDate <= addDays(week, 6)).reduce((n, b) => n + b.shift.requiredMinutes, 0) > a.policy.maxWeeklyMinutes) add(a, 'WEEKLY_LIMIT', 'تجاوز دقائق العمل الأسبوعية', a.policy.maxWeeklyMinutes);
    const days = new Set(work.filter(b => b.employeeId === a.employeeId).map(b => b.workDate)); let before = 0, after = 0;
    while (days.has(addDays(a.workDate, -before - 1))) before++;
    while (days.has(addDays(a.workDate, after + 1))) after++;
    if (before + after + 1 > a.policy.maxConsecutiveDays) add(a, 'CONSECUTIVE', 'تجاوز أيام العمل المتصلة', a.policy.maxConsecutiveDays);
    for (const b of work.filter(b => b.employeeId === a.employeeId && b !== a)) {
      const other = interval(b.start, b.end);
      if (overlap(span, other)) add(a, 'SHIFT_OVERLAP', 'يتداخل مع تكليف آخر');
      if (other[1] <= span[0] || span[1] <= other[0]) {
        const gap = (other[1] <= span[0] ? span[0] - other[1] : other[0] - span[1]) / MINUTE, minimum = a.workDate === b.workDate ? Math.max(a.policy.splitGapMinutes, b.policy.splitGapMinutes) : Math.max(a.policy.minRestMinutes, b.policy.minRestMinutes);
        if (gap < minimum) add(a, 'REST_GAP', 'الفاصل أقل من الحد المسموح', minimum);
        if (a.siteCode !== b.siteCode && gap < Math.max(a.policy.travelMinutes, b.policy.travelMinutes)) add(a, 'TRAVEL', 'وقت الانتقال بين الموقعين غير كافٍ', a.policy.travelMinutes);
      }
    }
    const approved = state.leaves.filter(l => l.employeeId === a.employeeId && l.status === 'approved' && overlap(span, interval(l.start, l.end)));
    // Leave approved after the original publication is an explicit overlay; preserve original assignment.
    if (approved.some(l => !roster.baseId || !l.overlayRosterIds?.includes(roster.baseId) || !state.rosters.find(r => r.id === roster.baseId)?.assignments.some(b => JSON.stringify(b) === JSON.stringify(a)))) add(a, 'LEAVE_CONFLICT', 'إجازة معتمدة تتداخل مع التكليف');
    if (state.leaves.some(l => l.employeeId === a.employeeId && l.status === 'pending' && overlap(span, interval(l.start, l.end)))) add(a, 'LEAVE_PENDING', 'طلب عدم توافر قيد الاعتماد', null, 'warning');
  }
  for (const employeeId of roster.employeeIds) for (const day of dates(roster.from, roster.to)) {
    if (!roster.assignments.some(a => a.employeeId === employeeId && a.workDate === day)) {
      let e; try { e = employmentAt(state, employeeId, day); } catch { continue; }
      if (!minutes(intersect([[Date.parse(day), Date.parse(addDays(day, 1))]], approvedLeaveIntervals(state, employeeId)))) add({ key: `${employeeId}:${day}`, employeeId, employeeCode: e.code, workDate: day }, 'UNSCHEDULED', 'يوم غير مجدول؛ عيّن حالة صريحة', null, 'exception');
    }
  }
  for (const segment of coverage(state, [...others, ...roster.assignments], state.demands.filter(d => d.workDate >= roster.from && d.workDate <= roster.to)).segments) {
    if (segment.assigned < segment.minimum) issues.push({ key: `coverage:${segment.id}:${segment.start}`, code: 'COVERAGE_GAP', severity: segment.severity, workDate: segment.workDate, message: `نقص تغطية ${segment.siteCode} / ${segment.skill}: المطلوب ${segment.minimum} والمتاح ${segment.assigned}`, required: segment.minimum });
  }
  return [...new Map(issues.map(x => [x.key, x])).values()];
}
function instantMillis(value) { return Date.parse(value); }
/** Bipartite allocation per time segment: one qualified person can fill only one simultaneous role. */
export function coverage(state, assignments, demands = state.demands) {
  const active = assignments.filter(a => a.dayType === 'WORK').map(a => ({ ...a, available: subtract(requiredIntervals(a), approvedLeaveIntervals(state, a.employeeId)) }));
  const boundaries = [...new Set([...active.flatMap(a => a.available.flat()), ...demands.flatMap(d => interval(d.start, d.end))])].sort((a, b) => a - b);
  const segments = []; let required = 0, covered = 0;
  for (let i = 0; i < boundaries.length - 1; i++) {
    const s = boundaries[i], e = boundaries[i + 1], current = demands.filter(d => Date.parse(d.start) <= s && Date.parse(d.end) >= e);
    if (!current.length) continue;
    const workers = active.filter(a => a.available.some(p => p[0] <= s && p[1] >= e));
    const slots = current.flatMap(d => Array.from({ length: d.target }, (_, n) => ({ d, n }))).sort((a, b) => (a.n < a.d.minimum ? 0 : 1) - (b.n < b.d.minimum ? 0 : 1));
    const assigned = new Map(), owner = new Map();
    const eligible = (w, d) => w.siteCode === d.siteCode && (!d.skill || w.skills.some(skill => typeof skill === 'string' ? skill === d.skill : skill.code === d.skill && skill.from <= d.workDate && (!skill.to || skill.to >= d.workDate)));
    function fill(index, visited) {
      for (const w of workers) {
        if (!eligible(w, slots[index].d) || visited.has(w.employeeId)) continue;
        visited.add(w.employeeId);
        if (!owner.has(w.employeeId) || fill(owner.get(w.employeeId), visited)) { owner.set(w.employeeId, index); assigned.set(index, w.employeeId); return true; }
      }
      return false;
    }
    slots.forEach((_, index) => fill(index, new Set()));
    for (const d of current) {
      const count = [...assigned.keys()].filter(index => slots[index].d.id === d.id).length;
      const duration = (e - s) / MINUTE; required += duration * d.target; covered += duration * Math.min(count, d.target);
      segments.push({ ...d, start: new Date(s).toISOString(), end: new Date(e).toISOString(), assigned: count, gap: Math.max(0, d.target - count), available: new Set(workers.filter(w => eligible(w, d)).map(w => w.employeeId)).size });
    }
  }
  return { segments, requiredMinutes: required, coveredMinutes: covered, ratio: required ? covered / required * 100 : null };
}
export const IMPORT_COLUMNS = ['employee_code', 'work_date', 'day_type', 'period_no', 'shift_code', 'site_code', 'cost_center_code', 'operation', 'reason'];
export function previewImport(state, roster, rows, policyRef) {
  requireRule(Array.isArray(rows) && rows.length > 0 && rows.length <= 10000, 'IMPORT_SIZE', 'الاستيراد يقبل من صف إلى 10000 صف');
  const errors = [], seen = new Set(); let assignments = structuredClone(roster.assignments);
  rows.forEach((row, index) => {
    let column = 'employee_code';
    try {
      requireRule(IMPORT_COLUMNS.every(k => Object.hasOwn(row, k)), 'COLUMNS', 'أعمدة القالب غير مكتملة');
      requireRule(typeof row.employee_code === 'string', 'EMPLOYEE_CODE', 'رقم الموظف يجب أن يكون نصًا للحفاظ على الأصفار');
      const e = state.employments.find(e => e.code === row.employee_code && roster.employeeIds.includes(e.employeeId));
      requireRule(e, 'EMPLOYEE', 'الموظف غير موجود ضمن نطاق الجدول'); column = 'work_date';
      date(row.work_date); requireRule(row.work_date >= roster.from && row.work_date <= roster.to, 'DATE_RANGE', 'التاريخ خارج فترة الجدول');
      column = 'day_type'; requireRule(['WORK', 'OFF', 'HOLIDAY'].includes(row.day_type), 'DAY_TYPE', 'نوع اليوم WORK أو OFF أو HOLIDAY؛ الإجازة من مسارها');
      column = 'period_no'; const periodNo = row.day_type === 'WORK' ? Number(row.period_no) : 0;
      requireRule(Number.isInteger(periodNo) && (row.day_type !== 'WORK' || periodNo > 0), 'PERIOD', 'رقم الفترة غير صحيح');
      const key = `${e.employeeId}:${row.work_date}:${periodNo}`;
      requireRule(!seen.has(key), 'DUPLICATE', 'صف مكرر للموظف والتاريخ والفترة'); seen.add(key);
      column = 'operation'; requireRule(['ADD', 'REPLACE', 'REMOVE'].includes(row.operation), 'OPERATION', 'العملية ADD أو REPLACE أو REMOVE');
      const existing = assignments.find(a => a.key === key);
      requireRule(row.operation !== 'ADD' || !existing, 'EXISTS', 'الفترة موجودة؛ اختر الاستبدال صراحة');
      requireRule(row.operation === 'ADD' || existing, 'MISSING', 'الفترة المطلوب تغييرها غير موجودة');
      column = 'reason'; requireRule(row.operation === 'ADD' || String(row.reason).trim().length >= 3, 'REASON', 'سبب الاستبدال أو الحذف مطلوب');
      column = 'shift_code'; const policy = atVersion(state.policies, policyRef.id, policyRef.version);
      let added;
      if (row.operation !== 'REMOVE') added = row.day_type === 'WORK' ? assignmentFromShift(state, e.employeeId, row.work_date, activeVersion(state.shifts, row.shift_code, row.work_date), row.site_code, row.cost_center_code, periodNo, policy, 'import') : explicitDay(state, e.employeeId, row.work_date, row.day_type, policy, 'import');
      assignments = assignments.filter(a => a.key !== key); if (added) assignments.push(added);
    } catch (err) { errors.push({ row: index + 2, column, employeeCode: row.employee_code, workDate: row.work_date, code: err.code, message: err.message }); }
  });
  const issues = validateRoster(state, { ...roster, assignments });
  for (const issue of issues.filter(i => i.severity === 'blocker')) {
    const index = rows.findIndex(r => r.employee_code === issue.employeeCode && r.work_date === issue.workDate);
    errors.push({ row: index >= 0 ? index + 2 : null, column: 'period_no', code: issue.code, message: issue.message });
  }
  return { assignments, errors, issues, inputCount: rows.length };
}
export function differences(before = [], after = []) {
  const keys = new Set([...before, ...after].map(a => a.key));
  return [...keys].flatMap(key => { const old = before.find(a => a.key === key) ?? null, value = after.find(a => a.key === key) ?? null; return JSON.stringify(old) === JSON.stringify(value) ? [] : [{ key, before: old, after: value }]; });
}
