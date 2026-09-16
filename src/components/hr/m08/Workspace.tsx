/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { AppShell } from '@/components/hr/AppShell';
import { useCompanyWorkspace } from '@/components/hr/CompanyWorkspace';
import { PageBanner } from '@/components/hr/ui';
import { loadM08, commandM08 } from '@/lib/m08/functions';
import { canonical } from '@/lib/m08/attendance.mjs';
import { Button, M08Context } from './common';
import { SCREENS, type Row } from './forms';
import { AccessSettings, authHeaders, Bindings, Definitions } from './Definitions';
import { ImportRoster, Rosters } from './Rosters';
import { Coverage, Exceptions, Reports, SelfService } from './Operations';

export function M08Workspace({ screen }: { screen: string }) { return <AppShell><WorkspaceBody screen={screen} /></AppShell>; }
function WorkspaceBody({ screen }: { screen: string }) {
  const company = useCompanyWorkspace(), selected = company.selectedCompany;
  const [lang, setLang] = useState(0), [busy, setBusy] = useState(false), [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null), [policyTab, setPolicyTab] = useState('policies');
  const retry = useRef<Row | null>(null), client = useQueryClient();
  const enabled = import.meta.env['VITE_M08_ENABLED'] === 'true';
  const query = useQuery({ queryKey: ['m08', selected?.id], enabled: enabled && Boolean(selected), retry: false,
    queryFn: async () => loadM08({ data: { companyId: selected!.id }, headers: await authHeaders() }) });
  const t = (ar: string, en: string) => lang ? en : ar, active = SCREENS.find(s => s.key === screen) ?? SCREENS[2]!;
  const command = async (type: string, payload: Row, reason: string) => {
    if (!selected || !query.data || busy) return false;
    const key = canonical({ companyId: selected.id, type, payload, reason });
    // Retain operation identity after an ambiguous transport failure; changed input starts a new command.
    const input = retry.current?.key === key ? retry.current.input : { companyId: selected.id, type, payload, reason, expectedRevision: query.data.revision, operationId: crypto.randomUUID() };
    retry.current = { key, input }; setBusy(true); setNotice(null);
    try {
      const output = await commandM08({ data: input, headers: await authHeaders() }); client.setQueryData(['m08', selected.id], output); retry.current = null;
      setNotice({ error: false, text: t('تم الحفظ وتسجيل العملية بنجاح.', 'Saved successfully with an audit record.') }); return true;
    } catch (error) {
      const text = error instanceof Error ? error.message : t('تعذر الحفظ', 'Save failed');
      if (text.includes('VERSION_STALE')) retry.current = null;
      setNotice({ error: true, text }); return false;
    } finally { setBusy(false); }
  };
  return <div dir={lang ? 'ltr' : 'rtl'} className="my-4 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs font-semibold text-muted-foreground">{active.id} · {t('إدارة الشفتات والدوام', 'Shifts and rosters')}</span><div className="flex gap-2"><Button onClick={() => setLang(lang ? 0 : 1)}>{lang ? 'العربية' : 'English'}</Button><Button onClick={() => { void query.refetch(); }}>{t('تحديث البيانات', 'Refresh data')}</Button></div></div>
    <PageBanner icon={active.icon} title={active.label[lang]!} subtitle={t('تعريفات مؤرخة · جداول معتمدة · حضور قابل للتتبع', 'Effective definitions · Approved rosters · Traceable attendance')} />
    <nav aria-label={t('شاشات وحدة الدوام', 'Scheduling module screens')} className="flex gap-2 overflow-x-auto rounded-xl border bg-card p-2">{SCREENS.map(s => <Link key={s.key} to={`/shifts/${s.key}` as never} aria-current={s.key === screen ? 'page' : undefined} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold ${s.key === screen ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'}`}><span className="block text-[10px] opacity-70">{s.id}</span>{s.label[lang]}</Link>)}</nav>
    {!enabled ? <p role="status" className="rounded-xl border bg-card p-6">{t('وحدة الدوام تنتظر تفعيل إعدادات التشغيل بعد تطبيق ترحيل قاعدة البيانات ومراجعة الصلاحيات.', 'Scheduling is awaiting activation after its database migration and access review.')}</p> : company.isLoading ? <p role="status">{t('تحميل الشركات…', 'Loading companies…')}</p> : company.error ? <p role="alert">{company.error.message}</p> : !selected ? <div className="rounded-xl border bg-card p-6"><p>{t('حدد شركة لها عضوية وصلاحيات قبل إعداد الدوام.', 'Choose a company with membership and access before configuring scheduling.')}</p><Link to="/settings/company" className="text-primary underline">{t('إعدادات الشركة', 'Company settings')}</Link></div> : <>
      <label className="block text-sm font-bold">{t('الشركة', 'Company')}<select value={selected.id} onChange={e => { company.selectCompany(e.target.value); setNotice(null); retry.current = null; }} className="ms-2 rounded-lg border p-2">{company.companies.map(c => <option key={c.id} value={c.id}>{lang ? c.display_name_en : c.display_name}</option>)}</select></label>
      {query.isLoading && <div role="status" className="animate-pulse rounded-xl border bg-card p-8">{t('تحميل الشفتات والنسخ…', 'Loading shifts and versions…')}</div>}
      {query.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{query.error.message}</p>}
      {notice && <p role={notice.error ? 'alert' : 'status'} className={`sticky top-20 z-40 rounded-lg border p-3 text-sm shadow-sm ${notice.error ? 'border-red-200 bg-red-50 text-red-800' : 'border-teal-200 bg-teal-50 text-teal-900'}`}>{notice.text}{notice.error && <button className="ms-3 underline" onClick={() => { void query.refetch(); }}>{t('تحميل النسخة الحالية مع الاحتفاظ بالمدخلات', 'Load latest version; retain form inputs')}</button>}</p>}
      {query.data && <M08Context.Provider value={{ ...query.data, state: query.data.state, actor: query.data.actor, audit: query.data.audit, companyId: selected.id, lang, busy, command, reload: () => { void query.refetch(); } }}>
        {screen === 'library' && <Definitions kind="shifts" />}{screen === 'templates' && <Definitions kind="templates" />}{screen === 'patterns' && <Definitions kind="patterns" />}
        {screen === 'bindings' && <Bindings />}{screen === 'rosters' && <Rosters />}{screen === 'approvals' && <Rosters approvals />}{screen === 'mine' && <Rosters mine />}{screen === 'import' && <ImportRoster />}
        {screen === 'coverage' && <Coverage />}{screen === 'requests' && <SelfService />}{screen === 'open' && <SelfService open />}{screen === 'exceptions' && <Exceptions />}{screen === 'reports' && <Reports />}{screen === 'audit' && <Reports auditOnly />}
        {screen === 'policies' && <><div className="flex gap-2"><Button primary={policyTab === 'policies'} onClick={() => setPolicyTab('policies')}>{t('السياسات', 'Policies')}</Button><Button primary={policyTab === 'sites'} onClick={() => setPolicyTab('sites')}>{t('المواقع ومراكز التكلفة', 'Sites and cost centers')}</Button><Button primary={policyTab === 'access'} onClick={() => setPolicyTab('access')}>{t('الصلاحيات', 'Access')}</Button></div>{policyTab === 'access' ? <AccessSettings /> : <Definitions kind={policyTab} />}</>}
      </M08Context.Provider>}
    </>}
  </div>;
}
