import { useState } from "react";
import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { MaterialIcon } from "@/components/MaterialIcon";
import { AppShell } from "@/components/hr/AppShell";
import { CrudTable } from "@/components/hr/CrudTable";
import { useRows } from "@/lib/hr-db";
import {
  Breadcrumbs,
  Btn,
  Card,
  Check,
  Chip,
  DataTable,
  DateInput,
  Field,
  Input,
  PageBanner,
  Pager,
  Select,
  TableToolbar,
} from "@/components/hr/ui";

export const Route = createFileRoute("/payroll")({
  head: () => ({
    meta: [
      { title: "تجهيز المسير | رواتب الموظفين" },
      {
        name: "description",
        content:
          "تجهيز مسودة المسير والتسوية والتحميل من الاكسيل، اغلاق وفك اغلاق المسير، التصفية، ملف البنك، الاستثناءات وأرشيف المسيرات.",
      },
      { property: "og:title", content: "تجهيز المسير" },
      {
        property: "og:description",
        content: "إدارة مسير الرواتب: المسودة، الاغلاق، الترحيل، التصفية والبنك.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PayrollRoute,
});

function PayrollRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname.replace(/\/$/, "") !== "/payroll") return <Outlet />;
  return <Payroll />;
}

const years = ["اختر ....", "٢٠٢٦", "٢٠٢٥", "٢٠٢٤"];
const months = ["اختر ....", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩", "١٠", "١١", "١٢"];
const branches = ["اختر ....", "شركة الحلول الخبيرة", "شركةالحلول٢"];
const opt = ["اختر ...."];

const tabs = [
  { key: "draft", label: "مسودة المسير", icon: "draft" },
  { key: "close", label: "اغلاق المسير", icon: "lock" },
  { key: "journal", label: "ترحيل قيد مسير الرواتب", icon: "sync_alt" },
  { key: "settle", label: "تصفية", icon: "how_to_reg" },
  { key: "bank", label: "بنك", icon: "account_balance" },
  { key: "archive", label: "الارشيف", icon: "inventory_2" },
  { key: "exceptions", label: "الاستثناءات", icon: "rule" },
  { key: "runs", label: "ارشيف المسيرات", icon: "folder_copy" },
];

const subMenus: Record<string, { title: string; items: string[] }> = {
  draft: {
    title: "مسودة المسير",
    items: [
      "تجهيز مسودة المسير",
      "تجهيز مسودة التسوية",
      "تجهيز مسودة التسوية التحميل من الاكسيل",
      "تعديل مسودة المسير",
      "حذف مسودة المسير",
    ],
  },
  close: { title: "اغلاق المسير", items: ["اغلاق المسير", "فك اغلاق المسير"] },
  journal: { title: "ترحيل القيد", items: ["ترحيل قيد مسير الرواتب", "استعراض القيود المرحلة"] },
  settle: { title: "تصفية", items: ["تصفية", "تعديل التصفية"] },
  bank: {
    title: "بنك",
    items: [
      "بنك الراجحي",
      "بنك البلاد",
      "بنك الاهلى",
      "بنك الانماء",
      "بنك الرياض",
      "بنك سعودى فرنسى",
      "بنك الجزيرة",
      "بنك السعودى البريطانى",
      "السعودى للاستثمار",
      "البنك العربى",
    ],
  },
  archive: { title: "الارشيف", items: ["الارشيف"] },
  exceptions: {
    title: "الاستثناءات",
    items: ["استثناء من خصومات البصمة", "استثناء الحضور والانصراف"],
  },
  runs: { title: "ارشيف المسيرات", items: ["ارشيف المسيرات"] },
};

function RadioRow({ options, name }: { options: string[]; name: string }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-6 rounded-xl border border-border bg-card px-5 py-3">
      {options.map((o, i) => (
        <label key={o} className="flex cursor-pointer items-center gap-2 text-[13px] font-bold">
          <input
            type="radio"
            name={name}
            defaultChecked={i === 0}
            className="size-4 accent-[var(--primary)]"
          />
          {o}
        </label>
      ))}
    </div>
  );
}

function FilterBar({ children, action }: { children: React.ReactNode; action: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl border border-border bg-secondary/40 p-5"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
      <div className="mt-5 flex justify-center">{action}</div>
    </div>
  );
}

function DraftPrepare() {
  return (
    <FilterBar
      action={
        <Btn icon="play_circle" variant="teal">
          تجهيز
        </Btn>
      }
    >
      <Field label="السنه" required>
        <Select options={years} />
      </Field>
      <Field label="الشهر" required>
        <Select options={months} />
      </Field>
      <Field label="تاريخ نهاية الاحتساب">
        <DateInput />
      </Field>
      <Field label="الفرع">
        <Select options={branches} />
      </Field>
      <Field label="الأقسام">
        <Select options={opt} />
      </Field>
      <Field label="القسم الرئيسي">
        <Select options={opt} />
      </Field>
      <Field label="المسار">
        <Select options={opt} />
      </Field>
      <Field label="القطاع">
        <Select options={opt} />
      </Field>
      <Field label="الفئة الوظيفية">
        <Select options={opt} />
      </Field>
      <Field label="الموظفين">
        <Select options={opt} />
      </Field>
      <div className="sm:col-span-2">
        <Check
          label="اضافة قيمة رصيد الاجازة للمسير"
          hint="يتم إضافة رصيد الأجازة المستحق ضمن احتساب المسير"
        />
      </div>
    </FilterBar>
  );
}

function SettlementPrepare() {
  return (
    <FilterBar
      action={
        <Btn icon="calculate" variant="teal">
          احتساب التسوية
        </Btn>
      }
    >
      <Field label="السنه" required>
        <Select options={years} />
      </Field>
      <Field label="الشهر" required>
        <Select options={months} />
      </Field>
      <Field label="الفرع">
        <Select options={branches} />
      </Field>
      <Field label="الأقسام">
        <Select options={opt} />
      </Field>
      <Field label="القسم الرئيسي">
        <Select options={opt} />
      </Field>
      <Field label="المسار">
        <Select options={opt} />
      </Field>
      <Field label="القطاع">
        <Select options={opt} />
      </Field>
      <Field label="الموظفين">
        <Select options={opt} />
      </Field>
      <Field label="الاستحقاق">
        <Select options={opt} />
      </Field>
      <Field label="الاستقطاع">
        <Select options={opt} />
      </Field>
      <Field label="قيمة الاستحقاق">
        <Input defaultValue="0" />
      </Field>
      <Field label="قيمة الاستقطاع">
        <Input defaultValue="0" />
      </Field>
      <div className="xl:col-span-2">
        <Field label="ملاحظات">
          <Input placeholder="ملاحظات التسوية" />
        </Field>
      </div>
      <Check label="اضافة قيمة رصيد الاجازة للمسير" />
      <Check label="سداد اقساط السلف كاملة" />
    </FilterBar>
  );
}

function ExcelUpload() {
  return (
    <Card title="تجهيز مسودة التسوية التحميل من الاكسيل" icon="upload_file">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="السنه" required>
          <Select options={years} />
        </Field>
        <Field label="الشهور" required>
          <Select options={months} />
        </Field>
        <Field label="الاستحقاق">
          <Select options={opt} />
        </Field>
        <Field label="الاستقطاع">
          <Select options={opt} />
        </Field>
      </div>
      <label className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-primary/35 bg-secondary/50 px-6 py-8 text-center transition-colors hover:border-primary/70">
        <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
          <MaterialIcon name="cloud_upload" size={26} filled />
        </span>
        <span className="text-[13px] font-bold">اسحب ملف الاكسيل هنا أو اضغط للاختيار</span>
        <span className="text-[11px] font-semibold text-muted-foreground">
          xlsx / xls بحد أقصى ٥ ميجابايت
        </span>
        <input type="file" className="hidden" accept=".xlsx,.xls" />
      </label>
      <div className="mt-4 flex justify-center gap-2">
        <Btn icon="upload" variant="teal">
          رفع
        </Btn>
        <Btn icon="download" variant="ghost">
          تحميل نموذج
        </Btn>
      </div>
    </Card>
  );
}

const excelCols = [
  "السنه",
  "الشهور",
  "الاستحقاقات",
  "الاستقطاعات",
  "الرقم الوظيفى",
  "الاستحقاق القيمة",
  "الاستقطاع القيمة",
];
const editCols = [
  "اسم الموظف",
  "تاريخ الادخال",
  "الفرع",
  "القسم",
  "نوع المسير",
  "طريقة الاحتساب",
  "المستخدم",
  "اسم البند",
  "القيمة",
  "إجراءات",
];
const deleteCols = [
  "اسم الموظف",
  "الرقم الوظيفى",
  "Insert Date",
  "اسم المستخدم",
  "رقم الهويه",
  "الأقسام",
  "القسم الرئيسى",
  "القطاع",
  "المسار",
  "نوع المسير",
  "الاستحقاقات",
  "الاستقطاعات",
];
const unlockCols = [
  "رقم المسير",
  "الشهر",
  "تاريخ الاغلاق",
  "نوع المسير",
  "الفرع",
  "اغلاق",
  "صافى الرواتب",
];

function TableBlock({ columns }: { columns: string[] }) {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-border bg-card"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <TableToolbar title="النتائج" />
      <DataTable columns={columns} rows={[]} empty="لا توجد بيانات" />
      <Pager />
    </div>
  );
}

function SearchDraft({ withType, columns }: { withType?: boolean; columns: string[] }) {
  return (
    <div className="space-y-4">
      <div
        className="rounded-2xl border border-border bg-secondary/40 p-5"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        {withType && (
          <div className="mx-auto mb-4 max-w-md">
            <RadioRow name="mtype" options={["رواتب", "تصفية", "تسوية"]} />
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="السنه">
            <Select options={years} />
          </Field>
          <Field label="الشهر">
            <Select options={months} />
          </Field>
          <Field label="الفرع">
            <Select options={branches} />
          </Field>
          <Field label="الأقسام">
            <Select options={opt} />
          </Field>
          <Field label="القسم الرئيسي">
            <Select options={opt} />
          </Field>
          <Field label="المسار">
            <Select options={opt} />
          </Field>
          <Field label="القطاع">
            <Select options={opt} />
          </Field>
          <div className="flex items-end">
            <Btn icon="search">بحث</Btn>
          </div>
        </div>
      </div>
      <TableBlock columns={columns} />
    </div>
  );
}

function Unlock() {
  return (
    <div className="space-y-4">
      <div
        className="rounded-2xl border border-border bg-secondary/40 p-5"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <div className="mx-auto mb-4 max-w-md">
          <RadioRow name="utype" options={["رواتب", "تصفية", "تسوية"]} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="السنه">
            <Select options={years} />
          </Field>
          <Field label="الشهر">
            <Select options={months} />
          </Field>
          <div className="flex items-end">
            <Btn icon="search">بحث</Btn>
          </div>
        </div>
      </div>
      <TableBlock columns={unlockCols} />
    </div>
  );
}

function SettleCalc() {
  return (
    <FilterBar
      action={
        <Btn icon="calculate" variant="teal">
          احتساب التصفية
        </Btn>
      }
    >
      <Field label="الجنسيه">
        <Select options={opt} />
      </Field>
      <Field label="الفروع">
        <Select options={branches} />
      </Field>
      <Field label="الأقسام">
        <Select options={opt} />
      </Field>
      <Field label="القسم الرئيسي">
        <Select options={opt} />
      </Field>
      <Field label="المسار">
        <Select options={opt} />
      </Field>
      <Field label="القطاع">
        <Select options={opt} />
      </Field>
      <Field label="الموظفين">
        <Select options={opt} />
      </Field>
      <Check label="احتساب بند التعويض" />
    </FilterBar>
  );
}

const settleAccruals = [
  { n: "راتب اساسي", v: "١,٦٦٦.٦٧", d: "٢٠٢٦/٠٥/١٢" },
  { n: "بدل انتقال", v: "٤.١٧", d: "٢٠٢٦/٠٥/١٢" },
  { n: "بدلات أخرى", v: "٨٣.٣٣", d: "٢٠٢٦/٠٥/١٢" },
  { n: "مكافأة نهاية الخدمة", v: "٢,٦٩٢.٦٥", d: "٢٠٢٦/٠٥/١٢" },
  { n: "رصيد إجازة سنوية", v: "٤,٥٠٢.٠٠", d: "٢٠٢٦/٠٥/١٢" },
];
const settleDeductions = [
  { n: "ت.ج - التعطل عن العمل - ساند", v: "١٢.٦٥-", d: "٢٠٢٦/٠٥/١٢" },
  { n: "ت.ج - المعاشات", v: "١٥١.٨٠-", d: "٢٠٢٦/٠٥/١٢" },
  { n: "البصمة", v: "٥٠٠.٠٠-", d: "٢٠٢٥/١٢/١٧" },
  { n: "تأخر", v: "٠.٥٦-", d: "٢٠٢٥/١٢/١٦" },
  { n: "غياب", v: "٣٥٦.٦٧-", d: "٢٠٢٦/٠١/٠٤" },
];

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/45 px-3 py-2">
      <span className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
        <MaterialIcon name="person" size={13} />
        {label}
      </span>
      <span className="mt-0.5 block text-[13px] font-extrabold">{value}</span>
    </div>
  );
}

function SettleEdit() {
  const info = [
    ["الرقم الوظيفي", "١٠"],
    ["المنطقة", "بنى سويف"],
    ["الفرع", "شركة الحلول الخبيرة"],
    ["القسم", "التطوير"],
    ["المسمى الوظيفي", "سعودي تأمينات"],
    ["المستوى الوظيفي", "إداري"],
    ["الجنسية", "سعودي"],
    ["الوظيفة الحالية", "مسؤول تقنية المعلومات"],
    ["رقم الهوية", "١٠٣٨٤٩٣٥٨٥٨"],
    ["تاريخ التعيين", "٢٠٢٥/٧/١"],
    ["شهر التصفية", "٢٠٢٦ / ١"],
    ["الراتب الاساسي", "١٠٠٠٠"],
    ["اجمالي ايام العمل", "١٨٥"],
    ["رصيد الأجازة المستهلك", "٠"],
    ["صافي ايام العمل المحتسبة", "١٨٥"],
    ["ايام العمل بالسنوات", "٠"],
    ["ايام العمل بالشهر", "٨"],
    ["ايام العمل باليوم", "٦"],
    ["تاريخ النهاية", "٢٠٢٦/١/٥"],
    ["سبب الايقاف", "no"],
  ] as const;

  return (
    <div className="space-y-4">
      <div
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-secondary/40 p-5"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <div className="min-w-[260px] flex-1">
          <Field label="موظفين تم تصفيتهم">
            <Select options={["اختر ....", "جواد صغرى - إقرار الجحيش - انتهى"]} />
          </Field>
        </div>
        <Btn icon="add" variant="teal">
          اضافة استحقاق
        </Btn>
        <Btn icon="remove" variant="ghost">
          اضافة استقطاع
        </Btn>
        <Btn icon="delete" variant="soft">
          حذف التصفية
        </Btn>
      </div>

      <Card title="بيانات الموظف" icon="badge">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {info.map(([l, v]) => (
            <InfoCell key={l} label={l} value={v} />
          ))}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="الاستحقاقات" icon="trending_up" padded={false}>
          <DataTable
            columns={["اسم البند", "القيمة", "التاريخ"]}
            rows={settleAccruals.map((r) => ({ "اسم البند": r.n, القيمة: r.v, التاريخ: r.d }))}
          />
        </Card>
        <Card title="الاستقطاعات" icon="trending_down" padded={false}>
          <DataTable
            columns={["اسم البند", "القيمة", "التاريخ"]}
            rows={settleDeductions.map((r) => ({ "اسم البند": r.n, القيمة: r.v, التاريخ: r.d }))}
          />
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { l: "صافى الراتب", v: "١١,٢٧٢.٥٩-", i: "payments" },
          { l: "نسبة الخصم", v: "٢.٢٦", i: "percent" },
          { l: "المصروفات الحكومية", v: "١٤٥.١٦", i: "account_balance" },
        ].map((s) => (
          <div
            key={s.l}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <MaterialIcon name={s.i} size={20} filled />
            </span>
            <span>
              <span className="block text-[11px] font-bold text-muted-foreground">{s.l}</span>
              <span className="text-base font-extrabold">{s.v}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Simple({ title, icon, columns }: { title: string; icon: string; columns: string[] }) {
  return (
    <div className="space-y-4">
      <Card title={title} icon={icon}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="السنه">
            <Select options={years} />
          </Field>
          <Field label="الشهر">
            <Select options={months} />
          </Field>
          <Field label="الفرع">
            <Select options={branches} />
          </Field>
          <div className="flex items-end">
            <Btn icon="search">بحث</Btn>
          </div>
        </div>
      </Card>
      <TableBlock columns={columns} />
    </div>
  );
}

function IconBtn({
  icon,
  tone = "primary",
}: {
  icon: string;
  tone?: "primary" | "destructive" | "teal";
}) {
  const tones = {
    primary: "bg-primary/10 text-primary hover:bg-primary/20",
    destructive: "bg-destructive/10 text-destructive hover:bg-destructive/20",
    teal: "bg-teal/12 text-teal hover:bg-teal/20",
  } as const;
  return (
    <button
      className={`grid size-8 place-items-center rounded-lg transition-colors ${tones[tone]}`}
    >
      <MaterialIcon name={icon} size={17} />
    </button>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-4 backdrop-blur-sm">
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card"
        style={{ boxShadow: "var(--shadow-raised)" }}
      >
        <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-extrabold text-primary">{title}</h2>
          <button
            onClick={onClose}
            className="ms-auto grid size-8 place-items-center rounded-lg bg-destructive/10 text-destructive transition-colors hover:bg-destructive/20"
          >
            <MaterialIcon name="close" size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function BankFile({ bank }: { bank: string }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_290px]">
      <div
        className="rounded-2xl border border-border bg-secondary/40 p-5"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card px-4 py-3">
          <span className="text-[12px] font-extrabold text-muted-foreground">نوع المسير:</span>
          {["رواتب", "تصفية", "تسوية"].map((o, i) => (
            <label key={o} className="flex cursor-pointer items-center gap-2 text-[13px] font-bold">
              <input
                type="radio"
                name="banktype"
                defaultChecked={i === 0}
                className="size-4 accent-[var(--primary)]"
              />
              {o}
            </label>
          ))}
          <span className="ms-auto text-[12px] font-extrabold text-primary">{bank}</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="السنه">
            <Select options={years} />
          </Field>
          <Field label="الشهر">
            <Select options={months} />
          </Field>
          <Field label="رقم المسير">
            <Select options={opt} />
          </Field>
          <Field label="الفرع">
            <Select options={branches} />
          </Field>
          <Field label="اسم الكفيل">
            <Select
              options={["اختر ....", "شركة الحلول الخبيرة لتقنية المعلومات", "كفالة افتراضية تيست"]}
            />
          </Field>
          <Field label="اسم الموظف">
            <Select options={opt} />
          </Field>
        </div>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Btn icon="settings_suggest">معالجة</Btn>
          <Btn icon="verified" variant="ghost">
            تحقق نسبة الالتزام
          </Btn>
        </div>
      </div>
      <Card title="تحقق نسبة الالتزام" icon="donut_large">
        <div className="grid place-items-center rounded-xl border border-dashed border-border bg-secondary/50 px-4 py-10 text-center text-[12px] font-semibold text-muted-foreground">
          اضغط "تحقق نسبة الالتزام" لعرض الإحصائيات
        </div>
      </Card>
    </div>
  );
}

const archiveCols = [
  "اسم الحقل",
  "اسم الكفيل",
  "تاريخ التصدير",
  "اسم المستخدم",
  "حالة البنك",
  "نوع المسير",
  'الاسم "الارشيف"',
  "تصدير",
  "حذف",
];
const archiveRows = [
  { f: "20251016100221", k: "شركة الحلول الخبيرة لتقنية المعلومات", d: "2025/10/16", t: "رواتب" },
  { f: "20251127125747", k: "شركة الحلول الخبيرة", d: "2025/11/27", t: "رواتب" },
  { f: "190526214579857", k: "كفالة افتراضية تيست", d: "2026/05/19", t: "رواتب" },
  { f: "050726553932185", k: "كفالة افتراضية تيست", d: "2026/07/05", t: "رواتب" },
  { f: "0507261533756733", k: "شركة الحلول الخبيرة لتقنية المعلومات", d: "2026/07/05", t: "رواتب" },
  { f: "0507262064903503", k: "كفالة افتراضية تيست", d: "2026/07/05", t: "رواتب" },
  { f: "1307261379589170", k: "كفالة افتراضية تيست", d: "2026/07/13", t: "تسويه" },
  { f: "140726260026269", k: "كفالة افتراضية تيست", d: "2026/07/14", t: "رواتب" },
  { f: "140726451582318", k: "كفالة افتراضية تيست", d: "2026/07/14", t: "تسويه" },
  { f: "1407261910733993", k: "كفالة افتراضية تيست", d: "2026/07/14", t: "تسويه" },
];

function BankArchive() {
  return (
    <div className="space-y-4">
      <div
        className="rounded-2xl border border-border bg-secondary/40 p-5"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="اسم الكفيل">
            <Select options={["اختر ....", "شركة الحلول الخبيرة", "كفالة افتراضية تيست"]} />
          </Field>
          <Field label="اسم الموظف">
            <Select options={opt} />
          </Field>
          <Field label="رقم الهويه">
            <Input />
          </Field>
          <Field label="الرقم الوظيفي">
            <Input />
          </Field>
          <Field label="التاريخ من">
            <DateInput />
          </Field>
          <Field label="التاريخ الى">
            <DateInput />
          </Field>
          <div className="flex items-end">
            <Btn icon="search">بحث</Btn>
          </div>
        </div>
      </div>
      <div
        className="overflow-hidden rounded-2xl border border-border bg-card"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <TableToolbar title="ارشيف ملفات البنك" />
        <DataTable
          columns={archiveCols}
          rows={archiveRows.map((r) => ({
            "اسم الحقل": r.f,
            "اسم الكفيل": r.k,
            "تاريخ التصدير": r.d,
            "اسم المستخدم": "System Admin",
            "حالة البنك": <Chip label="لم يتم الرد" tone="muted" />,
            "نوع المسير": <Chip label={r.t} tone={r.t === "رواتب" ? "blue" : "teal"} />,
            'الاسم "الارشيف"': r.f,
            تصدير: <IconBtn icon="table_view" tone="teal" />,
            حذف: <IconBtn icon="delete" tone="destructive" />,
          }))}
        />
        <Pager page={1} pages={2} total={12} />
      </div>
    </div>
  );
}

function PayrollRuns() {
  return (
    <CrudTable
      table="payroll_runs"
      title="ارشيف المسيرات"
      addLabel="إضافة مسير"
      fields={[
        { key: "title", label: "اسم المسير", required: true },
        { key: "month", label: "الشهر", type: "number" },
        { key: "year", label: "السنة", type: "number" },
        {
          key: "status",
          label: "الحالة",
          type: "select",
          options: ["مسودة", "قيد المعالجة", "مقفل"],
        },
        { key: "employees_count", label: "عدد الموظفين", type: "number" },
        { key: "total_gross", label: "إجمالي الاستحقاقات", type: "number" },
        { key: "total_deductions", label: "إجمالي الاستقطاعات", type: "number" },
        { key: "total_net", label: "الصافي", type: "number" },
      ]}
    />
  );
}

function AttendanceExceptionsDb({ status }: { status: string }) {
  const employees = useRows("employees", { orderBy: "emp_no", ascending: true }).data ?? [];
  const names = employees.map((e) => String(e["full_name"]));
  return (
    <CrudTable
      table="attendance_records"
      title={status === "متأخر" ? "استثناءات البصمة (تأخير)" : "استثناءات الحضور (غياب)"}
      addLabel="اضافة استثناء"
      orderBy="work_date"
      filters={{ status }}
      fields={[
        {
          key: "employee_name",
          label: "اسم الموظف",
          type: "select",
          options: names,
          required: true,
        },
        { key: "work_date", label: "التاريخ", type: "date" },
        { key: "check_in", label: "وقت الحضور" },
        { key: "check_out", label: "وقت الانصراف" },
        { key: "late_minutes", label: "دقائق التأخير", type: "number" },
      ]}
    />
  );
}

function Payroll() {
  const [tab, setTab] = useState("draft");
  const [sub, setSub] = useState(0);
  const menu = subMenus[tab] ?? subMenus["draft"]!;

  const content = (() => {
    if (tab === "draft") {
      if (sub === 0) return <DraftPrepare />;
      if (sub === 1) return <SettlementPrepare />;
      if (sub === 2)
        return (
          <div className="space-y-4">
            <ExcelUpload />
            <TableBlock columns={excelCols} />
          </div>
        );
      if (sub === 3) return <SearchDraft withType columns={editCols} />;
      return <SearchDraft withType columns={deleteCols} />;
    }
    if (tab === "close")
      return sub === 0 ? <SearchDraft withType columns={deleteCols} /> : <Unlock />;
    if (tab === "settle") return sub === 0 ? <SettleCalc /> : <SettleEdit />;
    if (tab === "journal")
      return (
        <Simple
          title="ترحيل قيد مسير الرواتب"
          icon="sync_alt"
          columns={["رقم القيد", "التاريخ", "نوع المسير", "الفرع", "مدين", "دائن", "الحالة"]}
        />
      );
    if (tab === "bank") return <BankFile bank={menu.items[sub] ?? "بنك الراجحي"} />;
    if (tab === "archive") return <BankArchive />;
    if (tab === "exceptions")
      return <AttendanceExceptionsDb status={sub === 0 ? "متأخر" : "غائب"} />;
    return <PayrollRuns />;
  })();

  return (
    <AppShell>
      <div className="mt-4">
        <Breadcrumbs
          trail={["رواتب الموظفين", "تجهيز مسودة المسير", menu.items[sub] ?? menu.title]}
        />
        <PageBanner
          icon="payments"
          title="تجهيز المسير"
          subtitle="تجهيز المسودة والتسوية، الاغلاق والترحيل، التصفية وملفات البنك"
          actions={
            <Btn icon="download" variant="onDark">
              تصدير
            </Btn>
          }
        />

        <div
          className="mt-4 flex flex-wrap gap-1.5 rounded-2xl border border-border bg-card p-2"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          {tabs.map((t) => {
            const on = t.key === tab;
            return (
              <button
                key={t.key}
                onClick={() => {
                  setTab(t.key);
                  setSub(0);
                }}
                className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-[12.5px] font-bold transition-colors ${
                  on
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                <MaterialIcon name={t.icon} size={17} filled={on} />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="min-w-0 lg:order-1">{content}</div>
          <aside
            className="h-fit rounded-2xl border border-border bg-card p-3 lg:order-2"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <h2 className="mb-2 px-2 py-1 text-sm font-extrabold">{menu.title}</h2>
            <div className="space-y-1">
              {menu.items.map((it, i) => {
                const on = i === sub;
                return (
                  <button
                    key={it}
                    onClick={() => setSub(i)}
                    className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-right text-[12.5px] font-bold transition-colors ${
                      on
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground/80 hover:bg-secondary"
                    }`}
                  >
                    <MaterialIcon
                      name={on ? "radio_button_checked" : "radio_button_unchecked"}
                      size={16}
                    />
                    <span className="min-w-0 flex-1">{it}</span>
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
