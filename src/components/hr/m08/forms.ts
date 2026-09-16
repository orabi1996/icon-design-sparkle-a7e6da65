/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = any;
export type Labels = [string, string];
export type Field = { key: string; label: Labels; type?: 'text' | 'number' | 'date' | 'time' | 'checkbox' | 'select' | 'multi' | 'tokens' | 'rows' | 'datetime-local'; required?: boolean; options?: { value: string; label: string }[]; fields?: Field[]; min?: number; max?: number; help?: Labels };
export const SCREENS: { key: string; id: string; label: Labels; icon: string }[] = [
  { key: 'library', id: 'M08-S01', label: ['مكتبة الشفتات', 'Shift library'], icon: 'schedule' },
  { key: 'templates', id: 'M08-S02', label: ['قوالب أيام العمل', 'Workday templates'], icon: 'view_day' },
  { key: 'rosters', id: 'M08-S03', label: ['جداول الدوام', 'Rosters'], icon: 'calendar_month' },
  { key: 'import', id: 'M08-S04', label: ['الاستيراد والتسكين الجماعي', 'Import and bulk assignment'], icon: 'upload_file' },
  { key: 'patterns', id: 'M08-S05', label: ['أنماط التكرار', 'Recurring patterns'], icon: 'cycle' },
  { key: 'bindings', id: 'M08-S06', label: ['ربط الموظفين بالأنماط', 'Employee pattern bindings'], icon: 'group_add' },
  { key: 'coverage', id: 'M08-S07', label: ['الاحتياج والتغطية', 'Demand and coverage'], icon: 'groups' },
  { key: 'approvals', id: 'M08-S08', label: ['مراجعة الجداول واعتمادها', 'Roster approvals'], icon: 'fact_check' },
  { key: 'requests', id: 'M08-S09', label: ['طلبات التغيير والتبادل', 'Changes and swaps'], icon: 'swap_horiz' },
  { key: 'open', id: 'M08-S10', label: ['الشفتات الشاغرة', 'Open shifts'], icon: 'person_add' },
  { key: 'mine', id: 'M08-S11', label: ['جدول الموظف', 'My schedule'], icon: 'person' },
  { key: 'policies', id: 'M08-S12', label: ['سياسات الدوام', 'Scheduling policies'], icon: 'policy' },
  { key: 'exceptions', id: 'M08-S13', label: ['الاستثناءات وأثر التغيير', 'Exceptions and impact'], icon: 'difference' },
  { key: 'reports', id: 'M08-S14', label: ['تقارير الشفتات', 'Shift reports'], icon: 'analytics' },
  { key: 'audit', id: 'M08-S15', label: ['الإصدارات والتدقيق', 'Versions and audit'], icon: 'history' },
];
export const STATUSES: Record<string, Labels> = { draft: ['مسودة', 'Draft'], active: ['ساري', 'Active'], stopped: ['موقوف', 'Stopped'], review: ['قيد المراجعة', 'Under review'], returned: ['معاد للتعديل', 'Returned'], approved: ['معتمد', 'Approved'], published: ['منشور', 'Published'], superseded: ['مستبدل', 'Superseded'], cancelled: ['ملغى', 'Cancelled'], pending: ['معلق', 'Pending'], accepted: ['مقبول', 'Accepted'], rejected: ['مرفوض', 'Rejected'], open: ['مفتوح', 'Open'], closed: ['مقفل', 'Closed'], executed: ['منفذ', 'Executed'], peer_pending: ['بانتظار الزميل', 'Awaiting colleague'], needs_review: ['يحتاج إعادة تقييم', 'Needs review'], withdrawn: ['مسحوب', 'Withdrawn'], filled: ['مكتمل', 'Filled'], failed: ['فشل التسليم', 'Delivery failed'], delivered: ['تم التسليم', 'Delivered'], calculated: ['محسوب', 'Calculated'], incomplete: ['بصمات ناقصة', 'Incomplete punches'], absence_review: ['غياب للمراجعة', 'Absence for review'], WORK: ['عمل', 'Work'], OFF: ['راحة', 'Rest'], HOLIDAY: ['عطلة', 'Holiday'], LEAVE: ['غير متاح', 'Unavailable'], UNSCHEDULED: ['غير مجدول', 'Unscheduled'] };
export const textField = (key: string, ar: string, en: string, type: Field['type'] = 'text', required = true): Field => ({ key, label: [ar, en], type, required });
export const opts = (values: string[]) => values.map(value => ({ value, label: value }));
export const ref = (x: Row) => `${x.id}@${x.version}`;
export const parseRef = (value: string) => { const [id, version] = String(value || '').split('@'); return { id, version: Number(version) }; };
export const refs = (rows: Row[], lang: number) => rows.filter(r => r.status === 'active').map(r => ({ value: ref(r), label: `${r.code} · ${lang ? r.nameEn : r.nameAr} · v${r.version}` }));
const base: Field[] = [textField('code', 'الرمز', 'Code'), textField('nameAr', 'الاسم العربي', 'Arabic name'), textField('nameEn', 'الاسم الإنجليزي', 'English name'), textField('from', 'ساري من', 'Effective from', 'date'), textField('to', 'ساري إلى', 'Effective to', 'date', false), { ...textField('status', 'الحالة', 'Status', 'select'), options: opts(['draft', 'active', 'stopped']) }];
export function definitionFields(kind: string, state: Row, lang: number): Field[] {
  const shiftRef: Field = { ...textField('shiftRef', 'إصدار الشفت', 'Shift version', 'select'), options: refs(state.shifts, lang) };
  const site: Field = { ...textField('siteCode', 'الموقع', 'Site', 'select'), options: state.sites.filter((s: Row) => s.status === 'active').map((s: Row) => ({ value: s.code, label: `${s.code} · ${lang ? s.nameEn : s.nameAr}` })) };
  const extras: Record<string, Field[]> = {
    shifts: [
      { ...textField('type', 'نوع الدوام', 'Shift type', 'select'), options: opts(['fixed', 'night', 'flex', 'split', 'seasonal']) }, textField('color', 'لون العرض', 'Display color'),
      textField('startTime', 'بداية العمل', 'Start', 'time'), textField('endTime', 'نهاية العمل / أقصى نهاية للمرن', 'End / latest flexible end', 'time'),
      { ...textField('endDay', 'إزاحة يوم النهاية', 'End day offset', 'number'), min: 0, max: 1 }, textField('timezone', 'المنطقة الزمنية الافتراضية', 'Default timezone'),
      textField('requiredMinutes', 'دقائق العمل المطلوبة', 'Required work minutes', 'number'),
      { ...textField('punchMode', 'وضع البصمة', 'Punch mode', 'select'), options: opts(['pairs', 'presence', 'standard']) },
      textField('windowBefore', 'نافذة الربط قبل البداية — دقيقة', 'Window before start — minutes', 'number'), textField('windowAfter', 'نافذة الربط بعد النهاية — دقيقة', 'Window after end — minutes', 'number'),
      { key: 'breaks', label: ['الاستراحات: دقائق من بداية الشفت', 'Breaks: minutes from shift start'], type: 'rows', fields: [textField('start', 'بداية الاستراحة', 'Break start', 'number'), textField('end', 'نهاية الاستراحة', 'Break end', 'number'), textField('paid', 'مدفوعة', 'Paid', 'checkbox', false)] },
      textField('requiredSkills', 'رموز المهارات — مفصولة بفواصل', 'Required skill codes — comma separated', 'tokens', false),
      textField('flexLatestStart', 'آخر بدء مسموح للمرن', 'Latest flexible start', 'time', false), textField('coreStart', 'بداية الحضور الإلزامي', 'Core start', 'time', false), textField('coreEnd', 'نهاية الحضور الإلزامي', 'Core end', 'time', false),
      { ...textField('disambiguation', 'الوقت المحلي المكرر', 'Repeated local time', 'select'), options: opts(['reject', 'earlier', 'later']) },
    ],
    templates: [{ ...textField('dayType', 'نوع اليوم', 'Day type', 'select'), options: opts(['WORK', 'OFF', 'HOLIDAY']) }, { key: 'periods', label: ['فترات اليوم بالترتيب', 'Periods in order'], type: 'rows', fields: [shiftRef, site, textField('costCenter', 'مركز التكلفة', 'Cost center', 'text', false), { ...textField('disambiguation', 'الوقت المكرر', 'Repeated time', 'select'), options: opts(['reject', 'earlier', 'later']) }] }],
    patterns: [{ ...textField('type', 'نوع النمط', 'Pattern type', 'select'), options: opts(['fixed', 'weekly', 'rotating', 'seasonal']) }, textField('anchor', 'التاريخ المرجعي للدورة', 'Cycle anchor', 'date'), { key: 'days', label: ['أيام الدورة بالترتيب، بما فيها الراحة', 'Cycle days in order, including rest'], type: 'rows', fields: [{ ...textField('templateRef', 'قالب اليوم', 'Day template', 'select'), options: refs(state.templates, lang) }] }],
    sites: [textField('branch', 'رمز الفرع', 'Branch code'), textField('timezone', 'المنطقة الزمنية', 'Timezone'), textField('costCenters', 'مراكز التكلفة المسموحة', 'Allowed cost centers', 'tokens')],
    policies: [textField('countryPackage', 'حزمة الدولة المعتمدة وإصدارها', 'Approved country package/version'),
      ...[['maxPeriods', 'أقصى فترات اليوم', 'Maximum daily periods'], ['maxDailyMinutes', 'أقصى دقائق العمل اليومية', 'Maximum daily work minutes'], ['maxWeeklyMinutes', 'أقصى دقائق العمل الأسبوعية', 'Maximum weekly work minutes'], ['minRestMinutes', 'أدنى راحة بين يومي العمل', 'Minimum inter-day rest'], ['maxConsecutiveDays', 'أقصى أيام عمل متصلة', 'Maximum consecutive workdays'], ['maxSpanMinutes', 'أقصى امتداد اليوم بالدقائق', 'Maximum daily span minutes'], ['splitGapMinutes', 'أدنى فاصل بين الفترات المقسمة', 'Minimum split gap'], ['travelMinutes', 'أدنى انتقال بين المواقع', 'Minimum site travel time'], ['graceMinutes', 'دقائق السماح', 'Grace minutes'], ['overtimeThreshold', 'حد فتح الإضافي بالدقائق', 'Overtime threshold'], ['overtimeCap', 'أقصى إضافي بالدقائق', 'Overtime cap'], ['arrivalLagMinutes', 'مهلة وصول البصمات المتأخرة', 'Late source arrival allowance'], ['weekStart', 'بداية الأسبوع: الأحد 0 والسبت 6', 'Week start: Sunday 0, Saturday 6'], ['changeNoticeMinutes', 'مهلة طلب التغيير قبل الشفت', 'Change notice minutes']].map(([key, ar, en]) => textField(key!, ar!, en!, 'number')),
      { ...textField('graceMode', 'طريقة السماح', 'Grace mode', 'select'), options: opts(['threshold', 'excess']) }, textField('graceWaivesMissing', 'السماح يعفي من استكمال الساعات', 'Grace waives hour makeup', 'checkbox', false),
      { ...textField('overtimeMode', 'طريقة حد فتح الإضافي', 'Overtime threshold mode', 'select'), options: opts(['threshold', 'excess']) }, textField('observeAfter', 'رصد عمل مثبت بعد نهاية الشفت', 'Observe evidenced work after shift', 'checkbox', false), textField('requireOvertimePlan', 'الإضافي يحتاج تكليفًا مسبقًا', 'Overtime requires prior plan', 'checkbox', false),
      { ...textField('coverageSeverity', 'شدة نقص التغطية', 'Coverage severity', 'select'), options: opts(['warning', 'exception', 'blocker']) }, textField('separateApprover', 'منع الاعتماد الذاتي', 'Separate creator and approver', 'checkbox', false), textField('approvalRoles', 'أدوار الاعتماد بالترتيب', 'Approval roles in order', 'tokens'), textField('holidays', 'تواريخ العطلات المعتمدة YYYY-MM-DD', 'Approved holiday dates YYYY-MM-DD', 'tokens', false),
    ],
  };
  return [...base, ...(extras[kind] ?? [])];
}
export function initialDefinition(kind: string): Row {
  const common = { code: '', nameAr: '', nameEn: '', from: new Date().toISOString().slice(0, 10), to: '', status: 'draft' };
  const specific: Record<string, Row> = {
    shifts: { type: 'fixed', color: '#006B80', startTime: '', endTime: '', endDay: 0, timezone: 'Africa/Cairo', punchMode: 'pairs', windowBefore: '', windowAfter: '', requiredMinutes: '', breaks: [], requiredSkills: [], disambiguation: 'reject' },
    templates: { dayType: 'WORK', periods: [] }, patterns: { type: 'rotating', anchor: common.from, days: [] }, sites: { branch: '', timezone: 'Africa/Cairo', costCenters: [] },
    policies: { maxPeriods: 2, graceMode: 'threshold', overtimeMode: 'threshold', graceWaivesMissing: false, separateApprover: true, observeAfter: false, requireOvertimePlan: true, coverageSeverity: 'blocker', approvalRoles: [], holidays: [] },
  }; return { ...common, ...specific[kind] };
}
export function prepareDefinition(kind: string, value: Row) {
  const v = structuredClone(value);
  if (kind === 'templates') v.periods = v.periods.map((p: Row) => { const r = parseRef(p.shiftRef); return { shiftId: r.id, shiftVersion: r.version, siteCode: p.siteCode, costCenter: p.costCenter || '', disambiguation: p.disambiguation || 'reject' }; });
  if (kind === 'patterns') v.days = v.days.map((d: Row) => parseRef(d.templateRef));
  return v;
}
