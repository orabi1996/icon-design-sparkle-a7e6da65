import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { execute, emptyState, type M08Actor, type M08State } from './engine.mjs';
import { allowed, allowedField, assertAccess, employeeScope, projectState } from './access.mjs';
import { canonical } from './attendance.mjs';
import { previewImport } from './planning.mjs';

const companyInput = z.object({ companyId: z.string().uuid() });
const commandInput = companyInput.extend({ expectedRevision: z.number().int().min(0), operationId: z.string().uuid(), type: z.string().max(80), reason: z.string().trim().min(3).max(1000), payload: z.record(z.unknown()) });
// Narrow service boundary avoids expanding generated database types for additive migrations.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
async function contextData(context: unknown, companyId: string) {
  if (process.env['M08_ENABLED'] !== 'true') throw new Error('وحدة الشفتات لم تُفعّل في بيئة التشغيل بعد');
  const c = context as { supabase: Db; userId: string };
  // Verify active account server-side, including revocations/bans, before using service credentials.
  const { data: auth, error: authError } = await c.supabase.auth.getUser();
  if (authError || !auth.user || auth.user.id !== c.userId) throw new Error('انتهت صلاحية الجلسة؛ سجل الدخول مجددًا');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const db = supabaseAdmin as Db;
  const { data, error } = await db.rpc('m08_load', { p_company_id: companyId, p_actor_id: c.userId });
  if (error) throw new Error(error.code === '42501' ? 'غير مصرح بالوصول إلى الشركة' : 'تعذر تحميل وحدة الشفتات؛ تحقق من تطبيق ترحيل قاعدة البيانات');
  if (!data.actor?.canManageAccess && !data.actor?.grants?.some((g: { actions?: string[] }) => g.actions?.includes('read'))) throw new Error('غير مصرح بعرض بيانات وحدة الشفتات');
  const state: M08State = data.state ?? emptyState(); state['punches'] = data.punches ?? [];
  return { db, authDb: c.supabase, actor: data.actor as M08Actor, state, revision: Number(data.revision), audit: data.audit ?? [] };
}
function response(bundle: Awaited<ReturnType<typeof contextData>>) {
  const { state, actor, revision, audit } = bundle;
  const auditRows = audit.filter((row: Db) => {
    const after = row.event?.after;
    if (allowed(actor, 'audit')) return true;
    if (after?.employeeId) return allowed(actor, 'audit', employeeScope(state, after.employeeId));
    return after?.employeeIds?.length && after.employeeIds.every((id: string) => allowed(actor, 'audit', employeeScope(state, id)));
  }).map((row: Db) => {
    if (allowed(actor, 'audit') && allowedField(actor, 'cost') && (!(row.event?.type ?? '').startsWith('leave.') || allowedField(actor, 'leave_detail'))) return row;
    const projected = { ...row, event: { ...row.event } };
    if (!allowed(actor, 'audit')) { projected.event.before = null; projected.event.after = null; projected.event.reason = (row.event?.type ?? '').startsWith('leave.') ? '' : row.event?.reason; }
    if ((row.event?.type ?? '').startsWith('leave.') && !allowedField(actor, 'leave_detail')) projected.event.reason = '';
    if (!allowedField(actor, 'cost')) { projected.event.before = null; projected.event.after = null; }
    return projected;
  });
  return { state: projectState(state, actor), revision, actor, audit: auditRows, auditLimit: 200 };
}
export const loadM08 = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth])
  .validator((input: unknown) => companyInput.parse(input))
  .handler(async ({ context, data }) => response(await contextData(context, data.companyId)));

export const commandM08 = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .validator((input: unknown) => commandInput.parse(input))
  .handler(async ({ context, data }) => {
    const bundle = await contextData(context, data.companyId);
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256').update(canonical({ type: data.type, payload: data.payload, reason: data.reason })).digest('hex');
    // A lost response may be retried after the aggregate has advanced. Resolve the receipt first.
    const { data: receipt, error: receiptError } = await bundle.db.from('m08_audit').select('actor_id,command_hash,revision').eq('company_id', data.companyId).eq('operation_id', data.operationId).maybeSingle();
    if (receiptError) throw new Error('تعذر التحقق من حالة العملية السابقة');
    if (receipt) {
      if (receipt.actor_id !== bundle.actor.id || receipt.command_hash !== hash) throw new Error('معرف العملية مستخدم ببيانات مختلفة');
      return { ...response(bundle), replayed: true };
    }
    if (bundle.revision !== data.expectedRevision) throw new Error('VERSION_STALE: تغيرت البيانات؛ حدّث النسخة وراجع الفرق قبل المحاولة');
    // Legacy employee identity is verified, never accepted from a form's display fields.
    if (data.type === 'employment.save') {
      const value = data.payload['value'] as Record<string, unknown> | undefined;
      if (!value) throw new Error('بيانات الارتباط الوظيفي مطلوبة');
      assertAccess(bundle.actor, 'link', value);
      const existing = bundle.state['employments'].find((e: Db) => e.employeeId === value['employeeId']);
      if (!existing) {
        const { data: admin, error } = await bundle.authDb.rpc('is_permissions_admin');
        if (error || admin !== true) throw new Error('الربط الأول بسجل الموظف القديم يحتاج مسؤول النظام لعدم وجود نطاق شركة في السجل القديم');
      }
      const { data: employee, error } = await bundle.db.from('employees').select('id,emp_no,full_name').eq('id', value['employeeId']).single();
      if (error || !employee) throw new Error('سجل الموظف غير متاح');
      value['code'] = String(employee.emp_no); value['nameAr'] = employee.full_name;
    }
    let changed;
    try { changed = execute(bundle.state, { type: data.type, payload: data.payload, operationId: data.operationId, reason: data.reason }, bundle.actor, new Date().toISOString()); }
    catch (error) {
      // Return scoped domain messages only, not service/client objects, tokens or other employees' data.
      throw new Error(error instanceof Error ? error.message : 'تعذر تنفيذ العملية');
    }
    const originalIds = new Set(bundle.state['punches'].map((p: Db) => p.id));
    const added = changed.state['punches'].filter((p: Db) => !originalIds.has(p.id));
    const persisted = { ...changed.state }; delete persisted['punches'];
    const { error } = await bundle.db.rpc('m08_commit', { p_company_id: data.companyId, p_actor_id: bundle.actor.id,
      p_access_etag: bundle.actor.etag, p_expected_revision: data.expectedRevision, p_operation_id: data.operationId, p_command_hash: hash,
      p_state: persisted, p_event: changed.event, p_result: { id: changed.result?.id ?? null }, p_raw_events: added });
    if (error) throw new Error(error.code === '40001' ? 'VERSION_STALE: حفظ مستخدم آخر تغييرات جديدة؛ حدّث النسخة وراجعها' : error.code === '42501' ? 'تغيرت الصلاحيات؛ أعد فتح الشاشة' : 'لم يصل تأكيد الحفظ؛ أعد المحاولة بنفس معرف العملية للتحقق');
    return { ...response(await contextData(context, data.companyId)), replayed: false };
  });

export const previewM08Import = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .validator((input: unknown) => companyInput.extend({ rosterId: z.string(), rows: z.array(z.record(z.unknown())).max(10000) }).parse(input))
  .handler(async ({ context, data }) => {
    const bundle = await contextData(context, data.companyId);
    const roster = bundle.state['rosters'].find((r: Db) => r.id === data.rosterId);
    if (!roster || !roster.employeeIds.every((id: string) => allowed(bundle.actor, 'import', employeeScope(bundle.state, id)))) throw new Error('غير مصرح باستيراد هذا الجدول');
    const output = previewImport(bundle.state, roster, data.rows, { id: roster.policyId, version: roster.policyVersion });
    return { errors: output.errors, issues: output.issues, inputCount: output.inputCount, revision: bundle.revision };
  });

export const exportM08 = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .validator((input: unknown) => companyInput.extend({ from: z.string(), to: z.string(), branch: z.string().max(80).optional(), siteCode: z.string().max(80).optional(), report: z.enum(['rosters', 'coverage', 'planned_actual', 'night_distribution', 'published_changes', 'swaps', 'overtime', 'cost_centers', 'results', 'requests', 'deliveries', 'audit']) }).parse(input))
  .handler(async ({ context, data }) => {
    const b = await contextData(context, data.companyId);
    if (!b.actor.grants.some((g: { actions: string[] }) => g.actions.includes('export'))) throw new Error('غير مصرح بتصدير بيانات الدوام');
    if (data.report === 'audit' && (!allowed(b.actor, 'audit') || !allowed(b.actor, 'export'))) throw new Error('تصدير التدقيق يتطلب صلاحية شاملة للشركة');
    if (data.report === 'cost_centers' && !b.actor.grants.some((g: { fields?: string[] }) => g.fields?.includes('cost'))) throw new Error('تقرير مراكز التكلفة يتطلب صلاحية حقل التكلفة');
    const visible = projectState(b.state, b.actor);
    const { reportRows } = await import('./reports.mjs');
    const rows = reportRows(visible, data.report, data.from, data.to, response(b).audit).filter((row: Db) => {
      const branch = row.branch || (row.employeeId && employeeScope(b.state, row.employeeId, row.workDate).branch);
      return (!data.branch || branch === data.branch) && (!data.siteCode || row.siteCode === data.siteCode);
    });
    for (const row of rows) {
      const dates = Array.isArray(row.workDates) ? row.workDates : row.employeeId ? [row.workDate] : [];
      if (row.employeeId) dates.forEach((day: string) => assertAccess(b.actor, 'export', employeeScope(b.state, row.employeeId, day)));
      else assertAccess(b.actor, 'export', row);
      if (data.report === 'cost_centers' && !allowedField(b.actor, 'cost', row)) throw new Error('حقل مركز التكلفة خارج نطاق صلاحياتك');
    }
    if (data.report === 'deliveries') rows.forEach((row: Db) => assertAccess(b.actor, 'payroll', employeeScope(b.state, row.employeeId, row.workDate)));
    return { generatedAt: new Date().toISOString(), companyId: data.companyId, from: data.from, to: data.to, branch: data.branch ?? '', siteCode: data.siteCode ?? '', report: data.report, revision: b.revision, rows };
  });

export const m08LegacyEmployees = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth])
  .validator((input: unknown) => companyInput.extend({ search: z.string().max(80), offset: z.number().int().min(0).default(0) }).parse(input))
  .handler(async ({ context, data }) => {
    const b = await contextData(context, data.companyId); const { data: admin } = await b.authDb.rpc('is_permissions_admin');
    if (admin !== true) throw new Error('غير مصرح بعرض دليل الموظفين القديم');
    const safe = data.search.replace(/[%_(),]/g, '');
    const { data: rows, error } = await b.db.from('employees').select('id,emp_no,full_name').ilike('full_name', `%${safe}%`).order('emp_no').range(data.offset, data.offset + 99);
    if (error) throw new Error('تعذر تحميل الموظفين'); return rows;
  });
