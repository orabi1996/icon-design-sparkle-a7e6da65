import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/hr/AppShell";
import { MaterialIcon } from "@/components/MaterialIcon";
import { Breadcrumbs, Btn, Card, Field, Input, PageBanner, Select } from "@/components/hr/ui";
import { CrudTable } from "@/components/hr/CrudTable";
import { useRows, useSaveRow, useDeleteRow } from "@/lib/hr-db";
import { notifyWorkflow } from "@/lib/email/dispatcher";

export const Route = createFileRoute("/inquiries")({
  head: () => ({
    meta: [
      { title: "المسائلات | مسائلات الحضور والمسائلات الإدارية" },
      {
        name: "description",
        content:
          "إرسال مسائلات الحضور والانصراف آلياً، بحث المسائلات الإدارية بكل الفلاتر، وحذف المسائلات حسب الفرع والقسم والتاريخ.",
      },
      { property: "og:title", content: "المسائلات | شؤون الموظفين" },
      { property: "og:description", content: "إدارة مسائلات الموظفين: إرسال، بحث، حذف." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Inquiries,
});

const INQUIRY_NAMES = [
  "غياب الى من البصمة",
  "مسائلة غياب",
  "مسائلة انصراف مبكر",
  "مسائلة تأخير",
  "مسائلة تقصير في العمل",
];
const TYPES = ["غياب", "تأخير", "انصراف مبكر", "غيرذلك"];
const STATUSES = ["قيد التنفيذ", "مغلقة (مقبول)", "مغلقة (مرفوض)", "ملغاة"];
const SOURCES = ["تلقائي", "يدوي"];

const TABS = [
  { id: "send", label: "ارسال مسائلات الحضور والانصراف اليا", icon: "outgoing_mail" },
  { id: "search", label: "بحث المسائلات", icon: "manage_search" },
  { id: "remove", label: "حذف المسائلات", icon: "delete_sweep" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function Inquiries() {
  const [tab, setTab] = useState<TabId>("send");

  return (
    <AppShell>
      <div className="mt-4">
        <Breadcrumbs trail={["شئون الموظفين", "المسائلات"]} />
        <PageBanner
          icon="gavel"
          title="المسائلات"
          subtitle="إرسال وبحث وحذف مسائلات الحضور والانصراف والمسائلات الإدارية"
        />

        <div className="mt-4 flex flex-wrap gap-1 rounded-2xl border border-border bg-card p-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-[12.5px] font-bold transition-colors ${
                tab === t.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              <MaterialIcon name={t.icon} size={18} />
              {t.label}
            </button>
          ))}
        </div>

        {tab === "send" && <SendTab />}
        {tab === "search" && <SearchTab />}
        {tab === "remove" && <RemoveTab />}
      </div>
    </AppShell>
  );
}

/* ---------------- ارسال المسائلات اليا ---------------- */

function SendTab() {
  const save = useSaveRow("inquiries");
  const absent = useRows("attendance_records", { filters: { status: "غائب" }, limit: 200 }).data ?? [];
  const [name, setName] = useState(INQUIRY_NAMES[0] as string);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const send = async () => {
    const targets = absent.filter((r) => String(r["work_date"] ?? "") === date);
    if (targets.length === 0) {
      toast.error("لا يوجد موظفون بحالة غياب في هذا التاريخ");
      return;
    }
    for (const r of targets) {
      await save.mutateAsync({
        employee_id: r["employee_id"] ?? null,
        employee_name: r["employee_name"] ?? "",
        inquiry_name: name,
        inquiry_type: "غياب",
        status: "قيد التنفيذ",
        source: "تلقائي",
        inquiry_date: date,
        entry_date: date,
      });

      notifyWorkflow({
        eventType: "inquiry_issued",
        requestType: "مساءلة إدارية",
        employeeId: r["employee_id"],
        employeeName: r["employee_name"],
        inquiryName: name,
        inquiryType: "غياب",
        inquiryDate: date,
      });
    }
    toast.success(`تم إرسال ${targets.length} مسائلة`);
  };

  return (
    <div className="mt-4">
      <Card title="ارسال مسائلات الحضور والانصراف اليا" icon="outgoing_mail">
        <div className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="نوع المسائلة">
            <div className="relative">
              <select
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-10 w-full appearance-none rounded-xl border border-input bg-background px-3 pe-9 text-[13px] font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-ring/25"
              >
                {INQUIRY_NAMES.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
              <MaterialIcon
                name="expand_more"
                size={18}
                className="pointer-events-none absolute inset-y-0 left-2.5 my-auto h-fit text-muted-foreground"
              />
            </div>
          </Field>
          <Field label="التاريخ">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <div>
            <Btn icon="upload" variant="teal" onClick={send}>
              {save.isPending ? "جارٍ الإرسال..." : "ارسال المسائلات"}
            </Btn>
          </div>
          <p className="text-[12px] font-semibold text-muted-foreground">
            يتم إنشاء مسائلة تلقائية لكل موظف مسجّل غياب في التاريخ المحدد.
          </p>
        </div>
      </Card>
    </div>
  );
}

/* ---------------- بحث المسائلات ---------------- */

function SearchTab() {
  const employees = useRows("employees", { orderBy: "emp_no", ascending: true }).data ?? [];
  const names = employees.map((e) => String(e["full_name"]));
  const departments = [
    ...new Set(employees.map((e) => String(e["department"] ?? "")).filter(Boolean)),
  ];
  const branches = [...new Set(employees.map((e) => String(e["branch"] ?? "")).filter(Boolean))];

  return (
    <div className="mt-4 space-y-4">
      <Card title="فلاتر البحث" icon="filter_alt">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="الفرع">
            <Select options={["اختر ....", ...branches]} />
          </Field>
          <Field label="الأقسام">
            <Select options={["اختر ....", ...departments]} />
          </Field>
          <Field label="القسم الرئيسي">
            <Select />
          </Field>
          <Field label="القطاع">
            <Select />
          </Field>
          <Field label="المسار">
            <Select />
          </Field>
          <Field label="اسم الموظف">
            <Select options={["اختر ....", ...names]} />
          </Field>
          <Field label="الرقم الوظيفي">
            <Input placeholder="الرقم الوظيفي" />
          </Field>
          <Field label="رقم الهويه">
            <Input placeholder="رقم الهوية" />
          </Field>
          <Field label="نوع المسائلة">
            <Select options={["اختر ....", ...TYPES]} />
          </Field>
          <Field label="مسمى المسائلة">
            <Select options={["اختر ....", ...INQUIRY_NAMES]} />
          </Field>
          <Field label="تاريخ المسائلة من">
            <Input type="date" />
          </Field>
          <Field label="تاريخ المسائلة الى">
            <Input type="date" />
          </Field>
        </div>
        <div className="mt-4 flex justify-center">
          <Btn icon="search">بحث</Btn>
        </div>
      </Card>

      <CrudTable
        table="inquiries"
        title="المسائلات"
        addLabel="اضافة المسائلات الاداريه"
        orderBy="inquiry_date"
        fields={[
          { key: "employee_name", label: "اسم الموظف", type: "select", options: names, required: true },
          { key: "emp_no", label: "الرقم الوظيفي" },
          { key: "national_id", label: "رقم الهويه", formOnly: true },
          { key: "branch", label: "الفرع", type: "select", options: branches.length ? branches : ["شركة الحلول الخبيرة"] },
          { key: "department", label: "الاقسام", type: "select", options: departments },
          { key: "main_department", label: "القسم الرئيسي", formOnly: true },
          { key: "sector", label: "القطاع", formOnly: true },
          { key: "path", label: "المسار", formOnly: true },
          { key: "inquiry_date", label: "تاريخ المسائلة", type: "date" },
          { key: "status", label: "حالة المسائلة", type: "select", options: STATUSES },
          { key: "approved_by", label: "تم الموافقة" },
          { key: "source", label: "ادارى/الى", type: "select", options: SOURCES },
          { key: "inquiry_type", label: "نوع المسائلة", type: "select", options: TYPES },
          { key: "user_name", label: "المستخدم" },
          { key: "inquiry_name", label: "مسمى المسائلة", type: "select", options: INQUIRY_NAMES },
          { key: "entry_date", label: "تاريخ الادخال", type: "date" },
          { key: "email_sent", label: "إيميل مرسل", type: "checkbox" },
          { key: "employee_reply", label: "رد الموظف", type: "textarea" },
          { key: "active", label: "تفعيل", type: "checkbox" },
          { key: "notes", label: "ملاحظات", type: "textarea", formOnly: true },
        ]}
      />
    </div>
  );
}

/* ---------------- حذف المسائلات ---------------- */

function RemoveTab() {
  const del = useDeleteRow("inquiries");
  const rows = useRows("inquiries", { orderBy: "inquiry_date" }).data ?? [];
  const [type, setType] = useState("");
  const [date, setDate] = useState("");

  const remove = async () => {
    const targets = rows.filter(
      (r) =>
        (!type || String(r["inquiry_type"]) === type) &&
        (!date || String(r["inquiry_date"]) === date),
    );
    if (targets.length === 0) {
      toast.error("لا توجد مسائلات مطابقة للحذف");
      return;
    }
    if (!confirm(`هل تريد حذف ${targets.length} مسائلة نهائياً؟`)) return;
    for (const r of targets) await del.mutateAsync(String(r["id"]));
  };

  return (
    <div className="mt-4">
      <Card title="حذف المسائلات" icon="delete_sweep">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="الفروع">
            <Select />
          </Field>
          <Field label="القسم">
            <Select />
          </Field>
          <Field label="الحاله">
            <Select options={["اختر ....", ...STATUSES]} />
          </Field>
          <Field label="القسم الرئيسي">
            <Select />
          </Field>
          <Field label="القطاع">
            <Select />
          </Field>
          <Field label="المسار">
            <Select />
          </Field>
          <Field label="موظف">
            <Input placeholder="البحث بإسم او رقم الموظف" />
          </Field>
          <Field label="التاريخ">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="نوع المسائلة">
            <div className="relative">
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="h-10 w-full appearance-none rounded-xl border border-input bg-background px-3 pe-9 text-[13px] font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-ring/25"
              >
                <option value="">اختر ....</option>
                {TYPES.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
              <MaterialIcon
                name="expand_more"
                size={18}
                className="pointer-events-none absolute inset-y-0 left-2.5 my-auto h-fit text-muted-foreground"
              />
            </div>
          </Field>
          <label className="flex h-10 items-center gap-2 self-end rounded-xl border border-input bg-background px-3">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" />
            <span className="text-[12px] font-bold">اضافة استثناءات</span>
          </label>
          <div className="self-end">
            <Btn icon="delete" onClick={remove}>
              {del.isPending ? "جارٍ الحذف..." : "حذف"}
            </Btn>
          </div>
        </div>
      </Card>
    </div>
  );
}
