/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { Button, CanButton, DataList, EditDialog, Fields, Panel, Status, useM08, useText } from './common';
import { definitionFields, initialDefinition, prepareDefinition, refs, parseRef, opts, textField, type Row, type Field } from './forms';
import { PRIORITIES, latest } from '@/lib/m08/planning.mjs';
import { ACTIONS } from '@/lib/m08/access.mjs';
import { supabase } from '@/integrations/supabase/client';
import { m08LegacyEmployees } from '@/lib/m08/functions';

export async function authHeaders() { const { data } = await supabase.auth.getSession(); if (!data.session) throw new Error('تسجيل الدخول مطلوب'); return { Authorization: `Bearer ${data.session.access_token}` }; }
export function Definitions({ kind }: { kind: string }) {
  const { state, lang, command } = useM08(); const t = useText(); const [editing, setEditing] = useState<Row | null>(null), [search, setSearch] = useState(''), [history, setHistory] = useState(false);
  const rows: Row[] = state[kind] ?? [], current = history ? rows : [...new Set(rows.map(r => r.id))].map(id => latest(rows, id));
  const edit = (r: Row, copy = false) => {
    const v = structuredClone(r); if (copy) { delete v.id; delete v.version; v.code = ''; v.status = 'draft'; }
    if (kind === 'templates') v.periods = v.periods.map((p: Row) => ({ ...p, shiftRef: `${p.shiftId}@${p.shiftVersion}` }));
    if (kind === 'patterns') v.days = v.days.map((d: Row) => ({ templateRef: `${d.id}@${d.version}` })); setEditing(v);
  };
  return <Panel title={t('التعريفات والسريان', 'Definitions and effective dates')}>
    <div className="flex flex-wrap items-center gap-3"><CanButton action="configure" icon="add" primary onClick={() => setEditing(initialDefinition(kind))}>{t('إضافة تعريف', 'Add definition')}</CanButton><input aria-label={t('بحث التعريفات', 'Search definitions')} placeholder={t('ابحث بالاسم أو الرمز', 'Search name or code')} value={search} onChange={e => setSearch(e.target.value)} className="h-10 rounded-lg border px-3" /><label className="text-sm"><input type="checkbox" checked={history} onChange={e => setHistory(e.target.checked)} /> {t('عرض جميع الإصدارات', 'All versions')}</label></div>
    {kind === 'policies' && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t('اعتمد قيم المنشأة وحزمة الدولة قبل التفعيل. حدود الساعات والسماح والإضافي لا تحمل قيمًا قانونية افتراضية.', 'Approve establishment values and the country package before activation. Work, grace and overtime limits have no assumed legal defaults.')}</p>}
    <DataList rows={current.filter(r => `${r.code} ${r.nameAr} ${r.nameEn}`.toLowerCase().includes(search.toLowerCase()))} columns={[
      { key: 'code', label: ['الرمز', 'Code'] }, { key: lang ? 'nameEn' : 'nameAr', label: ['الاسم', 'Name'] }, { key: 'version', label: ['الإصدار', 'Version'] }, { key: 'from', label: ['من', 'From'] }, { key: 'to', label: ['إلى', 'To'] }, { key: 'status', label: ['الحالة', 'Status'], render: r => <Status value={r.status} /> },
      { key: 'usage', label: ['إسنادات تستخدم هذا الإصدار', 'Assignments using this version'], render: r => state.rosters.flatMap((x: Row) => x.assignments).filter((a: Row) => kind === 'shifts' ? a.shiftId === r.id && a.shiftVersion === r.version : kind === 'policies' ? a.policyId === r.id && a.policyVersion === r.version : kind === 'sites' ? a.siteCode === r.code : false).length },
    ]} actions={r => <><CanButton action="configure" onClick={() => edit(r)}>{t('إصدار جديد', 'New version')}</CanButton><CanButton action="configure" onClick={() => edit(r, true)}>{t('نسخ', 'Copy')}</CanButton></>} />
    {editing && <EditDialog title={t('تعريف مؤرخ', 'Effective definition')} initial={editing} fields={definitionFields(kind, state, lang)} onClose={() => setEditing(null)} onSave={(value, reason) => command('definition.save', { kind, value: prepareDefinition(kind, value), expectedVersion: editing.version ?? 0 }, reason)} />}
  </Panel>;
}
export function Bindings() {
  const { state, command, lang, companyId } = useM08(); const t = useText(); const [tab, setTab] = useState('bindings'), [editing, setEditing] = useState<Row | null>(null), [candidates, setCandidates] = useState<Row[]>([]), [search, setSearch] = useState(''), [error, setError] = useState('');
  const es = [...new Set((state.employments as Row[]).map(e => e.id))].map(id => latest(state.employments, id));
  const fields: Field[] = tab === 'bindings' ? [
    textField('code', 'رمز الربط', 'Binding code'), textField('nameAr', 'الاسم العربي', 'Arabic name'), textField('nameEn', 'الاسم الإنجليزي', 'English name'),
    { ...textField('scope', 'مصدر التسكين', 'Assignment source', 'select'), options: opts(Object.keys(PRIORITIES)) }, textField('scopeValue', 'رمز الفريق / القسم / الفرع', 'Team / department / branch code', 'text', false),
    { ...textField('employeeIds', 'الموظفون للربط الفردي أو الموسمي', 'Employees for individual/seasonal binding', 'multi', false), options: es.map(e => ({ value: e.employeeId, label: `${e.code} · ${e.nameAr}` })) },
    { ...textField('patternRef', 'إصدار النمط', 'Pattern version', 'select'), options: refs(state.patterns, lang) }, { ...textField('policyRef', 'إصدار السياسة', 'Policy version', 'select'), options: refs(state.policies, lang) },
    textField('from', 'ساري من', 'Effective from', 'date'), textField('to', 'ساري إلى', 'Effective to', 'date', false), textField('anchor', 'تاريخ مرجع الدورة', 'Cycle anchor', 'date'), textField('offset', 'إزاحة الفريق بالأيام', 'Team offset in days', 'number'), textField('priority', 'الأولوية المؤرخة', 'Effective priority', 'number'),
    { ...textField('returnMode', 'العودة بعد الموسم', 'Season return', 'select'), options: opts(['continue', 'pause']) }, { ...textField('status', 'الحالة', 'Status', 'select'), options: opts(['active', 'stopped']) },
  ] : [
    { ...textField('employeeId', 'سجل الموظف الحالي', 'Existing employee', 'select'), options: [...candidates.map(e => ({ value: e.id, label: `${e.emp_no} · ${e.full_name}` })), ...es.map(e => ({ value: e.employeeId, label: `${e.code} · ${e.nameAr}` }))] },
    textField('code', 'رقم الموظف النصي', 'Employee text code'), textField('nameAr', 'الاسم العربي', 'Arabic name'), textField('nameEn', 'الاسم الإنجليزي', 'English name'), textField('branch', 'الفرع', 'Branch'), textField('department', 'القسم', 'Department'), textField('team', 'الفريق', 'Team'), textField('job', 'الوظيفة', 'Job'),
    { ...textField('siteCode', 'الموقع الأساسي', 'Default site', 'select'), options: state.sites.map((s: Row) => ({ value: s.code, label: s.nameAr })) }, textField('allowedSites', 'المواقع المصرح بها', 'Authorized site codes', 'tokens'), textField('costCenter', 'مركز التكلفة', 'Cost center'),
    { key: 'skills', label: ['المهارات وسريانها', 'Skills and effective dates'], type: 'rows', fields: [textField('code', 'رمز المهارة', 'Skill code'), textField('from', 'من', 'From', 'date'), textField('to', 'إلى', 'To', 'date', false)] },
    textField('userId', 'معرف حساب المستخدم للخدمة الذاتية', 'Self-service user ID', 'text', false), textField('contractMinutes', 'دقائق العمل التعاقدية أسبوعيًا', 'Contract weekly minutes', 'number'), textField('from', 'بداية الارتباط الوظيفي', 'Employment effective from', 'date'), textField('to', 'نهاية الارتباط', 'Employment effective to', 'date', false), { ...textField('status', 'الحالة', 'Status', 'select'), options: opts(['active', 'stopped']) },
  ];
  return <Panel title={t('الارتباط الوظيفي وربط النمط', 'Effective employment and pattern binding')}>
    <div className="flex gap-2"><Button primary={tab === 'bindings'} onClick={() => setTab('bindings')}>{t('روابط الأنماط', 'Pattern bindings')}</Button><Button primary={tab === 'employments'} onClick={() => setTab('employments')}>{t('الارتباطات الوظيفية', 'Employments')}</Button></div>
    {tab === 'employments' && <div className="flex flex-wrap gap-2"><input placeholder={t('بحث في الموظفين الحاليين', 'Search existing employees')} value={search} onChange={e => setSearch(e.target.value)} className="rounded-lg border px-3" /><Button onClick={() => { void authHeaders().then(headers => m08LegacyEmployees({ data: { companyId, search, offset: 0 }, headers })).then(setCandidates).catch(e => setError(e.message)); }}>{t('تحميل دليل الموظفين', 'Load employee directory')}</Button><p className="w-full text-xs text-muted-foreground">{t('الربط الأول يحتاج مسؤول النظام. يثبت الخادم الرقم والاسم من سجل الموظف، ويحتفظ بنطاق العمل المؤرخ.', 'Initial mapping requires the system administrator. The server verifies identity against the employee record and preserves dated employment scope.')}</p>{error && <p role="alert">{error}</p>}</div>}
    <CanButton action="link" onClick={() => setEditing(tab === 'bindings' ? { from: new Date().toISOString().slice(0, 10), status: 'active', scope: 'employee', employeeIds: [], offset: 0, priority: 600, returnMode: 'continue' } : { status: 'active', allowedSites: [], skills: [] })} icon="add">{t('إضافة', 'Add')}</CanButton>
    <DataList rows={tab === 'bindings' ? state.bindings : es} columns={[{ key: 'code', label: ['الرمز', 'Code'] }, { key: 'nameAr', label: ['الاسم', 'Name'] }, { key: 'from', label: ['من', 'From'] }, { key: 'to', label: ['إلى', 'To'] }, { key: 'version', label: ['الإصدار', 'Version'] }, { key: 'status', label: ['الحالة', 'Status'], render: r => <Status value={r.status} /> }]} actions={r => <CanButton action="link" entity={r} onClick={() => setEditing({ ...r, patternRef: `${r.patternId}@${r.patternVersion}`, policyRef: `${r.policyId}@${r.policyVersion}` })}>{t('إصدار جديد', 'New version')}</CanButton>} />
    {editing && <EditDialog title={t('ربط مؤرخ', 'Effective binding')} initial={editing} fields={fields} onClose={() => setEditing(null)} onSave={(value, reason) => {
      if (tab === 'bindings') { const p = parseRef(value.patternRef), policy = parseRef(value.policyRef); return command('binding.save', { value: { ...value, patternId: p.id, patternVersion: p.version, policyId: policy.id, policyVersion: policy.version }, expectedVersion: editing.version ?? 0 }, reason); }
      return command('employment.save', { value, expectedVersion: editing.version ?? 0 }, reason);
    }} />}
  </Panel>;
}
export function AccessSettings() {
  const { actor, companyId, reload } = useM08(); const t = useText(); const [value, setValue] = useState<Row>({ actions: [], fields: [], roles: [], version: 0 }), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  if (!actor.canManageAccess) return null;
  const fields: Field[] = [textField('userId', 'معرف عضو الشركة', 'Company member user ID'), textField('roles', 'أسماء أدوار الاعتماد', 'Approval role names', 'tokens'),
    { ...textField('actions', 'الإجراءات المسموحة', 'Allowed actions', 'multi'), options: opts(ACTIONS) }, { ...textField('fields', 'حقول حساسة مسموحة', 'Allowed sensitive fields', 'multi', false), options: opts(['cost', 'leave_detail']) },
    textField('branch', 'قصر الوصول على فرع', 'Restrict to branch', 'text', false), textField('department', 'قصر الوصول على قسم', 'Restrict to department', 'text', false), textField('team', 'قصر الوصول على فريق', 'Restrict to team', 'text', false), textField('employeeId', 'قصر الوصول على موظف', 'Restrict to employee', 'text', false),
    textField('from', 'ساري من — UTC', 'Effective from — UTC', 'datetime-local'), textField('to', 'ساري إلى — UTC', 'Effective to — UTC', 'datetime-local', false), textField('version', 'الإصدار الحالي، صفر لأول منح', 'Current version, zero for initial grant', 'number'), textField('reason', 'سبب المنح أو التغيير', 'Grant/change reason')];
  return <Panel title={t('صلاحيات وحدة الدوام', 'Scheduling access')}><p className="text-sm">{t('كل إجراء ونطاق مستقل. إعداد الشفتات لا يمنح تسوية الرواتب تلقائيًا.', 'Actions and scopes are independent. Configuring shifts does not automatically grant payroll adjustments.')}</p><Fields fields={fields} value={value} onChange={setValue} /><Button disabled={busy} onClick={() => {
    setBusy(true); const grant = Object.fromEntries(Object.entries({ actions: value.actions, fields: value.fields, branch: value.branch, department: value.department, team: value.team, employeeId: value.employeeId }).filter(([, v]) => v !== '' && v !== undefined));
    void (supabase as any).rpc('m08_save_access', { p_company_id: companyId, p_user_id: value.userId, p_grants: [grant], p_roles: value.roles, p_valid_from: value.from ? value.from + ':00Z' : null, p_valid_to: value.to ? value.to + ':00Z' : null, p_expected_version: value.version, p_reason: value.reason }).then(({ data, error }: Row) => { if (error) throw error; setMessage(t('تم حفظ إصدار الصلاحيات ', 'Saved access version ') + data); setValue({ ...value, version: data }); reload(); }).catch((e: Error) => setMessage(e.message)).finally(() => setBusy(false));
  }}>{t('حفظ الصلاحيات', 'Save access')}</Button><p role="status">{message}</p></Panel>;
}
