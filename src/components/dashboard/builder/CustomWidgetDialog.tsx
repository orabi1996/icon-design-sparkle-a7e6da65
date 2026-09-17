/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { MaterialIcon } from "@/components/MaterialIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import type {
  CustomWidgetDefinition,
  CustomDataSource,
  CustomMetricType,
  CustomChartType,
} from "../types";

interface CustomWidgetDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (widget: CustomWidgetDefinition) => void;
  initialWidget?: CustomWidgetDefinition | null;
}

const AVAILABLE_ICONS = [
  "query_stats",
  "groups",
  "payments",
  "storefront",
  "domain",
  "badge",
  "fingerprint",
  "beach_access",
  "bar_chart",
  "pie_chart",
  "stacked_bar_chart",
  "leaderboard",
  "timeline",
  "assessment",
  "category",
  "lan",
  "how_to_reg",
];

const AVAILABLE_COLORS = [
  { label: "أزرق تنفيذي", value: "#0b57d0" },
  { label: "أخضر نمو", value: "#137333" },
  { label: "برتقالي عمليات", value: "#b06000" },
  { label: "كحلي استراتيجي", value: "#00639b" },
  { label: "بنفسجي إداري", value: "#6750a4" },
  { label: "أحمر تنبيهي", value: "#ba1a1a" },
];

export function CustomWidgetDialog({
  isOpen,
  onClose,
  onSave,
  initialWidget,
}: CustomWidgetDialogProps) {
  const [title, setTitle] = useState(initialWidget?.title || "");
  const [description, setDescription] = useState(initialWidget?.description || "");
  const [category, setCategory] = useState(initialWidget?.category || "القوى العاملة");
  const [icon, setIcon] = useState(initialWidget?.icon || "query_stats");
  const [defaultColSpan, setDefaultColSpan] = useState<number>(initialWidget?.defaultColSpan || 6);
  const [isPublic, setIsPublic] = useState(initialWidget?.isPublic ?? true);

  const [dataSource, setDataSource] = useState<CustomDataSource>(
    initialWidget?.dataSource || "employees"
  );
  const [metricType, setMetricType] = useState<CustomMetricType>(
    initialWidget?.metricType || "count"
  );
  const [valueField, setValueField] = useState(initialWidget?.valueField || "basic_salary");
  const [dimension, setDimension] = useState(initialWidget?.dimension || "department");
  const [chartType, setChartType] = useState<CustomChartType>(
    initialWidget?.chartType || "horizontal_bar"
  );
  const [toneColor, setToneColor] = useState(initialWidget?.toneColor || "#0b57d0");
  const [limit, setLimit] = useState(initialWidget?.limit || 6);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newDef: CustomWidgetDefinition = {
      id: initialWidget?.id || `cw-${Date.now()}`,
      title: title.trim(),
      description: description.trim() || undefined,
      category: category.trim() || "مخصص",
      icon,
      defaultColSpan,
      isPublic,
      dataSource,
      metricType,
      valueField: metricType === "sum" || metricType === "avg" ? valueField : undefined,
      dimension: chartType === "kpi_card" && dimension === "none" ? undefined : dimension,
      chartType,
      limit,
      toneColor,
      createdAt: initialWidget?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSave(newDef);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto"
      dir="rtl"
    >
      <div className="w-full max-w-2xl my-8 rounded-3xl border border-border bg-card p-6 shadow-2xl text-card-foreground text-right animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <span
              className="grid size-10 place-items-center rounded-2xl text-white shadow-xs"
              style={{ backgroundColor: toneColor }}
            >
              <MaterialIcon name={icon} size={22} filled />
            </span>
            <div>
              <h2 className="text-base font-black text-foreground">
                {initialWidget ? "تعديل العنصر المخصص" : "إنشاء عنصر مخصص جديد للنظام"}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                حدد مقاييس ومصادر البيانات وشكل العرض البياني لنشر عنصر عام على مستوى المنشأة
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="size-8 rounded-xl text-muted-foreground hover:text-foreground"
          >
            <MaterialIcon name="close" size={20} />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          {/* Section 1: Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                اسم العنصر <span className="text-rose-500">*</span>
              </label>
              <Input
                type="text"
                placeholder="مثال: توزيع الكوادر حسب الفروع"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="h-10 text-xs font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                التصنيف
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-xs font-bold text-foreground"
              >
                <option value="القوى العاملة">القوى العاملة</option>
                <option value="المالية والأجور">المالية والأجور</option>
                <option value="العمليات والموافقات">العمليات والموافقات</option>
                <option value="الحضور والانصراف">الحضور والانصراف</option>
                <option value="التحليلات المتقدمة">التحليلات المتقدمة</option>
                <option value="مخصص">مخصص</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-foreground mb-1">
                الوصف التوضيحي (اختياري)
              </label>
              <Input
                type="text"
                placeholder="نص يظهر أسفل العنوان يوضح الهدف من هذا المؤشر..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="h-10 text-xs font-bold"
              />
            </div>
          </div>

          {/* Section 2: Data Source & Metrics */}
          <div className="p-4 rounded-2xl border border-border bg-muted/30 space-y-4">
            <div className="flex items-center gap-2">
              <MaterialIcon name="dataset" size={18} className="text-primary" />
              <span className="text-xs font-black text-foreground">
                مصدر البيانات وقواعد الحساب
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Dataset entity */}
              <div>
                <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                  مصدر البيانات (Entity)
                </label>
                <select
                  value={dataSource}
                  onChange={(e) => setDataSource(e.target.value as CustomDataSource)}
                  className="h-9 w-full rounded-xl border border-input bg-background px-2.5 text-xs font-bold text-foreground"
                >
                  <option value="employees">الموظفون (القوى العاملة)</option>
                  <option value="attendance">سجلات الحضور والانصراف</option>
                  <option value="leave_requests">طلبات الإجازات</option>
                  <option value="requests">الطلبات العامة والاستئذان</option>
                  <option value="loans">السلف والقروض المالية</option>
                  <option value="payroll_runs">مسيرات الرواتب</option>
                </select>
              </div>

              {/* Metric Type */}
              <div>
                <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                  نوع الحساب والتجميع
                </label>
                <select
                  value={metricType}
                  onChange={(e) => setMetricType(e.target.value as CustomMetricType)}
                  className="h-9 w-full rounded-xl border border-input bg-background px-2.5 text-xs font-bold text-foreground"
                >
                  <option value="count">عدد السجلات / الموظفين</option>
                  <option value="sum">مجموع مالي / قيمة إجمالية</option>
                  <option value="avg">متوسط حسابي</option>
                </select>
              </div>

              {/* Value Field (conditional) */}
              <div>
                <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                  حقل القيمة للحساب
                </label>
                <select
                  value={valueField}
                  disabled={metricType === "count"}
                  onChange={(e) => setValueField(e.target.value)}
                  className="h-9 w-full rounded-xl border border-input bg-background px-2.5 text-xs font-bold text-foreground disabled:opacity-50"
                >
                  <option value="basic_salary">الراتب الأساسي</option>
                  <option value="allowances">البدلات</option>
                  <option value="amount">مبلغ السلفة / الطلب</option>
                  <option value="late_minutes">دقائق التأخير</option>
                </select>
              </div>
            </div>

            {/* Dimension / Grouping */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                  تقسيم وتجميع البيانات حسب (Dimension)
                </label>
                <select
                  value={dimension}
                  onChange={(e) => setDimension(e.target.value)}
                  className="h-9 w-full rounded-xl border border-input bg-background px-2.5 text-xs font-bold text-foreground"
                >
                  <option value="branch">الفرع وموقع العمل</option>
                  <option value="department">القسم التنظيمي</option>
                  <option value="sector">القطاع</option>
                  <option value="job_level">المستوى الوظيفي</option>
                  <option value="job_category">الفئة الوظيفية</option>
                  <option value="nationality">الجنسية</option>
                  <option value="status">الحالة الوظيفية</option>
                  <option value="type">نوع الطلب / الإجازة</option>
                  <option value="none">بدون تقسيم (مؤشر موحد)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                  الحد الأقصى للفئات المعروضة
                </label>
                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="h-9 w-full rounded-xl border border-input bg-background px-2.5 text-xs font-bold text-foreground"
                >
                  <option value={5}>أعلى 5 فئات</option>
                  <option value={8}>أعلى 8 فئات</option>
                  <option value={12}>أعلى 12 فئة</option>
                  <option value={20}>أعلى 20 فئة</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 3: Visualization & Design */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                نمط وتنسيق العرض البياني
              </label>
              <select
                value={chartType}
                onChange={(e) => setChartType(e.target.value as CustomChartType)}
                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-xs font-bold text-foreground"
              >
                <option value="horizontal_bar">أعمدة بيانية أفقية (Horizontal Bars)</option>
                <option value="bar">أعمدة بيانية رأسية (Vertical Bars)</option>
                <option value="donut">رسم مجوف (Donut Chart)</option>
                <option value="pie">رسم دائري كامل (Pie Chart)</option>
                <option value="progress_list">قائمة نسب وأشرطة تقدم (Progress List)</option>
                <option value="table">جدول بيانات مصغر (Mini Table)</option>
                <option value="kpi_card">بطاقة مؤشر رقمي (KPI Metric Card)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                عرض العنصر في اللوحة (الأعمدة)
              </label>
              <select
                value={defaultColSpan}
                onChange={(e) => setDefaultColSpan(Number(e.target.value))}
                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-xs font-bold text-foreground"
              >
                <option value={12}>عرض كامل (12 عموداً - كامل الشاشة)</option>
                <option value={8}>ثلثا الشاشة (8 أعمدة)</option>
                <option value={6}>نصف الشاشة (6 أعمدة)</option>
                <option value={4}>ثلث الشاشة (4 أعمدة)</option>
                <option value={3}>ربع الشاشة (3 أعمدة)</option>
              </select>
            </div>
          </div>

          {/* Section 4: Icon & Tone Color Pickers */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-foreground">
              اختر أيقونة العنصر
            </label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_ICONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcon(ic)}
                  className={`grid size-9 place-items-center rounded-xl border transition cursor-pointer ${
                    icon === ic
                      ? "border-primary bg-primary text-primary-foreground shadow-xs"
                      : "border-border bg-background text-muted-foreground hover:bg-muted"
                  }`}
                  title={ic}
                >
                  <MaterialIcon name={ic} size={18} />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold text-foreground">
              اللون الدلالي المميز
            </label>
            <div className="flex flex-wrap gap-2.5">
              {AVAILABLE_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setToneColor(c.value)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-bold transition cursor-pointer ${
                    toneColor === c.value
                      ? "border-foreground ring-2 ring-primary/40 bg-muted"
                      : "border-border hover:bg-muted/50 text-muted-foreground"
                  }`}
                >
                  <span className="size-3 rounded-full" style={{ backgroundColor: c.value }} />
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Section 5: Public / Scope Setting */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl border border-border bg-muted/40">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-black text-foreground">
                  نشر العنصر كعنصر عام للنظام (Public Element)
                </h4>
                <Badge variant="secondary" className="text-[10px] font-bold">
                  موصى به
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                عند تفعيل هذا الخيار، يصبح العنصر متاحاً في مكتبة العناصر لجميع المسؤولين وفي أي لوحة تحكم بالمنشأة.
              </p>
            </div>

            <Switch
              checked={isPublic}
              onCheckedChange={setIsPublic}
            />
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="rounded-xl text-xs font-bold"
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              className="rounded-xl text-xs font-black gap-1.5 shadow-xs"
            >
              <MaterialIcon name="check" size={16} />
              <span>حفظ ونشر العنصر المخصص</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
