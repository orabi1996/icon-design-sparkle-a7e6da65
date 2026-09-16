import { RuleError, requireRule, date, dates, addDays, instant, interval, overlap, minutes, intersect, localParts, zonedInstant } from './time.mjs';
import { PRIORITIES, effective, effectiveRevisions, latest, atVersion, activeVersion, employmentAt, validateDefinition, assignmentFromShift, explicitDay, generate, publishedAssignments, validateRoster, previewImport, differences, approvedLeaveIntervals, coverage, requiredIntervals } from './planning.mjs';
import { ENGINE_VERSION, matchPunches, calculateAttendance, canonical, payrollDelta } from './attendance.mjs';
import { assertAccess, allowed, authorizeRoster, employeeScope } from './access.mjs';

export const COLLECTIONS = ['shifts', 'templates', 'patterns', 'bindings', 'policies', 'employments', 'sites', 'demands', 'rosters', 'leaves', 'requests', 'openShifts', 'results', 'deliveries', 'payrollPeriods', 'corrections', 'exceptions', 'notifications'];
export function emptyState() { return { schemaVersion: 1, ...Object.fromEntries(COLLECTIONS.map(k => [k, []])), punches: [] }; }
const find = (items, id) => { const x = items.find(v => v.id === id); requireRule(x, 'NOT_FOUND', 'السجل غير متاح'); return x; };
const requiredText = (s, message) => requireRule(typeof s === 'string' && s.trim().length >= 3 && s.length <= 1000, 'TEXT', message);
function leaveScopes(state, leave) {
  const touching = publishedAssignments(state).filter(a => a.employeeId === leave.employeeId && a.dayType === 'WORK' && overlap(interval(a.start, a.end), interval(leave.start, leave.end)));
  const days = [...new Set(touching.map(a => a.workDate))];
  if (!days.length) days.push(leave.start.slice(0, 10));
  return days.map(day => employeeScope(state, leave.employeeId, day));
}
function punchWorkDate(state, punch, published = publishedAssignments(state)) {
  const millis = instant(punch.at);
  const near = published.filter(a => a.employeeId === punch.employeeId && a.dayType === 'WORK' && a.siteCode === punch.siteCode &&
    millis >= instant(a.start) - a.shift.windowBefore * 60000 && millis <= instant(a.end) + a.shift.windowAfter * 60000);
  if (near.length === 1) return near[0].workDate;
  const utcDay = new Date(millis).toISOString().slice(0, 10);
  const site = effectiveRevisions(state.sites, utcDay).find(s => s.code === punch.siteCode && s.status === 'active');
  // Unknown/offline device sites remain raw evidence, never authoritative attendance.
  if (!site) return utcDay;
  const workDate = localParts(millis, site.timezone).date;
  return workDate;
}
function mutable(roster) { requireRule(['draft', 'returned'].includes(roster.status), 'ROSTER_LOCKED', 'هذه النسخة ثابتة؛ أنشئ نسخة تعديل أو أعدها للمخطط'); }
function touch(roster, assignments, actor, now, reason) {
  mutable(roster); roster.history.push({ version: roster.version, assignments: structuredClone(roster.assignments), actor: actor.id, at: now, reason });
  roster.assignments = assignments; roster.version++; roster.status = 'draft'; roster.approvals = []; roster.issues = [];
}
function blocking(state, roster) {
  const issues = validateRoster(state, roster);
  return issues.filter(i => i.severity === 'blocker' || (i.severity === 'exception' && !state.exceptions.some(e => e.rosterId === roster.id && e.rosterVersion === roster.version && e.issueKey === i.key && e.status === 'approved')));
}
function notify(state, eventId, employeeId, kind, at, payload = {}) {
  const e = employeeScope(state, employeeId);
  const id = `${eventId}:${employeeId}:${kind}`;
  if (!state.notifications.some(n => n.id === id)) state.notifications.push({ id, employeeId, userId: e.userId || null, kind, at, payload, status: 'pending', attempts: 0, readAt: null });
}
function publish(state, roster, actor, now, operationId, reason) {
  requireRule(roster.status === 'approved', 'NOT_APPROVED', 'يلزم اعتماد النسخة قبل النشر');
  const policy = atVersion(state.policies, roster.policyId, roster.policyVersion);
  requireRule(dates(roster.from, roster.to).every(day => activeVersion(state.policies, policy.code, day).version === roster.policyVersion),
    'POLICY_CHANGED', 'تغير إصدار السياسة خلال فترة الجدول؛ أعد إعداد النسخة واعتمادها');
  requireRule(policy.approvalRoles.every((role, index) => roster.approvals.some(a => a.stage === index && a.role === role && a.version === roster.version)), 'APPROVAL_STALE', 'موافقات هذه النسخة غير مكتملة');
  if (roster.baseId) requireRule(find(state.rosters, roster.baseId).status === 'published', 'BASE_STALE', 'استبدلت النسخة الأصلية؛ أعد تقييم التغيير');
  const conflicts = blocking(state, roster); requireRule(!conflicts.length, 'PUBLISH_CONFLICT', conflicts[0]?.message, { issues: conflicts });
  const old = roster.baseId ? find(state.rosters, roster.baseId) : null;
  if (old) { old.status = 'superseded'; old.supersededAt = now; old.supersededBy = roster.id; }
  roster.status = 'published'; roster.publishedAt = now; roster.publishedBy = actor.id; roster.publishOperation = operationId; roster.reason = reason;
  const affected = new Set(differences(old?.assignments, roster.assignments).flatMap(d => [d.before?.employeeId, d.after?.employeeId]).filter(Boolean));
  for (const id of affected) notify(state, operationId, id, old ? 'roster_changed' : 'roster_published', now, { rosterId: roster.id, from: roster.from, to: roster.to });
  state.requests.filter(r => r.status !== 'executed' && (r.rosterId === old?.id || r.otherRosterId === old?.id)).forEach(r => { r.status = 'needs_review'; });
}
function newRoster(state, data, actor, now, id) {
  requiredText(data.name, 'اسم الجدول مطلوب'); dates(data.from, data.to);
  requireRule(Array.isArray(data.employeeIds) && data.employeeIds.length > 0 && data.employeeIds.length <= 10000 && new Set(data.employeeIds).size === data.employeeIds.length, 'EMPLOYEES', 'نطاق الموظفين غير صحيح');
  const policy = atVersion(state.policies, data.policyId, data.policyVersion);
  requireRule(effective(policy, data.from) && effective(policy, data.to), 'POLICY', 'السياسة يجب أن تغطي كامل فترة الجدول');
  requireRule(dates(data.from, data.to).every(day => activeVersion(state.policies, policy.code, day).version === policy.version),
    'POLICY_VERSION', 'السياسة المختارة لا تغطي الفترة بإصدار سارٍ واحد؛ قسّم الجدول عند تغيير السياسة');
  return { id, name: data.name, from: data.from, to: data.to, employeeIds: [...data.employeeIds], policyId: policy.id, policyVersion: policy.version,
    status: 'draft', version: 1, createdBy: actor.id, createdAt: now, assignments: [], approvals: [], history: [], issues: [], baseId: null };
}
const DEFINITION_FIELDS = {
  shifts: ['type', 'startTime', 'endTime', 'endDay', 'timezone', 'requiredMinutes', 'punchMode', 'windowBefore', 'windowAfter', 'breaks', 'requiredSkills', 'flexLatestStart', 'coreStart', 'coreEnd', 'disambiguation', 'color'],
  policies: ['countryPackage', 'maxPeriods', 'maxDailyMinutes', 'maxWeeklyMinutes', 'minRestMinutes', 'maxConsecutiveDays', 'maxSpanMinutes', 'splitGapMinutes', 'travelMinutes', 'graceMinutes', 'graceMode', 'graceWaivesMissing', 'overtimeThreshold', 'overtimeCap', 'overtimeMode', 'observeAfter', 'requireOvertimePlan', 'arrivalLagMinutes', 'coverageSeverity', 'separateApprover', 'weekStart', 'approvalRoles', 'holidays', 'changeNoticeMinutes'],
  templates: ['dayType', 'periods'], patterns: ['type', 'anchor', 'days'], sites: ['branch', 'timezone', 'costCenters'],
};
function selectFields(data, fields) { return Object.fromEntries(fields.filter(k => data[k] !== undefined).map(k => [k, structuredClone(data[k])])); }

/** Trusted server command boundary. Never expose aggregate replacement to a browser. */
export function execute(input, command, actor, now) {
  requireRule(command && typeof command.type === 'string' && command.payload && typeof command.payload === 'object', 'COMMAND', 'العملية غير صحيحة');
  requiredText(command.reason, 'سبب العملية مطلوب (3 إلى 1000 حرف)'); instant(now);
  const state = structuredClone(input), data = command.payload, id = command.operationId;
  requireRule(typeof id === 'string' && id.length >= 10, 'OPERATION_ID', 'معرف العملية مطلوب');
  let result = null, before = null;
  if (command.type === 'definition.save') {
    requireRule(Object.hasOwn(DEFINITION_FIELDS, data.kind), 'KIND', 'نوع التعريف غير مدعوم'); assertAccess(actor, 'configure');
    const value = selectFields(data.value, ['id', 'code', 'nameAr', 'nameEn', 'from', 'to', 'status', ...DEFINITION_FIELDS[data.kind]]);
    validateDefinition(data.kind, value);
    if (value.status === 'active') assertAccess(actor, 'approve');
    const old = value.id ? latest(state[data.kind], value.id) : null;
    requireRule(!value.id || old, 'REFERENCE', 'التعريف الأصلي غير موجود');
    requireRule(!old || data.expectedVersion === old.version, 'VERSION_STALE', 'تغير إصدار التعريف؛ حدّث البيانات');
    requireRule(!old || value.code === old.code, 'CODE_HISTORY', 'لا يمكن تغيير رمز تعريف تاريخي');
    requireRule(!state[data.kind].some(x => x.code === value.code && x.id !== old?.id), 'CODE_UNIQUE', 'الرمز مستخدم سابقًا');
    if (data.kind === 'templates') for (const p of value.periods) { atVersion(state.shifts, p.shiftId, p.shiftVersion); if (p.siteCode) activeVersion(state.sites, p.siteCode, value.from); }
    if (data.kind === 'patterns') value.days.forEach(d => atVersion(state.templates, d.id, d.version));
    result = { ...value, id: old?.id ?? id, version: (old?.version ?? 0) + 1, createdBy: actor.id, createdAt: now, approvedBy: value.status === 'active' ? actor.id : null, reason: command.reason };
    before = old; state[data.kind].push(result);
  } else if (command.type === 'employment.save') {
    const value = selectFields(data.value, ['id', 'employeeId', 'code', 'nameAr', 'nameEn', 'from', 'to', 'status', 'branch', 'department', 'team', 'job', 'siteCode', 'allowedSites', 'costCenter', 'skills', 'userId', 'contractMinutes']);
    assertAccess(actor, 'link', value); date(value.from); if (value.to) requireRule(date(value.to) >= value.from, 'EFFECTIVE', 'نهاية الارتباط قبل بدايته');
    requireRule(typeof value.employeeId === 'string' && typeof value.code === 'string' && value.code.length > 0 && value.branch && value.nameAr, 'EMPLOYMENT', 'بيانات الموظف والفرع ورقم الموظف مطلوبة');
    requireRule(['active', 'stopped'].includes(value.status), 'STATUS', 'حالة الارتباط غير صحيحة');
    activeVersion(state.sites, value.siteCode, value.from);
    requireRule(Array.isArray(value.allowedSites) && value.allowedSites.includes(value.siteCode) && Array.isArray(value.skills), 'ELIGIBILITY', 'المواقع المسموحة والمهارات مطلوبة');
    const old = value.id ? latest(state.employments, value.id) : null;
    if (old) { assertAccess(actor, 'link', old); requireRule(old.employeeId === value.employeeId && old.code === value.code && data.expectedVersion === old.version, 'VERSION_STALE', 'تغير الارتباط الوظيفي أو هوية الموظف'); }
    requireRule(!state.employments.some(e => (e.code === value.code && e.employeeId !== value.employeeId) || (e.userId && e.userId === value.userId && e.employeeId !== value.employeeId)), 'EMPLOYEE_UNIQUE', 'رقم الموظف أو حسابه مرتبط بموظف آخر');
    result = { ...value, id: old?.id ?? id, version: (old?.version ?? 0) + 1, createdAt: now, createdBy: actor.id, reason: command.reason }; before = old;
    state.employments.push(result);
    if (value.status === 'active') employmentAt(state, value.employeeId, value.from);
  } else if (command.type === 'binding.save') {
    const b = selectFields(data.value, ['id', 'code', 'nameAr', 'nameEn', 'from', 'to', 'status', 'scope', 'scopeValue', 'employeeIds', 'patternId', 'patternVersion', 'policyId', 'policyVersion', 'anchor', 'offset', 'priority', 'returnMode']);
    requireRule(Object.hasOwn(PRIORITIES, b.scope) && Array.isArray(b.employeeIds), 'BINDING', 'نطاق ربط النمط غير صحيح');
    date(b.from); if (b.to) requireRule(date(b.to) >= b.from, 'EFFECTIVE', 'نهاية الربط قبل بدايته'); if (b.anchor) date(b.anchor);
    requireRule(Number.isInteger(b.offset) && Number.isInteger(b.priority), 'OFFSET', 'الإزاحة والأولوية أعداد صحيحة');
    if (b.scope === 'seasonal') requireRule(b.to && ['continue', 'pause'].includes(b.returnMode), 'SEASON', 'حدد نهاية الموسم وسلوك العودة');
    const scoped = b.employeeIds.length ? b.employeeIds.map(e => employeeScope(state, e)) : state.employments.filter(e => b.scope === 'company' || e[b.scope] === b.scopeValue);
    requireRule(scoped.length, 'EMPTY_SCOPE', 'لا يوجد موظفون ضمن نطاق الربط'); scoped.forEach(e => assertAccess(actor, 'link', e));
    atVersion(state.patterns, b.patternId, b.patternVersion); atVersion(state.policies, b.policyId, b.policyVersion);
    const old = b.id ? latest(state.bindings, b.id) : null;
    requireRule(!b.id || old && old.version === data.expectedVersion, 'VERSION_STALE', 'تغير إصدار الربط');
    result = { ...b, id: old?.id ?? id, version: (old?.version ?? 0) + 1, reason: command.reason, createdBy: actor.id, createdAt: now }; before = old;
    state.bindings.push(result);
  } else if (command.type === 'roster.create') {
    result = newRoster(state, data, actor, now, id); authorizeRoster(actor, 'draft', result, state); state.rosters.push(result);
  } else if (command.type.startsWith('roster.')) {
    const roster = find(state.rosters, data.rosterId); before = structuredClone(roster);
    const action = command.type.slice(7);
    const permission = ({ import: 'import', approve: 'approve', return: 'approve', publish: 'publish', revise: 'revise', cancel: 'publish' })[action] ?? 'draft';
    authorizeRoster(actor, permission, roster, state);
    requireRule(data.version === roster.version, 'VERSION_STALE', 'تغيرت النسخة منذ فتحها؛ راجع التعديلات قبل الحفظ');
    if (action === 'assign') {
      mutable(roster); requireRule(Array.isArray(data.cells) && data.cells.length > 0, 'CELLS', 'اختر الخلايا المطلوب تسكينها');
      let assignments = structuredClone(roster.assignments);
      for (const cell of data.cells) {
        requireRule(roster.employeeIds.includes(cell.employeeId), 'SCOPE', 'الموظف خارج الجدول');
        const policy = atVersion(state.policies, roster.policyId, roster.policyVersion);
        const row = cell.dayType === 'WORK' ? assignmentFromShift(state, cell.employeeId, date(cell.workDate), atVersion(state.shifts, cell.shiftId, cell.shiftVersion), cell.siteCode, cell.costCenter, Number(cell.periodNo), policy, 'manual', cell.disambiguation) : explicitDay(state, cell.employeeId, date(cell.workDate), cell.dayType, policy, 'manual');
        requireRule(['WORK', 'OFF', 'HOLIDAY'].includes(cell.dayType) && (cell.dayType !== 'WORK' || Number.isInteger(cell.periodNo) && cell.periodNo > 0), 'CELL', 'حالة اليوم أو رقم الفترة غير صحيح');
        if (cell.replaceDay) assignments = assignments.filter(a => a.employeeId !== row.employeeId || a.workDate !== row.workDate);
        else assignments = assignments.filter(a => a.key !== row.key);
        assignments.push(row);
      }
      const issues = validateRoster(state, { ...roster, assignments }).filter(i => i.severity === 'blocker');
      requireRule(!issues.length, 'ASSIGNMENT', issues[0]?.message, { issues }); touch(roster, assignments, actor, now, command.reason);
    } else if (action === 'remove') {
      mutable(roster); requireRule(Array.isArray(data.keys), 'KEYS', 'اختر الفترات');
      touch(roster, roster.assignments.filter(a => !data.keys.includes(a.key)), actor, now, command.reason);
    } else if (action === 'generate') {
      mutable(roster); const ids = data.employeeIds ?? roster.employeeIds;
      requireRule(ids.every(e => roster.employeeIds.includes(e)), 'SCOPE', 'نطاق التوليد خارج الجدول');
      const assignments = generate(state, roster, ids, data.mode ?? 'fill');
      const issues = validateRoster(state, { ...roster, assignments }).filter(i => i.severity === 'blocker'); requireRule(!issues.length, 'GENERATION', issues[0]?.message, { issues });
      touch(roster, assignments, actor, now, command.reason);
    } else if (action === 'import') {
      mutable(roster); const preview = previewImport(state, roster, data.rows, { id: roster.policyId, version: roster.policyVersion });
      requireRule(preview.errors.length === 0, 'IMPORT_ERRORS', 'صحح أخطاء الاستيراد قبل إدخال الدفعة كاملة', { errors: preview.errors });
      touch(roster, preview.assignments, actor, now, command.reason);
    } else if (action === 'copy') {
      mutable(roster); const source = find(state.rosters, data.sourceRosterId); authorizeRoster(actor, 'read', source, state);
      date(data.sourceFrom); date(data.sourceTo); date(data.targetFrom);
      let assignments = structuredClone(roster.assignments);
      const offset = (Date.parse(data.targetFrom) - Date.parse(data.sourceFrom)) / 86400000;
      const copied = source.assignments.filter(a => a.workDate >= data.sourceFrom && a.workDate <= data.sourceTo && (!data.sourceEmployeeId || a.employeeId === data.sourceEmployeeId));
      const cleared = new Set();
      const occupiedDays = new Set(roster.assignments.map(a => `${a.employeeId}:${a.workDate}`));
      for (const a of copied) {
        const day = addDays(a.workDate, offset), employeeId = data.targetEmployeeId || a.employeeId;
        requireRule(roster.employeeIds.includes(employeeId), 'SCOPE', 'الموظف خارج الجدول');
        const policy = atVersion(state.policies, roster.policyId, roster.policyVersion);
        const row = a.dayType === 'WORK' ? assignmentFromShift(state, employeeId, day, a.shift, a.siteCode, a.costCenter, a.periodNo, policy, 'copy', data.disambiguation) : explicitDay(state, employeeId, day, a.dayType, policy, 'copy');
        const exists = occupiedDays.has(`${employeeId}:${day}`);
        if (exists && !data.replace) continue;
        const dayKey = `${employeeId}:${day}`;
        if (data.replace && !cleared.has(dayKey)) { assignments = assignments.filter(b => b.employeeId !== employeeId || b.workDate !== day); cleared.add(dayKey); }
        assignments = assignments.filter(b => b.key !== row.key); assignments.push(row);
      }
      const conflicts = validateRoster(state, { ...roster, assignments }).filter(i => i.severity === 'blocker'); requireRule(!conflicts.length, 'COPY_CONFLICT', conflicts[0]?.message);
      touch(roster, assignments, actor, now, command.reason);
    } else if (action === 'undo') {
      mutable(roster); const previous = roster.history.at(-1); requireRule(previous, 'NO_UNDO', 'لا يوجد تعديل سابق للتراجع');
      const assignments = structuredClone(previous.assignments); roster.history.pop(); roster.assignments = assignments; roster.version++; roster.approvals = [];
    } else if (action === 'validate') {
      roster.issues = validateRoster(state, roster);
    } else if (action === 'submit') {
      mutable(roster); const issues = blocking(state, roster); requireRule(!issues.length, 'SUBMIT_CONFLICT', issues[0]?.message, { issues });
      roster.status = 'review'; roster.submittedAt = now; roster.approvals = [];
    } else if (action === 'return') {
      requireRule(['review', 'approved'].includes(roster.status), 'STATE', 'الجدول ليس في مرحلة المراجعة'); roster.status = 'returned'; roster.returnReason = command.reason; roster.approvals = [];
    } else if (action === 'approve') {
      requireRule(roster.status === 'review', 'STATE', 'النسخة ليست قيد المراجعة');
      const policy = atVersion(state.policies, roster.policyId, roster.policyVersion), stage = roster.approvals.length, role = policy.approvalRoles[stage];
      requireRule(actor.roles.includes(role), 'APPROVAL_ROLE', 'أنت لست المعتمد لهذه المرحلة');
      requireRule(!policy.separateApprover || roster.createdBy !== actor.id, 'SEPARATION', 'منشئ الجدول لا يعتمد نسخته بنفسه');
      const issues = blocking(state, roster); requireRule(!issues.length, 'APPROVAL_CONFLICT', issues[0]?.message, { issues });
      roster.approvals.push({ stage, role, actor: actor.id, version: roster.version, at: now, reason: command.reason });
      if (roster.approvals.length === policy.approvalRoles.length) roster.status = 'approved';
    } else if (action === 'publish') publish(state, roster, actor, now, id, command.reason);
    else if (action === 'revise') {
      requireRule(roster.status === 'published', 'STATE', 'اختر النسخة المنشورة لإنشاء تعديل');
      result = { ...structuredClone(roster), id, name: data.name || `${roster.name} — تعديل`, baseId: roster.id, status: 'draft', version: 1, approvals: [], history: [], createdBy: actor.id, createdAt: now, publishedAt: null, publishedBy: null, reason: command.reason };
      state.rosters.push(result);
    } else if (action === 'cancel') {
      requireRule(!['published', 'superseded'].includes(roster.status), 'PUBLISHED_CANCEL', 'إلغاء جدول منشور يحتاج نسخة بديلة معتمدة حتى لا يترك الموظفين بلا تكليف'); roster.status = 'cancelled';
    } else throw new RuleError('ACTION', 'إجراء جدول غير مدعوم');
    result ??= roster;
  } else if (command.type === 'demand.save') {
    const d = selectFields(data.value, ['id', 'workDate', 'siteCode', 'branch', 'skill', 'start', 'end', 'minimum', 'target', 'maximum', 'severity', 'costCenter']);
    assertAccess(actor, 'draft', d); date(d.workDate); interval(d.start, d.end); activeVersion(state.sites, d.siteCode, d.workDate);
    requireRule([d.minimum, d.target, d.maximum].every(n => Number.isInteger(n) && n >= 0 && n <= 10000) && d.minimum <= d.target && d.target <= d.maximum && ['warning', 'exception', 'blocker'].includes(d.severity), 'DEMAND', 'حدود الاحتياج أو شدته غير صحيحة');
    if (d.id) { const old = find(state.demands, d.id); assertAccess(actor, 'draft', old); before = structuredClone(old); Object.assign(old, d); result = old; }
    else { result = { ...d, id }; state.demands.push(result); }
  } else if (command.type === 'exception.approve') {
    const roster = find(state.rosters, data.rosterId); authorizeRoster(actor, 'exception', roster, state);
    const issue = validateRoster(state, roster).find(i => i.key === data.issueKey);
    requireRule(data.version === roster.version && issue?.severity === 'exception', 'MANDATORY', 'القيد الملزم لا يمكن تجاوزه، أو تغير الإصدار');
    result = { id, rosterId: roster.id, rosterVersion: roster.version, issueKey: issue.key, employeeId: issue.employeeId, status: 'approved', actor: actor.id, at: now, reason: command.reason }; state.exceptions.push(result);
  } else if (command.type === 'leave.save') {
    const l = selectFields(data.value, ['id', 'employeeId', 'start', 'end', 'paid', 'leaveType', 'source', 'sourceId', 'sourceVersion']);
    interval(l.start, l.end); leaveScopes(state, l).forEach(e => assertAccess(actor, 'leave', e));
    requireRule(typeof l.paid === 'boolean' && l.source && l.sourceId && Number.isInteger(l.sourceVersion), 'LEAVE_SOURCE', 'مصدر الإجازة وإصداره ونوع الدفع مطلوبة');
    const existing = state.leaves.find(x => x.source === l.source && x.sourceId === l.sourceId && x.sourceVersion === l.sourceVersion);
    requireRule(!existing, 'LEAVE_DUPLICATE', 'إصدار الإجازة مستلم بالفعل');
    result = { ...l, id, version: l.sourceVersion, status: 'pending', reason: command.reason, createdBy: actor.id, createdAt: now }; state.leaves.push(result);
  } else if (command.type === 'leave.approve' || command.type === 'leave.cancel') {
    const leave = find(state.leaves, data.id); leaveScopes(state, leave).forEach(e => { assertAccess(actor, 'leave', e); assertAccess(actor, 'approve', e); }); before = structuredClone(leave);
    requireRule(command.type === 'leave.approve' ? leave.status === 'pending' : leave.status === 'approved', 'LEAVE_STATE', 'حالة الإجازة لا تسمح بالإجراء');
    leave.status = command.type === 'leave.approve' ? 'approved' : 'cancelled'; leave.approvedBy = actor.id; leave.approvedAt = now; leave.decisionReason = command.reason;
    leave.overlayRosterIds = state.rosters.filter(r => r.status === 'published' && r.assignments.some(a => a.employeeId === leave.employeeId && a.dayType === 'WORK' && overlap(interval(a.start, a.end), interval(leave.start, leave.end)))).map(r => r.id);
    const affected = publishedAssignments(state).filter(a => a.employeeId === leave.employeeId && a.dayType === 'WORK');
    const quantity = affected.reduce((n, a) => n + minutes(intersect(requiredIntervals(a), [interval(leave.start, leave.end)])), 0);
    state.deliveries.push({ id, kind: 'leave_balance', employeeId: leave.employeeId, workDate: leave.start.slice(0, 10), sourceId: leave.id, sourceVersion: leave.version, quantities: { plannedMinutes: command.type === 'leave.cancel' ? -quantity : quantity }, status: 'pending', reason: command.reason, at: now });
    notify(state, id, leave.employeeId, 'leave_changed', now, { leaveId: leave.id }); result = leave;
  } else if (command.type === 'punch.ingest') {
    requireRule(Array.isArray(data.events) && data.events.length > 0 && data.events.length <= 10000, 'PUNCH_BATCH', 'دفعة البصمات غير صحيحة');
    const published = publishedAssignments(state), seen = new Map(state.punches.map(p => [canonical([p.source, p.sourceEventId]), p]));
    let count = 0;
    for (const [index, value] of data.events.entries()) {
      const p = selectFields(value, ['employeeId', 'at', 'kind', 'siteCode', 'source', 'sourceEventId', 'legacyId']);
      instant(p.at); requireRule(p.siteCode === undefined || typeof p.siteCode === 'string', 'PUNCH_SITE', 'رمز موقع البصمة غير صحيح');
      p.siteCode = p.siteCode ?? '';
      p.workDate = punchWorkDate(state, p, published);
      p.siteUnverified = !effectiveRevisions(state.sites, p.workDate).some(s => s.code === p.siteCode && s.status === 'active');
      assertAccess(actor, 'punch', employeeScope(state, p.employeeId, p.workDate));
      requireRule(['in', 'out', 'break_start', 'break_end', 'unknown'].includes(p.kind) && typeof p.source === 'string' && typeof p.sourceEventId === 'string' && p.sourceEventId.length > 0, 'PUNCH_SOURCE', 'نوع البصمة ومصدرها ومعرف المصدر مطلوبة');
      const key = canonical([p.source, p.sourceEventId]), old = seen.get(key);
      if (old) { requireRule(canonical(selectFields(old, Object.keys(p))) === canonical(p), 'SOURCE_REUSE', 'معرف مصدر البصمة مستخدم ببيانات مختلفة'); continue; }
      const saved = { ...p, id: `${id}:${index}`, receivedAt: now, receivedBy: actor.id };
      state.punches.push(saved); seen.set(key, saved); count++;
    }
    result = { count };
  } else if (command.type === 'correction.request') {
    const punch = find(state.punches, data.punchId); assertAccess(actor, 'correct', employeeScope(state, punch.employeeId, punch.workDate ?? punch.at.slice(0, 10)));
    const replacement = selectFields(data.replacement ?? {}, ['at', 'kind', 'siteCode']);
    if (replacement.at) instant(replacement.at); requireRule(!replacement.kind || ['in', 'out'].includes(replacement.kind), 'KIND', 'نوع البصمة غير صحيح');
    result = { id, punchId: punch.id, employeeId: punch.employeeId, replacement, exclude: data.exclude === true, assignmentKey: data.assignmentKey || null, status: 'pending', sequence: state.corrections.filter(c => c.punchId === punch.id).length + 1, reason: command.reason, createdBy: actor.id, at: now }; state.corrections.push(result);
  } else if (command.type === 'correction.approve') {
    const c = find(state.corrections, data.id), raw = find(state.punches, c.punchId); const scope = employeeScope(state, c.employeeId, raw.workDate ?? raw.at.slice(0, 10));
    assertAccess(actor, 'correct', scope); assertAccess(actor, 'attendance_approve', scope);
    requireRule(c.status === 'pending' && c.createdBy !== actor.id, 'CORRECTION_APPROVER', 'التصحيح يحتاج مراجعًا آخر ولم يعتمد من قبل');
    before = structuredClone(c); c.status = 'approved'; c.approvedBy = actor.id; c.approvedAt = now; result = c;
  } else if (command.type === 'attendance.calculate') {
    const assignments = publishedAssignments(state), a = assignments.find(a => a.key === data.assignmentKey);
    requireRule(a, 'PUBLISHED_REQUIRED', 'يلزم إسناد منشور لحساب الحضور'); assertAccess(actor, 'recalculate', a);
    const previous = state.results.filter(r => r.assignmentKey === a.key).at(-1);
    requireRule(!previous?.approval || previous.approval.status !== 'approved' || state.payrollPeriods.some(p => p.status === 'closed' && a.workDate >= p.from && a.workDate <= p.to), 'ATTENDANCE_LOCKED', 'الحضور معتمد؛ استخدم إعادة الفتح أو تسوية دورة مقفلة');
    const nearby = assignments.filter(b => b.employeeId === a.employeeId);
    const raw = state.punches.filter(p => p.employeeId === a.employeeId), matched = matchPunches(nearby, raw, state.corrections);
    const calculated = calculateAttendance(state, a, matched.byAssignment[a.key] ?? [], now);
    const relevantErrors = matched.exceptions.filter(e => {
      const p = raw.find(p => p.id === e.punchId); return p && instant(p.at) >= instant(a.start) - a.shift.windowBefore * 60000 && instant(p.at) <= instant(a.end) + a.shift.windowAfter * 60000;
    });
    calculated.issues.push(...relevantErrors);
    if (previous && canonical(previous.calculation) === canonical(calculated)) { result = previous; }
    else {
      result = { ...calculated, id, version: (previous?.version ?? 0) + 1, calculation: calculated, calculatedAt: now, calculatedBy: actor.id, previousId: previous?.id ?? null, approval: { status: 'open' }, engine: ENGINE_VERSION, reason: command.reason };
      state.results.push(result);
    }
  } else if (['attendance.approve', 'attendance.reopen', 'attendance.overtime'].includes(command.type)) {
    const r = find(state.results, data.id), e = employeeScope(state, r.employeeId, r.workDate); before = structuredClone(r);
    assertAccess(actor, command.type === 'attendance.reopen' ? 'attendance_reopen' : 'attendance_approve', e);
    requireRule(state.results.filter(x => x.assignmentKey === r.assignmentKey).at(-1)?.id === r.id, 'RESULT_STALE', 'توجد نتيجة أحدث؛ راجعها أولًا');
    if (command.type === 'attendance.reopen') {
      requireRule(r.approval.status === 'approved', 'STATE', 'الحضور غير معتمد');
      requireRule(!state.payrollPeriods.some(p => p.status === 'closed' && r.workDate >= p.from && r.workDate <= p.to), 'PAYROLL_LOCKED', 'الرواتب مقفلة؛ أعد الحساب وأنشئ تسوية مستقلة');
      r.approval = { status: 'reopened', previous: r.approval, actor: actor.id, at: now, reason: command.reason };
    } else if (command.type === 'attendance.overtime') {
      requireRule(r.approval.status !== 'approved' && Number.isFinite(data.minutes) && data.minutes >= 0 && data.minutes <= r.eligibleOvertimeMinutes, 'OVERTIME', 'الإضافي المعتمد يجب ألا يتجاوز المؤهل، وقبل اعتماد الحضور'); r.approvedOvertimeMinutes = data.minutes;
    } else {
      requireRule(r.approval.status !== 'approved' && !r.issues.length && !['pending', 'incomplete', 'unscheduled'].includes(r.status), 'ATTENDANCE_ISSUES', 'يلزم معالجة نواقص الحضور وانتهاء نافذة المصدر قبل الاعتماد');
      // Recompute with current approved corrections, leave and published source; stale calculations cannot be approved.
      const all = publishedAssignments(state), a = all.find(a => a.key === r.assignmentKey); requireRule(a, 'ROSTER_CHANGED', 'تغير الإسناد المنشور');
      const match = matchPunches(all.filter(a => a.employeeId === r.employeeId), state.punches.filter(p => p.employeeId === r.employeeId), state.corrections);
      const fresh = calculateAttendance(state, a, match.byAssignment[a.key] ?? [], now);
      requireRule(canonical(fresh) === canonical(r.calculation), 'RESULT_STALE', 'تغيرت البصمات أو الإجازات أو الجدول؛ أعد الحساب');
      requireRule(!a.policy.separateApprover || r.calculatedBy !== actor.id, 'SEPARATION', 'الحساب يحتاج مراجعًا آخر');
      r.approval = { status: 'approved', actor: actor.id, at: now, version: r.version, reason: command.reason };
      notify(state, id, r.employeeId, 'attendance_approved', now, { resultId: r.id });
    }
    result = r;
  } else if (command.type === 'payroll.period') {
    assertAccess(actor, 'payroll_close'); date(data.from); date(data.to); requireRule(data.to >= data.from, 'PERIOD', 'فترة الرواتب غير صحيحة');
    requireRule(['open', 'closed'].includes(data.status), 'PERIOD_STATUS', 'حالة الرواتب غير صحيحة');
    const old = data.id ? find(state.payrollPeriods, data.id) : null;
    requireRule(!old || old.status !== 'closed', 'LOCKED', 'الفترة المقفلة محفوظة؛ تستخدم دورة تسوية جديدة');
    requireRule(!state.payrollPeriods.some(p => p.id !== old?.id && p.from <= data.to && p.to >= data.from), 'PERIOD_OVERLAP', 'فترات الرواتب متداخلة');
    result = { id: old?.id ?? id, from: data.from, to: data.to, status: data.status, reason: command.reason, actor: actor.id, at: now }; before = old;
    if (old) Object.assign(old, result); else state.payrollPeriods.push(result);
  } else if (command.type === 'payroll.deliver') {
    const r = find(state.results, data.resultId); assertAccess(actor, 'payroll', employeeScope(state, r.employeeId, r.workDate));
    const period = find(state.payrollPeriods, data.periodId);
    requireRule(period.status === 'open', 'PAYROLL_CLOSED', 'دورة التسليم مقفلة');
    const originalPeriod = state.payrollPeriods.find(p => r.workDate >= p.from && r.workDate <= p.to);
    requireRule(originalPeriod && (originalPeriod.id === period.id || originalPeriod.status === 'closed'), 'PERIOD_MISMATCH', 'تسوية الفترة السابقة تتطلب إقفال دورتها الأصلية');
    requireRule(!state.deliveries.some(d => d.kind === 'payroll' && d.resultId === r.id && d.status !== 'rejected'), 'DELIVERY_EXISTS', 'هذه النتيجة مسلمة بالفعل');
    const previous = state.deliveries.filter(d => d.kind === 'payroll' && d.assignmentKey === r.assignmentKey);
    requireRule(!previous.some(d => ['pending', 'sent'].includes(d.status)), 'DELIVERY_PENDING', 'انتظر قرار التسليم السابق قبل إرسال فرق جديد');
    const quantities = payrollDelta(r, previous);
    result = { id, kind: 'payroll', resultId: r.id, resultVersion: r.version, assignmentKey: r.assignmentKey, employeeId: r.employeeId, employmentId: r.employmentId,
      workDate: r.workDate, branch: r.branch, siteCode: r.siteCode, periodId: period.id, originalPeriodId: originalPeriod.id, adjustmentOf: previous.filter(d => d.status === 'accepted').map(d => d.id),
      quantities, costCenter: r.costCenter, policyId: r.sources.policyId, policyVersion: r.sources.policyVersion, status: 'pending', reason: command.reason, at: now, actor: actor.id, idempotencyKey: id };
    state.deliveries.push(result);
  } else if (command.type === 'delivery.respond') {
    const d = find(state.deliveries, data.id); assertAccess(actor, d.kind === 'payroll' ? 'payroll' : 'leave', employeeScope(state, d.employeeId, d.workDate));
    requireRule(['pending', 'sent'].includes(d.status) && ['accepted', 'rejected'].includes(data.status), 'DELIVERY_STATE', 'حالة التسليم لا تسمح بالقرار'); requiredText(data.externalReference, 'مرجع النظام المستلم مطلوب');
    before = structuredClone(d); d.status = data.status; d.externalReference = data.externalReference; d.responseAt = now; d.responseReason = command.reason; result = d;
  } else if (command.type.startsWith('request.') || command.type.startsWith('open.')) {
    result = executeSelfService(state, command, actor, now);
  } else if (command.type === 'notification.retry' || command.type === 'notification.respond' || command.type === 'notification.read') {
    const n = find(state.notifications, data.id); before = structuredClone(n);
    if (command.type === 'notification.read') { requireRule(n.userId === actor.id, 'FORBIDDEN', 'الإشعار ليس لك'); n.readAt = now; }
    else {
      assertAccess(actor, 'notify', employeeScope(state, n.employeeId));
      if (command.type === 'notification.retry') { requireRule(n.status === 'failed', 'STATE', 'الإشعار ليس فاشلًا'); n.status = 'pending'; }
      else { requireRule(['delivered', 'failed'].includes(data.status) && n.status !== 'delivered', 'STATE', 'حالة التسليم غير صحيحة'); n.status = data.status; n.attempts++; n.lastAttempt = now; n.error = data.status === 'failed' ? command.reason : null; }
    }
    result = n;
  } else throw new RuleError('UNKNOWN_COMMAND', 'عملية غير مدعومة');
  requireRule(canonical(state).length <= 20_000_000, 'CAPACITY', 'تجاوزت مساحة العمل حد المعالجة؛ يلزم تقسيم تخزين البيانات قبل المتابعة');
  return { state, result, event: { id, type: command.type, actor: actor.id, at: now, reason: command.reason, before, after: structuredClone(result) } };
}

function executeSelfService(state, command, actor, now) {
  const d = command.payload, id = command.operationId;
  if (command.type === 'open.create') {
    const roster = find(state.rosters, d.rosterId); authorizeRoster(actor, 'draft', roster, state);
    requireRule(roster.status === 'published', 'OPEN_ROSTER', 'الشاغر يجب أن يرتبط بنسخة جدول منشورة');
    const value = selectFields(d, ['rosterId', 'workDate', 'shiftId', 'shiftVersion', 'siteCode', 'skill', 'slots', 'deadline']);
    date(value.workDate); instant(value.deadline);
    requireRule(value.workDate >= roster.from && value.workDate <= roster.to, 'OPEN_DATE', 'تاريخ الشاغر خارج نطاق الجدول المنشور');
    const site = activeVersion(state.sites, value.siteCode, value.workDate), shift = atVersion(state.shifts, value.shiftId, value.shiftVersion);
    assertAccess(actor, 'draft', { branch: site.branch });
    requireRule(effective(shift, value.workDate) && activeVersion(state.shifts, shift.code, value.workDate).version === shift.version, 'OPEN_SHIFT_VERSION', 'الشفت المطلوب غير ساري في تاريخ الشاغر');
    const start = instant(zonedInstant(value.workDate, shift.startTime, site.timezone, shift.disambiguation).at);
    requireRule(instant(value.deadline) < start, 'OPEN_DEADLINE', 'مهلة شغل الشاغر يجب أن تسبق بداية الشفت');
    requireRule(Number.isInteger(value.slots) && value.slots > 0 && instant(value.deadline) > instant(now), 'OPEN_SHIFT', 'عدد الأماكن أو آخر موعد غير صحيح');
    const open = { ...value, id, status: 'open', claims: [], reason: command.reason }; state.openShifts.push(open); return open;
  }
  if (command.type === 'request.create') {
    requireRule(employeeScope(state, d.employeeId).userId === actor.id, 'OWNERSHIP', 'يمكنك طلب تغيير جدولك الشخصي فقط');
    requireRule(['swap', 'give', 'change', 'open'].includes(d.kind), 'REQUEST_KIND', 'نوع الطلب غير صحيح');
    const r = { id, kind: d.kind, employeeId: d.employeeId, otherEmployeeId: d.otherEmployeeId ?? null, assignmentKey: d.assignmentKey ?? null,
      otherAssignmentKey: d.otherAssignmentKey ?? null, openId: d.openId ?? null, proposedShiftId: d.proposedShiftId ?? null, proposedShiftVersion: d.proposedShiftVersion ?? null,
      status: ['swap', 'give'].includes(d.kind) ? 'peer_pending' : 'review', reason: command.reason, createdBy: actor.id, at: now, approvals: [], managerApprovals: [] };
    if (d.kind === 'open') {
      const o = find(state.openShifts, d.openId); requireRule(o.status === 'open' && instant(o.deadline) > instant(now), 'OPEN_CLOSED', 'الشاغر مغلق أو انتهت مهلته');
      const target = find(state.rosters, o.rosterId); requireRule(target.status === 'published', 'OPEN_ROSTER', 'تغير الجدول المنشور للشاغر');
      const policy = atVersion(state.policies, target.policyId, target.policyVersion), shift = atVersion(state.shifts, o.shiftId, o.shiftVersion);
      const trial = assignmentFromShift(state, d.employeeId, o.workDate, shift, o.siteCode, '', 1, policy, 'open');
      requireRule(instant(trial.start) > instant(now) + (policy.changeNoticeMinutes ?? 0) * 60000, 'OPEN_EXPIRED', 'بدأ الشفت أو تجاوز مهلة إشعار الموظف');
      r.rosterId = o.rosterId; r.rosterVersion = target.version; r.workDate = o.workDate; r.siteCode = o.siteCode;
    } else {
      const a = publishedAssignments(state).find(a => a.key === d.assignmentKey && a.employeeId === d.employeeId);
      requireRule(a && a.dayType === 'WORK' && instant(a.start) > instant(now) + (a.policy.changeNoticeMinutes ?? 0) * 60000, 'REQUEST_TIME', 'الإسناد غير ساري أو تجاوز مهلة الطلب');
      r.rosterId = a.rosterId; r.rosterVersion = a.rosterVersion; r.workDate = a.workDate; r.siteCode = a.siteCode;
      if (d.kind === 'swap') {
        const b = publishedAssignments(state).find(b => b.key === d.otherAssignmentKey && b.employeeId === d.otherEmployeeId);
        requireRule(b && b.dayType === 'WORK' && b.employeeId !== a.employeeId && instant(b.start) > instant(now), 'SWAP_PARTNER', 'الشفت الآخر غير متاح للمبادلة');
        r.otherRosterId = b.rosterId; r.otherRosterVersion = b.rosterVersion; r.otherWorkDate = b.workDate;
      }
      if (d.kind === 'give') requireRule(d.otherEmployeeId && d.otherEmployeeId !== d.employeeId, 'PARTNER', 'اختر الموظف المستلم');
    }
    assertAccess(actor, 'request', employeeScope(state, d.employeeId, r.workDate));
    state.requests.push(r); if (r.otherEmployeeId) notify(state, id, r.otherEmployeeId, 'request_peer', now, { requestId: r.id }); return r;
  }
  const r = find(state.requests, d.id);
  if (command.type === 'request.peer') {
    requireRule(r.status === 'peer_pending' && employeeScope(state, r.otherEmployeeId).userId === actor.id, 'PEER', 'الطلب لا ينتظر موافقتك');
    requireRule(typeof d.accept === 'boolean', 'DECISION', 'حدد قبولًا أو رفضًا'); r.status = d.accept ? 'review' : 'rejected'; r.peerAt = now; r.peerActor = actor.id; return r;
  }
  if (command.type === 'request.withdraw') {
    requireRule(r.createdBy === actor.id && ['review', 'peer_pending', 'needs_review'].includes(r.status), 'WITHDRAW', 'لا يمكن سحب هذا الطلب'); r.status = 'withdrawn'; return r;
  }
  requireRule(command.type === 'request.approve' || command.type === 'request.reject', 'ACTION', 'إجراء طلب غير صحيح');
  assertAccess(actor, 'request_approve', employeeScope(state, r.employeeId, r.workDate));
  if (r.otherEmployeeId) assertAccess(actor, 'request_approve', employeeScope(state, r.otherEmployeeId, r.otherWorkDate ?? r.workDate));
  requireRule(r.status === 'review', 'REQUEST_STATE', 'الطلب لا ينتظر اعتماد المدير');
  if (command.type === 'request.reject') { r.status = 'rejected'; r.decisionReason = command.reason; notify(state, id, r.employeeId, 'request_rejected', now); return r; }
  // One manager must hold both scopes; narrower delegates cannot approve the other employee implicitly.
  const originals = [find(state.rosters, r.rosterId)]; if (r.otherRosterId && r.otherRosterId !== r.rosterId) originals.push(find(state.rosters, r.otherRosterId));
  requireRule(originals.every(o => o.status === 'published') && originals[0].version === r.rosterVersion && (!r.otherRosterId || find(state.rosters, r.otherRosterId).version === r.otherRosterVersion), 'REQUEST_STALE', 'الإسناد تغير؛ يلزم إعادة تقييم الطلب');
  originals.forEach(o => authorizeRoster(actor, 'publish', o, state));
  // Effective access must also cover employees about to be ADDED to a published roster.
  assertAccess(actor, 'publish', employeeScope(state, r.employeeId, r.workDate));
  if (r.otherEmployeeId) assertAccess(actor, 'publish', employeeScope(state, r.otherEmployeeId, r.otherWorkDate ?? r.workDate));
  if (r.otherWorkDate) assertAccess(actor, 'publish', employeeScope(state, r.employeeId, r.otherWorkDate));
  const stages = originals.flatMap(o => atVersion(state.policies, o.policyId, o.policyVersion).approvalRoles.map((role, stage) =>
    ({ rosterId: o.id, originalVersion: o.version, stage, role })));
  const approvals = r.managerApprovals ?? [];
  const next = stages.find(s => !approvals.some(a => a.rosterId === s.rosterId && a.stage === s.stage));
  requireRule(next && actor.roles.includes(next.role), 'APPROVAL_ROLE', 'المرحلة التالية من طلب التغيير تحتاج صاحب دور اعتماد مختلف');
  requireRule(originals.every(o => !atVersion(state.policies, o.policyId, o.policyVersion).separateApprover || r.createdBy !== actor.id), 'SEPARATION', 'صاحب الطلب لا يعتمد تغييره');
  r.managerApprovals = [...approvals, { ...next, actor: actor.id, at: now, reason: command.reason }];
  if (r.managerApprovals.length < stages.length) return r;
  const revisions = originals.map((o, i) => ({ ...structuredClone(o), id: `${id}:${i}`, baseId: o.id, version: 1, status: 'draft', approvals: [], history: [], createdBy: r.createdBy, reason: command.reason }));
  const first = revisions[0];
  if (r.kind === 'open') {
    const o = find(state.openShifts, r.openId); requireRule(o.status === 'open' && o.claims.length < o.slots && instant(o.deadline) > instant(now), 'OPEN_FILLED', 'المكان الأخير شُغل أو انتهت المهلة');
    const policy = atVersion(state.policies, first.policyId, first.policyVersion), shift = atVersion(state.shifts, o.shiftId, o.shiftVersion);
    const row = assignmentFromShift(state, r.employeeId, o.workDate, shift, o.siteCode, '', 1, policy, 'open');
    requireRule(instant(row.start) > instant(now) + (policy.changeNoticeMinutes ?? 0) * 60000, 'OPEN_EXPIRED', 'بدأ الشفت؛ لا يمكن نشر إسناد بأثر رجعي من طلب شاغر');
    requireRule(!o.skill || row.skills.some(s => typeof s === 'string' ? s === o.skill : s.code === o.skill && s.from <= o.workDate && (!s.to || s.to >= o.workDate)), 'SKILL', 'المهارة المطلوبة غير سارية');
    requireRule(!first.assignments.some(a => a.employeeId === r.employeeId && a.workDate === o.workDate && a.dayType === 'WORK'), 'OPEN_ASSIGNED', 'الموظف لديه شفت عمل في تاريخ الشاغر');
    first.employeeIds = [...new Set([...first.employeeIds, r.employeeId])]; first.assignments = first.assignments.filter(a => a.employeeId !== r.employeeId || a.workDate !== o.workDate); first.assignments.push(row);
    o.claims.push({ employeeId: r.employeeId, requestId: r.id, at: now }); if (o.claims.length === o.slots) o.status = 'filled';
  } else {
    const a = findAssignment(first, r.assignmentKey), second = revisions.find(x => x.baseId === r.otherRosterId) ?? first, b = r.kind === 'swap' ? findAssignment(second, r.otherAssignmentKey) : null;
    requireRule(instant(a.start) > instant(now) && (!b || instant(b.start) > instant(now)), 'REQUEST_EXPIRED', 'بدأ الشفت؛ لم يعد التغيير متاحًا');
    const transfer = (old, employeeId) => assignmentFromShift(state, employeeId, old.workDate, old.shift, old.siteCode, '', old.periodNo, old.policy, r.kind);
    first.assignments = first.assignments.filter(x => x.key !== a.key);
    if (b) second.assignments = second.assignments.filter(x => x.key !== b.key);
    if (r.kind === 'change') first.assignments.push(assignmentFromShift(state, r.employeeId, a.workDate, atVersion(state.shifts, r.proposedShiftId, r.proposedShiftVersion), a.siteCode, a.costCenter, a.periodNo, a.policy, 'change'));
    else {
      first.employeeIds = [...new Set([...first.employeeIds, r.otherEmployeeId])]; first.assignments.push(transfer(a, r.otherEmployeeId));
      if (b) { second.employeeIds = [...new Set([...second.employeeIds, r.employeeId])]; second.assignments.push(transfer(b, r.employeeId)); }
      else first.assignments.push(explicitDay(state, r.employeeId, a.workDate, 'OFF', a.policy, 'give'));
    }
  }
  // Validate BOTH post-swap rosters against the post-swap world before activating either.
  const preview = structuredClone(state); originals.forEach(o => { find(preview.rosters, o.id).status = 'superseded'; });
  for (const rev of revisions) preview.rosters.push({ ...rev, status: 'published' });
  for (const rev of revisions) {
    authorizeRoster(actor, 'publish', rev, preview);
    const problems = validateRoster(preview, rev).filter(i => i.severity !== 'warning'); requireRule(!problems.length, 'REQUEST_CONFLICT', problems[0]?.message, { issues: problems });
    const policy = atVersion(state.policies, rev.policyId, rev.policyVersion);
    requireRule(policy.approvalRoles.every((role, stage) => r.managerApprovals.some(a => a.rosterId === rev.baseId && a.originalVersion === find(state.rosters, rev.baseId).version && a.role === role && a.stage === stage)), 'APPROVAL_CHAIN', 'موافقات الطلب لا تطابق نسخة المصدر');
    rev.approvals = policy.approvalRoles.map((role, stage) => {
      const approval = r.managerApprovals.find(a => a.rosterId === rev.baseId && a.stage === stage);
      return { role, stage, actor: approval.actor, at: approval.at, reason: approval.reason, version: 1, sourceVersion: approval.originalVersion, requestId: r.id };
    }); rev.status = 'published'; rev.publishedAt = now; rev.publishedBy = actor.id;
  }
  originals.forEach(o => { o.status = 'superseded'; o.supersededAt = now; }); state.rosters.push(...revisions);
  r.status = 'executed'; r.executedAt = now; r.approvedBy = actor.id; r.resultRosterIds = revisions.map(x => x.id);
  notify(state, id, r.employeeId, 'request_executed', now); if (r.otherEmployeeId) notify(state, id, r.otherEmployeeId, 'request_executed', now); return r;
}
function findAssignment(roster, key) { const a = roster.assignments.find(x => x.key === key && x.dayType === 'WORK'); requireRule(a, 'ASSIGNMENT', 'الإسناد الأصلي غير موجود'); return a; }
