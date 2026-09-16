import { requireRule } from './time.mjs';
import { dates } from './time.mjs';
import { effectiveRevisions } from './planning.mjs';

export const ACTIONS = ['read', 'configure', 'link', 'draft', 'import', 'approve', 'publish', 'revise', 'exception', 'request', 'request_approve', 'punch', 'correct', 'leave', 'recalculate', 'attendance_approve', 'attendance_reopen', 'payroll', 'payroll_close', 'export', 'audit', 'notify', 'access'];
export function allowed(actor, action, entity = {}) {
  return actor?.grants?.some(g => g.actions.includes(action) &&
    (!g.employeeId || g.employeeId === entity.employeeId) &&
    (!g.branch || g.branch === entity.branch) && (!g.department || g.department === entity.department) && (!g.team || g.team === entity.team));
}
export function assertAccess(actor, action, entity = {}) { requireRule(allowed(actor, action, entity), 'FORBIDDEN', 'غير مصرح بهذا الإجراء أو نطاق البيانات'); }
export function allowedField(actor, field, entity = {}) {
  return actor?.grants?.some(g => g.fields?.includes(field) && (!g.employeeId || g.employeeId === entity.employeeId) && (!g.branch || g.branch === entity.branch) && (!g.department || g.department === entity.department) && (!g.team || g.team === entity.team));
}
export function employeeScope(state, id, workDate) {
  const records = workDate ? effectiveRevisions(state.employments, workDate) : state.employments;
  return records.filter(e => e.employeeId === id).sort((a, b) => b.version - a.version)[0] ?? { employeeId: id, branch: '__unknown__' };
}
export function authorizeRoster(actor, action, roster, state) {
  requireRule(roster.employeeIds.length > 0, 'ROSTER_SCOPE', 'اختر موظفًا واحدًا على الأقل');
  for (const id of roster.employeeIds) {
    const records = [...new Map(dates(roster.from, roster.to).flatMap(day => effectiveRevisions(state.employments, day).filter(e => e.employeeId === id).map(e => [e.id + ':' + e.version, e]))).values()];
    requireRule(records.length > 0, 'FORBIDDEN', 'ارتباط وظيفي غير متاح');
    records.forEach(e => assertAccess(actor, action, e));
  }
}
/** Server response projection: no draft, colleague reasons, payroll or access details leak through self-service. */
export function projectState(state, actor) {
  const visible = state.employments.filter(e => allowed(actor, 'read', e));
  const ids = new Set(visible.map(e => e.employeeId));
  const planner = actor.grants.some(g => g.actions.some(a => ['draft', 'approve', 'publish', 'audit'].includes(a)));
  const scopeOf = record => employeeScope(state, record.employeeId, record.workDate ?? record.start?.slice(0, 10) ?? record.at?.slice(0, 10));
  const own = record => scopeOf(record).userId === actor.id;
  const canEvidence = record => own(record) || ['punch', 'correct', 'recalculate', 'attendance_approve', 'payroll'].some(a => allowed(actor, a, scopeOf(record)));
  const canResult = record => own(record) || ['recalculate', 'attendance_approve', 'payroll'].some(a => allowed(actor, a, scopeOf(record)));
  const scrub = (record, entity) => {
    const x = structuredClone(record);
    if (!allowedField(actor, 'cost', entity)) { delete x.costCenter; delete x.costCenterCode; }
    if (!allowedField(actor, 'leave_detail', entity)) { delete x.reason; delete x.leaveType; }
    return x;
  };
  const rosterManageable = r => r.employeeIds.every(id => {
    const records = [...new Map(dates(r.from, r.to).flatMap(day => effectiveRevisions(state.employments, day)
      .filter(e => e.employeeId === id).map(e => [e.id + ':' + e.version, e]))).values()];
    return records.length > 0 && records.every(e => allowed(actor, 'draft', e));
  });
  const rosters = state.rosters.filter(r => r.status === 'published' || planner && rosterManageable(r)).map(r => ({ ...r,
    employeeIds: r.employeeIds.filter(id => ids.has(id)),
    assignments: r.assignments.filter(a => ids.has(a.employeeId) && allowed(actor, 'read', a)).map(a => {
      const x = structuredClone(a); if (!allowedField(actor, 'cost', a)) delete x.costCenter; return x;
    }), history: planner && rosterManageable(r) ? r.history.map(h => ({ ...h, assignments: h.assignments.filter(a => ids.has(a.employeeId)).map(a => { const x = structuredClone(a); if (!allowedField(actor, 'cost', a)) delete x.costCenter; return x; }) })) : [],
    approvals: planner && rosterManageable(r) ? r.approvals : [], reason: planner && rosterManageable(r) ? r.reason : '',
  })).filter(r => r.employeeIds.length);
  return { ...state, sites: state.sites.filter(s => allowed(actor, 'read', { branch: s.branch }) || visible.some(e => e.branch === s.branch && (e.allowedSites ?? []).includes(s.code))).map(s => allowedField(actor, 'cost', { branch: s.branch }) ? s : { ...s, costCenters: [] }), employments: visible.map(e => scrub(e, e)), rosters,
    bindings: planner ? state.bindings.filter(b => (b.employeeIds ?? []).some(id => ids.has(id)) || actor.grants.some(g => !g.branch && !g.employeeId && g.actions.includes('read')))
      .map(b => ({ ...b, employeeIds: (b.employeeIds ?? []).filter(id => ids.has(id)) })) : [],
    leaves: state.leaves.filter(l => ids.has(l.employeeId) && (own(l) || ['leave', 'draft', 'approve', 'recalculate', 'attendance_approve'].some(a => allowed(actor, a, scopeOf(l))))).map(l => scrub(l, scopeOf(l))),
    requests: state.requests.filter(r => r.createdBy === actor.id || scopeOf(r).userId === actor.id || r.otherEmployeeId && employeeScope(state, r.otherEmployeeId).userId === actor.id ||
      allowed(actor, 'request_approve', scopeOf(r)) && (!r.otherEmployeeId || allowed(actor, 'request_approve', employeeScope(state, r.otherEmployeeId, r.otherWorkDate ?? r.workDate)))),
    results: state.results.filter(r => ids.has(r.employeeId) && canResult(r)).map(r => scrub(r, scopeOf(r))),
    corrections: state.corrections.filter(c => ids.has(c.employeeId) && canEvidence(c)).map(c => scrub(c, scopeOf(c))),
    punches: (state.punches ?? []).filter(p => ids.has(p.employeeId) && canEvidence(p)),
    deliveries: state.deliveries.filter(d => ids.has(d.employeeId) && allowed(actor, 'payroll', scopeOf(d))).map(d => scrub(d, scopeOf(d))),
    payrollPeriods: actor.grants.some(g => g.actions.includes('payroll')) ? state.payrollPeriods : [],
    exceptions: planner ? state.exceptions.filter(e => e.employeeId ? ids.has(e.employeeId) && allowed(actor, 'read', scopeOf(e)) : rosters.some(r => r.id === e.rosterId)) : [],
    notifications: state.notifications.filter(n => n.userId === actor.id || (n.employeeId && ids.has(n.employeeId) && allowed(actor, 'notify', scopeOf(n)))),
    demands: planner ? state.demands.filter(d => allowed(actor, 'read', d)) : [],
    openShifts: state.openShifts.filter(o => planner && state.sites.some(s => s.code === o.siteCode && allowed(actor, 'read', { branch: s.branch })) || o.status === 'open' && visible.some(e => {
      const current = employeeScope(state, e.employeeId, o.workDate);
      return current.status === 'active' && allowed(actor, 'read', current) && (current.allowedSites ?? []).includes(o.siteCode) && (!o.skill || current.skills.some(s => (typeof s === 'string' ? s : s.code) === o.skill));
    })).map(o => { const x = { ...o }; delete x.claims; return x; }),
    swapOptions: state.rosters.filter(r => r.status === 'published').flatMap(r => r.assignments).filter(a => a.dayType === 'WORK' &&
      visible.some(e => e.branch === a.branch && e.employeeId !== a.employeeId) && state.employments.some(e => e.employeeId === a.employeeId && e.userId)).map(a => ({
      key: a.key, employeeId: a.employeeId, employeeCode: a.employeeCode, workDate: a.workDate, start: a.start, shiftCode: a.shift.code, siteCode: a.siteCode })),
  };
}
