import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { MaterialIcon } from "@/components/MaterialIcon";
import { SCREENS } from "@/lib/screen-catalog.mjs";
import { normalizeSearch } from "@/lib/business-core.mjs";

const statusLabels = {
  phase1: "تطوير المرحلة الأولى",
  needs_business: "يحتاج استكمال البيزنس",
  business: "بيانات محفوظة وقواعد تشغيل مفعّلة",
  legacy: "شاشة قائمة — لم تُعتمد وظيفيًا",
};

export function ScreenDirectory({ open, onOpenChange }: { open: boolean; onOpenChange: (value: boolean) => void }) {
  const [term, setTerm] = useState("");
  const [section, setSection] = useState("");
  const groups = useMemo(() => [...new Set(SCREENS.map((screen) => screen.section))], []);
  const filtered = useMemo(() => {
    const query = normalizeSearch(term);
    return SCREENS.filter((screen) => (!section || screen.section === section) &&
      (!query || normalizeSearch(screen.title + " " + screen.path + " " + screen.section).includes(query)));
  }, [term, section]);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(new URL("/?screens=all", window.location.origin).href);
      toast.success("تم نسخ رابط دليل الشاشات");
    } catch {
      toast.error("تعذر النسخ؛ رابط الدليل هو /?screens=all على نفس الموقع.");
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[90vh] max-w-4xl overflow-y-auto p-5">
        <DialogTitle className="flex items-center gap-2"><MaterialIcon name="apps" size={22} />دليل شاشات النظام</DialogTitle>
        <DialogDescription>روابط مباشرة للشاشات الموجودة. وجود الرابط لا يعني اكتمال البيزنس أو منح صلاحية الوصول إلى البيانات.</DialogDescription>
        <div className="grid gap-3 md:grid-cols-[1fr_12rem_auto]">
          <label className="text-xs font-bold">البحث عن شاشة
            <input autoFocus value={term} onChange={(event) => setTerm(event.target.value)} placeholder="اسم الشاشة أو المسار..." className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" />
          </label>
          <label className="text-xs font-bold">القسم
            <select value={section} onChange={(event) => setSection(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-2 text-sm">
              <option value="">كل الأقسام</option>{groups.map((group) => <option key={group} value={group}>{group}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => { void copyLink(); }} className="self-end rounded-lg border px-3 py-2 text-sm">نسخ رابط الدليل</button>
        </div>
        <p role="status" className="text-xs text-slate-500">{filtered.length} من {SCREENS.length} شاشة — اختصار البحث Ctrl+K أو ⌘K</p>
        {filtered.length === 0 ? <p className="p-6 text-center text-sm">لا توجد شاشة مطابقة للبحث.</p> :
          <div className="grid gap-2 md:grid-cols-2">
            {filtered.map((screen) => <Link key={screen.path} to={screen.path as never} onClick={() => onOpenChange(false)} className="rounded-xl border border-slate-200 p-3 transition hover:border-blue-300 hover:bg-blue-50">
              <span className="block text-sm font-bold text-[#004e82]">{screen.title}</span>
              <span className="mt-1 block text-xs text-slate-500">{screen.section} — {statusLabels[screen.status]}</span>
              <code dir="ltr" className="mt-1 block break-all text-left text-[11px] text-slate-400">{screen.path}</code>
            </Link>)}
          </div>}
      </DialogContent>
    </Dialog>
  );
}
