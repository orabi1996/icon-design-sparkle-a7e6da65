import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/hr/AppShell";
import { MaterialIcon } from "@/components/MaterialIcon";
import { Breadcrumbs, Btn, Card, Field, PageBanner } from "@/components/hr/ui";
import { CrudTable } from "@/components/hr/CrudTable";
import { money, useRows, useSaveRow, type Row } from "@/lib/hr-db";
import { notifyWorkflow } from "@/lib/email/dispatcher";
import { supabase } from "@/integrations/supabase/client";
import { calculateLoanLedgerBalance, roundCurrency } from "@/lib/loans-eos-core.mjs";

export const Route = createFileRoute("/loans")({
  head: () => ({
    meta: [
      { title: "السلف | ماليات الموظفين" },
      {
        name: "description",
        content:
          "إضافة سلف الموظفين وبحث وتعديل الأقساط وسداد الأقساط وترحيل القيد المجمع وتحميل السلف من ملف Excel.",
      },
      { property: "og:title", content: "السلف | ماليات الموظفين" },
      {
        property: "og:description",
        content: "إدارة كاملة لسلف الموظفين: الإضافة، الأقساط، السداد، الترحيل والتحميل.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoansPage,
});

const LOAN_TYPES = ["سلفة شخصية", "سلفة طارئة", "سلفة سكن", "سلفة زواج", "سلفة سيارة"];
const DEDUCTION_METHODS = ["تخصم شهريا", "تخصم مرة واحدة", "تخصم من المستحقات"];
const REQUEST_STATUS = ["معتمدة", "بانتظار الموافقة", "مرفوضة", "ملغاة"];
const STATUSES = ["قيد السداد", "مسددة", "موقوفة"];
const STAGES = ["مدير مباشر", "مدير الموارد البشرية", "المدير المالي", "منتهية"];

const TABS = [
  { id: "add", label: "اضافة سلفة", icon: "add_card" },
  { id: "search", label: "بحث وتعديل الاقساط", icon: "manage_search" },
  { id: "repay", label: "سداد اقساط السلف", icon: "payments" },
  { id: "post", label: "ترحيل القيد المجمع للسلف", icon: "post_add" },
  { id: "import", label: "تحميل السلف من ملف Excel", icon: "upload_file" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const control =
  "h-10 w-full rounded-xl border border-input bg-background px-3 text-[13px] font-semibold outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/25";

function Sel({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <select className={control} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">اختر ....</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function LoansPage() {
  const [tab, setTab] = useState<TabId>("add");
  return (
    <AppShell>
      <div className="mt-4">
        <Breadcrumbs trail={["شئون الموظفين", "ماليات الموظفين", "السلف"]} />
        <PageBanner
          icon="request_quote"
          title="السلف"
          subtitle="إضافة السلف ومتابعة الأقساط والسداد والترحيل المحاسبي"
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

        {tab === "add" && <AddTab />}
        {tab === "search" && <SearchTab />}
        {tab === "repay" && <RepayTab />}
        {tab === "post" && <PostTab />}
        {tab === "import" && <ImportTab />}
      </div>
    </AppShell>
  );
}

/* ---------------- اضافة سلفة ---------------- */

const today = () => new Date().toISOString().slice(0, 10);

function AddTab() {
  const employees = useRows("employees", { orderBy: "emp_no", ascending: true }).data ?? [];
  const save = useSaveRow("loans");
  const [empId, setEmpId] = useState("");
  const [form, setForm] = useState<Row>({
    loan_type: LOAN_TYPES[0],
    loan_name: "",
    amount: 0,
    approved_amount: 0,
    installments: 12,
    deduction_method: DEDUCTION_METHODS[0],
    request_date: today(),
    first_installment_date: today(),
    request_status: "معتمدة",
    status: "قيد السداد",
    expense_account: "",
    account_name: "",
    stage: STAGES[0],
    notes: "",
  });

  const emp = employees.find((e) => String(e["id"]) === empId);
  const monthly = useMemo(() => {
    const n = Number(form["installments"] ?? 0);
    const a = Number(form["approved_amount"] || form["amount"] || 0);
    return n > 0 ? Math.round(a / n) : 0;
  }, [form]);

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!emp) { toast.error("اختر الموظف أولاً"); return; }
    if (!Number(form["amount"])) { toast.error("أدخل مبلغ السلفة"); return; }
    const d = new Date(String(form["request_date"] || today()));
    const saved = await save.mutateAsync({
      ...form,
      employee_id: emp["id"],
      employee_name: emp["full_name"],
      emp_no: emp["emp_no"],
      national_id: emp["national_id"],
      department: emp["department"],
      job_title: emp["job_title"],
      nationality: emp["nationality"],
      basic_salary: emp["basic_salary"] ?? 0,
      allowances: emp["allowances"] ?? 0,
      total_salary: Number(emp["basic_salary"] ?? 0) + Number(emp["allowances"] ?? 0),
      approved_amount: Number(form["approved_amount"] || form["amount"]),
      monthly_amount: monthly,
      start_date: form["first_installment_date"] || today(),
      entry_date: today(),
      year: d.getFullYear(),
      month: d.getMonth() + 1,
    });

    notifyWorkflow({
      eventType: "request_created",
      requestId: String(saved?.["id"] || ""),
      requestNumber: saved?.["id"] || Date.now(),
      requestType: String(form["loan_type"] || "طلب سلفة مالية"),
      employeeId: String(emp["id"]),
      employeeName: String(emp["full_name"]),
      employeeCode: String(emp["emp_no"]),
      amount: form["amount"],
      currentStage: form["stage"] || "مدير مباشر",
      currentStatus: form["request_status"] || "بانتظار الموافقة",
      actionDate: today(),
    });

    notifyWorkflow({
      eventType: "stage_assigned",
      requestId: String(saved?.["id"] || ""),
      requestNumber: saved?.["id"] || Date.now(),
      requestType: String(form["loan_type"] || "طلب سلفة مالية"),
      employeeId: String(emp["id"]),
      employeeName: String(emp["full_name"]),
      employeeCode: String(emp["emp_no"]),
      amount: form["amount"],
      currentStage: form["stage"] || "مدير مباشر",
      actionUrl: typeof window !== "undefined" ? `${window.location.origin}/loans` : "/loans",
      actionDate: today(),
    });

    setEmpId("");
  };

  return (
    <div className="mt-4 space-y-4">
      <Card title="بيانات الموظف" icon="badge">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="الموظف">
            <select className={control} value={empId} onChange={(e) => setEmpId(e.target.value)}>
              <option value="">اختر ....</option>
              {employees.map((e) => (
                <option key={String(e["id"])} value={String(e["id"])}>
                  {e["emp_no"]} - {e["full_name"]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="رقم الهوية">
            <input className={control} readOnly value={String(emp?.["national_id"] ?? "")} />
          </Field>
          <Field label="القسم">
            <input className={control} readOnly value={String(emp?.["department"] ?? "")} />
          </Field>
          <Field label="اجمالي الراتب">
            <input
              className={control}
              readOnly
              value={
                emp
                  ? money(Number(emp["basic_salary"] ?? 0) + Number(emp["allowances"] ?? 0))
                  : ""
              }
            />
          </Field>
        </div>
      </Card>

      <Card title="بيانات السلفة" icon="request_quote">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="نوع السلفة">
            <Sel
              value={String(form["loan_type"] ?? "")}
              onChange={(v) => set("loan_type", v)}
              options={LOAN_TYPES}
            />
          </Field>
          <Field label="مسمى السلفة">
            <input
              className={control}
              value={String(form["loan_name"] ?? "")}
              onChange={(e) => set("loan_name", e.target.value)}
            />
          </Field>
          <Field label="مبلغ السلفة">
            <input
              type="number"
              className={control}
              value={Number(form["amount"] ?? 0)}
              onChange={(e) => set("amount", Number(e.target.value))}
            />
          </Field>
          <Field label="القيمة المعتمدة">
            <input
              type="number"
              className={control}
              value={Number(form["approved_amount"] ?? 0)}
              onChange={(e) => set("approved_amount", Number(e.target.value))}
            />
          </Field>
          <Field label="عدد الأقساط">
            <input
              type="number"
              className={control}
              value={Number(form["installments"] ?? 0)}
              onChange={(e) => set("installments", Number(e.target.value))}
            />
          </Field>
          <Field label="القسط الشهري (تلقائي)">
            <input className={control} readOnly value={money(monthly)} />
          </Field>
          <Field label="طريقة الخصم">
            <Sel
              value={String(form["deduction_method"] ?? "")}
              onChange={(v) => set("deduction_method", v)}
              options={DEDUCTION_METHODS}
            />
          </Field>
          <Field label="تاريخ الطلب">
            <input
              type="date"
              className={control}
              value={String(form["request_date"] ?? "")}
              onChange={(e) => set("request_date", e.target.value)}
            />
          </Field>
          <Field label="تاريخ أول قسط">
            <input
              type="date"
              className={control}
              value={String(form["first_installment_date"] ?? "")}
              onChange={(e) => set("first_installment_date", e.target.value)}
            />
          </Field>
          <Field label="حالة الطلب">
            <Sel
              value={String(form["request_status"] ?? "")}
              onChange={(v) => set("request_status", v)}
              options={REQUEST_STATUS}
            />
          </Field>
          <Field label="مرحلة الموافقة">
            <Sel
              value={String(form["stage"] ?? "")}
              onChange={(v) => set("stage", v)}
              options={STAGES}
            />
          </Field>
          <Field label="حالة السلفة">
            <Sel
              value={String(form["status"] ?? "")}
              onChange={(v) => set("status", v)}
              options={STATUSES}
            />
          </Field>
          <Field label="حساب الصرف">
            <input
              className={control}
              value={String(form["expense_account"] ?? "")}
              onChange={(e) => set("expense_account", e.target.value)}
            />
          </Field>
          <Field label="اسم الحساب">
            <input
              className={control}
              value={String(form["account_name"] ?? "")}
              onChange={(e) => set("account_name", e.target.value)}
            />
          </Field>
          <Field label="ملاحظات">
            <input
              className={control}
              value={String(form["notes"] ?? "")}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Btn icon="save" onClick={submit}>
            {save.isPending ? "جارٍ الحفظ..." : "حفظ السلفة"}
          </Btn>
        </div>
      </Card>
    </div>
  );
}

/* ---------------- بحث وتعديل الاقساط ---------------- */

function SearchTab() {
  const employees = useRows("employees", { orderBy: "emp_no", ascending: true }).data ?? [];
  const names = employees.map((e) => String(e["full_name"]));

  return (
    <CrudTable
      table="loans"
      title="سلف الموظفين"
      addLabel="إضافة سلفة"
      searchKeys={["employee_name", "emp_no", "national_id", "loan_type", "status"]}
      fields={[
        { key: "emp_no", label: "الرقم الوظيفي" },
        { key: "employee_name", label: "الموظف", type: "select", options: names, required: true },
        { key: "loan_type", label: "نوع السلفة", type: "select", options: LOAN_TYPES },
        { key: "amount", label: "مبلغ السلفة", type: "number" },
        { key: "approved_amount", label: "المعتمد", type: "number" },
        { key: "installments", label: "الأقساط", type: "number" },
        { key: "monthly_amount", label: "القسط الشهري", type: "number" },
        { key: "paid_amount", label: "المسدد", type: "number" },
        { key: "start_date", label: "تاريخ أول قسط", type: "date" },
        {
          key: "deduction_method",
          label: "طريقة الخصم",
          type: "select",
          options: DEDUCTION_METHODS,
          formOnly: true,
        },
        {
          key: "request_status",
          label: "حالة الطلب",
          type: "select",
          options: REQUEST_STATUS,
          formOnly: true,
        },
        { key: "status", label: "الحالة", type: "select", options: STATUSES },
        { key: "stage", label: "المرحلة", type: "select", options: STAGES, formOnly: true },
        { key: "expense_account", label: "حساب الصرف", formOnly: true },
        { key: "posted", label: "مُرحّلة", type: "checkbox" },
        { key: "notes", label: "ملاحظات", type: "textarea" },
      ]}
    />
  );
}

/* ---------------- سداد اقساط السلف ---------------- */

function RepayTab() {
  const { data: loans = [] } = useRows("loans", { filters: { status: "قيد السداد" } });
  const save = useSaveRow("loans");
  const [busy, setBusy] = useState(false);

  const payOne = async (r: Row) => {
    const loanId = String(r["id"]);
    const approved = Number(r["approved_amount"] || r["amount"] || 0);
    const inst = Number(r["monthly_amount"] ?? 0);
    if (inst <= 0) { toast.error("قيمة القسط الشهري غير محددة"); return; }

    // Fetch existing transactions from ledger to get authoritative balance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyDb = supabase as any;
    const { data: txs = [] } = await anyDb
      .from("loan_transactions")
      .select("*")
      .eq("loan_id", loanId);

    const balance = calculateLoanLedgerBalance((txs as Record<string, unknown>[]) || [], approved);
    const payAmt = Math.min(inst, balance.outstandingBalance);
    if (payAmt <= 0) { toast.error("السلفة مسددة بالكامل بالفعل"); return; }

    const newBal = roundCurrency(balance.outstandingBalance - payAmt);
    const idempotencyKey = `manual:installment:${loanId}:${Date.now()}`;

    // Append to immutable ledger
    await anyDb.from("loan_transactions").insert({
      loan_id: loanId,
      employee_id: r["employee_id"],
      transaction_type: "installment",
      direction: "credit",
      amount: payAmt,
      balance_after: newBal,
      idempotency_key: idempotencyKey,
      notes: "سداد قسط يدوي من شاشة السلف",
    });

    await save.mutateAsync({
      id: loanId,
      paid_amount: roundCurrency(approved - newBal),
      status: newBal <= 0 ? "مسددة" : "قيد السداد",
    });
  };

  const payAll = async () => {
    if (loans.length === 0) { toast.error("لا توجد سلف قيد السداد"); return; }
    setBusy(true);
    try {
      for (const r of loans) await payOne(r);
      toast.success(`تم تسجيل سداد ${loans.length} قسط بالدفتر المالي`);
    } catch (e) {
      toast.error(`حدث خطأ أثناء السداد: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4">
      <Card title="سداد اقساط السلف" icon="payments">
        <div className="flex flex-wrap items-center gap-2">
          <Btn icon="done_all" onClick={payAll}>
            {busy ? "جارٍ السداد..." : "سداد قسط الشهر لكل السلف"}
          </Btn>
          <span className="text-[12px] font-semibold text-muted-foreground">
            عدد السلف قيد السداد: {loans.length}
          </span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-right">
            <thead>
              <tr className="bg-secondary text-[12px] font-extrabold text-secondary-foreground">
                {["الموظف", "المعتمد", "القسط", "المسدد", "المتبقي", "سداد"].map((h) => (
                  <th key={h} className="border-b border-border px-4 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loans.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-sm font-semibold text-muted-foreground"
                  >
                    لا توجد سلف قيد السداد
                  </td>
                </tr>
              )}
              {loans.map((r) => {
                const approved = Number(r["approved_amount"] || r["amount"] || 0);
                const paid = Number(r["paid_amount"] ?? 0);
                return (
                  <tr
                    key={String(r["id"])}
                    className="border-b border-border text-[13px] font-semibold odd:bg-secondary/35"
                  >
                    <td className="px-4 py-3">{String(r["employee_name"] ?? "—")}</td>
                    <td className="px-4 py-3">{money(approved)}</td>
                    <td className="px-4 py-3">{money(Number(r["monthly_amount"] ?? 0))}</td>
                    <td className="px-4 py-3">{money(paid)}</td>
                    <td className="px-4 py-3">{money(Math.max(0, approved - paid))}</td>
                    <td className="px-4 py-3">
                      <Btn icon="payments" variant="ghost" onClick={() => payOne(r)}>
                        سداد قسط
                      </Btn>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ---------------- ترحيل القيد المجمع ---------------- */

function PostTab() {
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const { data: loans = [] } = useRows("loans", { limit: 500 });
  const save = useSaveRow("loans");

  const scope = loans.filter(
    (r) =>
      !r["posted"] &&
      String(r["year"] ?? now.getFullYear()) === year &&
      String(r["month"] ?? now.getMonth() + 1) === month,
  );
  const total = scope.reduce((s, r) => s + Number(r["approved_amount"] || r["amount"] || 0), 0);

  const post = async () => {
    if (scope.length === 0) { toast.error("لا توجد سلف غير مُرحّلة في هذه الفترة"); return; }
    for (const r of scope) await save.mutateAsync({ id: r["id"], posted: true });
    toast.success(`تم ترحيل ${scope.length} سلفة بإجمالي ${money(total)}`);
  };

  return (
    <div className="mt-4">
      <Card title="ترحيل القيد المجمع للسلف" icon="post_add">
        <div className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="السنة">
            <input className={control} value={year} onChange={(e) => setYear(e.target.value)} />
          </Field>
          <Field label="الشهر">
            <Sel
              value={month}
              onChange={setMonth}
              options={Array.from({ length: 12 }, (_, i) => String(i + 1))}
            />
          </Field>
          <Field label="عدد السلف غير المُرحّلة">
            <input className={control} readOnly value={String(scope.length)} />
          </Field>
          <Field label="اجمالي القيد">
            <input className={control} readOnly value={money(total)} />
          </Field>
        </div>
        <div className="mt-4">
          <Btn icon="post_add" onClick={post}>
            ترحيل القيد
          </Btn>
        </div>
      </Card>
    </div>
  );
}

/* ---------------- تحميل السلف من Excel ---------------- */

function ImportTab() {
  const employees = useRows("employees", { orderBy: "emp_no", ascending: true }).data ?? [];
  const save = useSaveRow("loans");
  const [text, setText] = useState("");

  const run = async () => {
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) { toast.error("الصق بيانات السلف أولاً"); return; }
    let ok = 0;
    for (const line of lines) {
      const [empNo, amount, installments, type] = line.split(/[,\t;]/).map((s) => s?.trim() ?? "");
      const emp = employees.find((e) => String(e["emp_no"]) === empNo);
      if (!emp || !Number(amount)) continue;
      const n = Number(installments) || 1;
      await save.mutateAsync({
        employee_id: emp["id"],
        employee_name: emp["full_name"],
        emp_no: emp["emp_no"],
        national_id: emp["national_id"],
        department: emp["department"],
        loan_type: type || LOAN_TYPES[0],
        amount: Number(amount),
        approved_amount: Number(amount),
        installments: n,
        monthly_amount: Math.round(Number(amount) / n),
        request_status: "معتمدة",
        status: "قيد السداد",
        start_date: today(),
        request_date: today(),
        entry_date: today(),
        year: new Date().getFullYear(),
        month: new Date().getMonth() + 1,
      });
      ok += 1;
    }
    if (ok === 0) toast.error("لم يتم مطابقة أي رقم وظيفي صحيح");
    else {
      toast.success(`تم تحميل ${ok} سلفة`);
      setText("");
    }
  };

  return (
    <div className="mt-4">
      <Card title="تحميل السلف من ملف Excel" icon="upload_file">
        <p className="mb-3 text-[12.5px] font-semibold text-muted-foreground">
          انسخ الأعمدة من ملف Excel والصقها هنا بالترتيب: الرقم الوظيفي، المبلغ، عدد الأقساط، نوع
          السلفة — كل سلفة في سطر.
        </p>
        <textarea
          rows={8}
          dir="ltr"
          placeholder={"1001, 12000, 12, سلفة شخصية\n1002, 6000, 6, سلفة طارئة"}
          className={`${control} h-auto py-2 text-left`}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-4">
          <Btn icon="upload" onClick={run}>
            {save.isPending ? "جارٍ التحميل..." : "تحميل السلف"}
          </Btn>
        </div>
      </Card>
    </div>
  );
}
