/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext, useContext, useState, type ReactNode } from 'react';
import { MaterialIcon } from '@/components/MaterialIcon';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { allowed } from '@/lib/m08/access.mjs';
import { STATUSES, type Field, type Row, type Labels } from './forms';
export type M08ContextValue = { state: Row; actor: Row; audit: Row[]; revision: number; companyId: string; lang: number; busy: boolean;
  command: (type: string, payload: Row, reason: string) => Promise<boolean>; reload: () => void };
export const M08Context = createContext<M08ContextValue | null>(null);
export function useM08() { const value = useContext(M08Context); if (!value) throw new Error('M08Context required'); return value; }
export function useText() { const { lang } = useM08(); return (ar: string, en: string) => lang ? en : ar; }
export function Status({ value }: { value: string }) { const { lang } = useM08(); return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ${['published', 'approved', 'active', 'accepted', 'WORK'].includes(value) ? 'bg-teal-50 text-teal-800' : ['rejected', 'failed', 'incomplete'].includes(value) ? 'bg-red-50 text-red-800' : 'bg-slate-100 text-slate-700'}`}>{STATUSES[value]?.[lang] ?? value}</span>; }
export function Button({ children, onClick, disabled, icon, primary = false, title, type = 'button' }: { children: ReactNode; onClick?: () => void; disabled?: boolean; icon?: string; primary?: boolean; title?: string; type?: 'button' | 'submit' }) {
  return <button type={type} onClick={onClick} disabled={disabled} title={title} className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${primary ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-secondary'}`}>{icon && <MaterialIcon name={icon} size={18} />}{children}</button>;
}
export function CanButton({ action, entity, ...props }: Parameters<typeof Button>[0] & { action: string; entity?: Row }) { const { actor, busy } = useM08(); const t = useText(); const can = entity ? allowed(actor, action, entity) : actor.grants.some((g: Row) => g.actions.includes(action)); const title = !can ? t('هذا الإجراء خارج صلاحياتك', 'This action is outside your permissions') : props.title; return <Button {...props} disabled={busy || props.disabled || !can} {...(title ? { title } : {})} />; }
export function Empty({ text }: { text?: string }) { const t = useText(); return <div role="status" className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{text || t('لا توجد بيانات مطابقة. أضف سجلًا أو عدّل الفلاتر.', 'No matching data. Add a record or adjust filters.')}</div>; }
export function Panel({ title, children }: { title: string; children: ReactNode }) { return <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm"><h2 className="text-base font-bold text-primary">{title}</h2>{children}</section>; }
export function Fields({ fields, value, onChange }: { fields: Field[]; value: Row; onChange: (value: Row) => void }) {
  const { lang } = useM08(); const t = useText();
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{fields.map(field => {
    const set = (v: Row) => onChange({ ...value, [field.key]: v });
    const id = `m08-${field.key}`;
    if (field.type === 'rows') return <fieldset key={field.key} className="col-span-full space-y-2 rounded-xl border p-3"><legend className="px-2 text-sm font-bold">{field.label[lang]}</legend>
      {(value[field.key] ?? []).map((r: Row, index: number) => <div key={index} className="space-y-2 rounded-lg bg-secondary/30 p-3"><div className="flex items-center justify-between"><strong className="text-xs">{index + 1}</strong><Button onClick={() => set(value[field.key].filter((_: Row, i: number) => i !== index))}>{t('حذف الفترة', 'Remove row')}</Button></div><Fields fields={field.fields ?? []} value={r} onChange={v => set(value[field.key].map((x: Row, i: number) => i === index ? v : x))} /></div>)}
      <Button icon="add" onClick={() => set([...(value[field.key] ?? []), Object.fromEntries((field.fields ?? []).map(f => [f.key, f.type === 'checkbox' ? false : '']))])}>{t('إضافة', 'Add')}</Button></fieldset>;
    return <label key={field.key} className="flex flex-col gap-1 text-xs font-semibold" htmlFor={id}>{field.label[lang]}{field.required && ' *'}
      {field.type === 'checkbox' ? <input id={id} type="checkbox" checked={Boolean(value[field.key])} onChange={e => set(e.target.checked)} className="size-5 accent-primary" /> : field.type === 'select' || field.type === 'multi' ?
        <select id={id} required={field.required} multiple={field.type === 'multi'} value={value[field.key] ?? (field.type === 'multi' ? [] : '')} onChange={e => set(field.type === 'multi' ? [...e.target.selectedOptions].map(x => x.value) : e.target.value)} className={`w-full rounded-lg border bg-background px-2 text-sm ${field.type === 'multi' ? 'min-h-28' : 'h-10'}`}>
          {field.type !== 'multi' && <option value="">{t('اختر…', 'Select…')}</option>}{field.options?.map((o, i) => <option key={`${o.value}:${i}`} value={o.value}>{STATUSES[o.value]?.[lang] ?? o.label}</option>)}
        </select> : <input id={id} type={field.type === 'tokens' ? 'text' : field.type ?? 'text'} value={field.type === 'tokens' ? (value[field.key] ?? []).join(', ') : value[field.key] ?? ''} required={field.required} min={field.min ?? (field.type === 'number' ? 0 : undefined)} max={field.max} step={field.type === 'number' ? 1 : undefined} onChange={e => set(field.type === 'number' ? e.target.value === '' ? '' : Number(e.target.value) : field.type === 'tokens' ? e.target.value.split(',').map(s => s.trim()).filter(Boolean) : e.target.value)} className="h-10 w-full rounded-lg border bg-background px-3 text-sm" />}
      {field.help && <small className="font-normal text-muted-foreground">{field.help[lang]}</small>}
    </label>;
  })}</div>;
}
export function EditDialog({ title, initial, fields, onSave, onClose, children }: { title: string; initial: Row; fields: Field[]; onSave: (value: Row, reason: string) => Promise<boolean>; onClose: () => void; children?: (value: Row) => ReactNode }) {
  const [value, setValue] = useState(initial), [reason, setReason] = useState(''); const { busy, lang } = useM08(); const t = useText();
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent dir={lang ? 'ltr' : 'rtl'} className="max-h-[90vh] max-w-5xl overflow-y-auto">
    <DialogTitle>{title}</DialogTitle><DialogDescription>{t('راجع البيانات والسريان ثم احفظ. تظل المدخلات ظاهرة إذا تعذر الحفظ.', 'Review values and effective dates before saving. Inputs remain available if saving fails.')}</DialogDescription>
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); void onSave(value, reason).then(ok => { if (ok) onClose(); }); }}>
      <Fields fields={fields} value={value} onChange={setValue} />{children?.(value)}
      <label className="block text-sm font-bold">{t('سبب الإجراء', 'Reason')} *<textarea required minLength={3} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} className="mt-1 min-h-20 w-full rounded-lg border p-3 font-normal" /></label>
      <div className="flex gap-2"><Button type="submit" primary disabled={busy} icon="save">{busy ? t('جاري الحفظ…', 'Saving…') : t('حفظ', 'Save')}</Button><Button onClick={onClose} disabled={busy}>{t('إلغاء', 'Cancel')}</Button></div>
    </form>
  </DialogContent></Dialog>;
}
export function DataList({ rows, columns, actions }: { rows: Row[]; columns: { key: string; label: Labels; render?: (row: Row) => ReactNode }[]; actions?: (row: Row) => ReactNode }) {
  const { lang } = useM08(); const t = useText(); const [page, setPage] = useState(0); const pages = Math.max(1, Math.ceil(rows.length / 50)), current = Math.min(page, pages - 1);
  if (!rows.length) return <Empty />;
  return <div><div className="overflow-x-auto rounded-xl border"><table className="w-full text-start text-sm"><thead className="bg-secondary"><tr>{columns.map(c => <th key={c.key} className="whitespace-nowrap p-3 text-start">{c.label[lang]}</th>)}{actions && <th>{t('الإجراءات', 'Actions')}</th>}</tr></thead><tbody>{rows.slice(current * 50, (current + 1) * 50).map((row, index) => <tr key={`${row.id ?? row.key ?? index}:${row.version ?? index}`} className="border-t align-top hover:bg-secondary/30">{columns.map(c => <td key={c.key} className="max-w-sm whitespace-pre-wrap break-words p-3">{c.render ? c.render(row) : row[c.key] == null ? '—' : typeof row[c.key] === 'object' ? JSON.stringify(row[c.key]) : String(row[c.key])}</td>)}{actions && <td className="p-2"><div className="flex flex-wrap gap-1">{actions(row)}</div></td>}</tr>)}</tbody></table></div>
    <div className="mt-2 flex items-center justify-between text-xs"><span>{rows.length} {t('سجل', 'records')} · {current + 1}/{pages}</span><div className="flex gap-2"><Button disabled={!current} onClick={() => setPage(current - 1)}>{t('السابق', 'Previous')}</Button><Button disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>{t('التالي', 'Next')}</Button></div></div>
  </div>;
}
export function Decision({ title, action, payload, onClose }: { title: string; action: string; payload: Row; onClose: () => void }) { const { command } = useM08(); return <EditDialog title={title} fields={[]} initial={{}} onSave={(_, reason) => command(action, payload, reason)} onClose={onClose} />; }
