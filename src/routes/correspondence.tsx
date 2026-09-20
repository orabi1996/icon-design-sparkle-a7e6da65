import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { MaterialIcon } from "@/components/MaterialIcon";
import { AppShell } from "@/components/hr/AppShell";
import { Breadcrumbs, Btn, Card, Chip, PageBanner } from "@/components/hr/ui";
import { useRows, type Row } from "@/lib/hr-db";
import { supabase } from "@/integrations/supabase/client";
import { sendCorrespondenceFn } from "@/lib/operational-domains.functions";

export const Route = createFileRoute("/correspondence")({
  head: () => ({
    meta: [
      { title: "المراسلات | شؤون الموظفين" },
      {
        name: "description",
        content: "إرسال الرسائل الداخلية والبريد الإلكتروني ومتابعة أرشيف المراسلات.",
      },
      { property: "og:title", content: "المراسلات | شؤون الموظفين" },
      {
        property: "og:description",
        content: "منظومة موحدة لمراسلات الموظفين وأرشفة حالات الإرسال.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CorrespondencePage,
});

type TabKey = "message" | "email" | "archive";

type InternalForm = {
  branch: string;
  department: string;
  employeeId: string;
  message: string;
};

type EmailForm = {
  branch: string;
  department: string;
  employeeId: string;
  priority: string;
  alternateEmail: string;
  subject: string;
  messageHtml: string;
  redirectUrl: string;
};

type ArchiveFilters = {
  employeeId: string;
  channel: string;
  fromDate: string;
  toDate: string;
};

type SelectOption = { value: string; label: string };

const initialInternal: InternalForm = {
  branch: "",
  department: "",
  employeeId: "",
  message: "",
};

const initialEmail: EmailForm = {
  branch: "",
  department: "",
  employeeId: "",
  priority: "عادي",
  alternateEmail: "",
  subject: "",
  messageHtml: "",
  redirectUrl: "",
};

const initialFilters: ArchiveFilters = {
  employeeId: "",
  channel: "",
  fromDate: "",
  toDate: "",
};

const priorities = ["عادي", "مهم", "عاجل"];
const archiveColumns = [
  "عدد الحروف",
  "اسم الموظف",
  "رقم الهوية",
  "الرقم الوظيفي",
  "اسم المستخدم",
  "القناة",
  "الرسالة",
  "التليفون",
  "اسم المرسل",
  "الأولوية",
  "حالة الرسالة",
  "التاريخ",
  "الإجراء",
] as const;

const controlClass =
  "h-11 w-full rounded-xl border border-input bg-background px-3 text-[13px] font-semibold text-foreground outline-none transition-all placeholder:font-normal placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/20";

// Generated Supabase types deliberately lag feature migrations in this project.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const correspondenceDb = supabase as unknown as { from: (table: string) => any };

function unique(values: unknown[]) {
  return Array.from(new Set(values.map(String).filter(Boolean)));
}

function stripHtml(value: unknown) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function dateTimeAr(value: unknown) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(String(value)));
}

function escapeCsv(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function FieldLabel({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 flex items-center gap-1 text-[12px] font-bold text-foreground/80">
        {label}
        {required && <span className="text-destructive">*</span>}
        {hint && (
          <span className="ms-auto text-[10px] font-semibold text-muted-foreground">{hint}</span>
        )}
      </span>
      {children}
    </label>
  );
}

function SelectControl({
  value,
  onChange,
  options,
  placeholder = "اختر...",
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={`${controlClass} appearance-none pe-9 disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <MaterialIcon
        name="expand_more"
        size={18}
        className="pointer-events-none absolute inset-y-0 left-3 my-auto h-fit text-muted-foreground"
      />
    </div>
  );
}

function CorrespondenceTabs({ tab, onChange }: { tab: TabKey; onChange: (tab: TabKey) => void }) {
  const tabs: { key: TabKey; label: string; icon: string }[] = [
    { key: "message", label: "إرسال رسالة", icon: "chat" },
    { key: "email", label: "إرسال الإيميلات", icon: "forward_to_inbox" },
    { key: "archive", label: "الأرشيف", icon: "inventory_2" },
  ];
  return (
    <div
      className="mt-4 grid gap-1.5 rounded-2xl border border-border bg-card p-2 sm:grid-cols-3"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      {tabs.map((item) => {
        const active = tab === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13px] font-extrabold transition-all ${
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            <MaterialIcon name={item.icon} size={19} filled={active} />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function RecipientFields({
  form,
  employees,
  onBranch,
  onDepartment,
  onEmployee,
}: {
  form: { branch: string; department: string; employeeId: string };
  employees: Row[];
  onBranch: (value: string) => void;
  onDepartment: (value: string) => void;
  onEmployee: (value: string) => void;
}) {
  const branches = unique(employees.map((employee) => employee["branch"]));
  const departments = unique(
    employees
      .filter((employee) => !form.branch || String(employee["branch"] ?? "") === form.branch)
      .map((employee) => employee["department"]),
  );
  const recipientEmployees = employees.filter(
    (employee) =>
      (!form.branch || String(employee["branch"] ?? "") === form.branch) &&
      (!form.department || String(employee["department"] ?? "") === form.department),
  );

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <FieldLabel label="الفرع">
        <SelectControl
          value={form.branch}
          onChange={onBranch}
          options={branches.map((value) => ({ value, label: value }))}
          placeholder="كل الفروع"
        />
      </FieldLabel>
      <FieldLabel label="القسم">
        <SelectControl
          value={form.department}
          onChange={onDepartment}
          options={departments.map((value) => ({ value, label: value }))}
          placeholder="كل الأقسام"
        />
      </FieldLabel>
      <FieldLabel label="الموظف" required>
        <SelectControl
          value={form.employeeId}
          onChange={onEmployee}
          options={recipientEmployees.map((employee) => ({
            value: String(employee["id"]),
            label: `${String(employee["full_name"])} · ${String(employee["emp_no"])}`,
          }))}
          placeholder={recipientEmployees.length ? "اختر الموظف" : "لا يوجد موظفون مطابقون"}
          disabled={recipientEmployees.length === 0}
        />
      </FieldLabel>
    </div>
  );
}

function RichEditor({
  editorRef,
  onChange,
}: {
  editorRef: React.RefObject<HTMLDivElement | null>;
  onChange: (html: string) => void;
}) {
  function run(command: string, value?: string) {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    onChange(editorRef.current?.innerHTML ?? "");
  }

  const tools = [
    { command: "bold", icon: "format_bold", title: "غامق" },
    { command: "italic", icon: "format_italic", title: "مائل" },
    { command: "underline", icon: "format_underlined", title: "تحته خط" },
    { command: "insertUnorderedList", icon: "format_list_bulleted", title: "قائمة نقطية" },
    { command: "insertOrderedList", icon: "format_list_numbered", title: "قائمة رقمية" },
    { command: "justifyRight", icon: "format_align_right", title: "محاذاة لليمين" },
    { command: "justifyCenter", icon: "format_align_center", title: "توسيط" },
    { command: "undo", icon: "undo", title: "تراجع" },
    { command: "redo", icon: "redo", title: "إعادة" },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-input bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/20">
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-secondary/70 p-2">
        {tools.map((tool) => (
          <button
            key={tool.command}
            type="button"
            title={tool.title}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => run(tool.command)}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-card hover:text-primary"
          >
            <MaterialIcon name={tool.icon} size={17} />
          </button>
        ))}
        <span className="mx-1 h-6 w-px bg-border" />
        <select
          aria-label="حجم الخط"
          defaultValue="3"
          onChange={(event) => run("fontSize", event.target.value)}
          className="h-8 rounded-lg border border-border bg-card px-2 text-[11px] font-bold outline-none"
        >
          <option value="2">صغير</option>
          <option value="3">عادي</option>
          <option value="4">كبير</option>
          <option value="5">عنوان</option>
        </select>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="نص رسالة البريد الإلكتروني"
        data-placeholder="اكتب نص الرسالة هنا..."
        onInput={(event) => onChange(event.currentTarget.innerHTML)}
        className="min-h-48 p-4 text-[13px] font-semibold leading-7 outline-none empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]"
      />
    </div>
  );
}

function AttachmentDrop({
  file,
  onFile,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
}) {
  function choose(next: File | undefined) {
    if (!next) return;
    if (next.size > 10 * 1024 * 1024) {
      toast.error("حجم المرفق يجب ألا يتجاوز 10 ميجابايت");
      return;
    }
    onFile(next);
  }

  return (
    <label
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        choose(event.dataTransfer.files[0]);
      }}
      className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4 text-center transition-colors hover:bg-primary/10"
    >
      <input
        type="file"
        className="sr-only"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
        onChange={(event) => choose(event.target.files?.[0])}
      />
      <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
        <MaterialIcon name={file ? "draft" : "cloud_upload"} size={22} filled />
      </span>
      <p className="mt-2 max-w-full truncate text-[12px] font-extrabold text-foreground">
        {file ? file.name : "اسحب المرفق هنا أو اضغط للاختيار"}
      </p>
      <p className="mt-1 text-[10px] font-semibold text-muted-foreground">
        PDF أو Word أو Excel أو صورة · حتى 10 ميجابايت
      </p>
      {file && (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            onFile(null);
          }}
          className="mt-2 text-[11px] font-bold text-destructive hover:underline"
        >
          إزالة المرفق
        </button>
      )}
    </label>
  );
}

function deliveryChip(value: string) {
  if (["تم الإرسال", "تمت القراءة"].includes(value)) return <Chip label={value} tone="green" />;
  if (value === "غير مقروء") return <Chip label={value} tone="blue" />;
  if (value.includes("بانتظار")) return <Chip label={value} tone="amber" />;
  return <Chip label={value || "تم التسجيل"} tone="muted" />;
}

function CorrespondencePage() {
  const queryClient = useQueryClient();
  const editorRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<TabKey>("message");
  const [internalForm, setInternalForm] = useState<InternalForm>(initialInternal);
  const [emailForm, setEmailForm] = useState<EmailForm>(initialEmail);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [sendingInternal, setSendingInternal] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [filters, setFilters] = useState<ArchiveFilters>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<ArchiveFilters>(initialFilters);
  const [tableSearch, setTableSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedRow, setSelectedRow] = useState<Row | null>(null);

  const employeesQuery = useRows("employees", { orderBy: "emp_no", ascending: true });
  const archiveQuery = useRows("employee_correspondence", {
    orderBy: "sent_at",
    ascending: false,
  });
  const employees = useMemo(() => employeesQuery.data ?? [], [employeesQuery.data]);
  const archive = useMemo(() => archiveQuery.data ?? [], [archiveQuery.data]);

  const selectedInternalEmployee = employees.find(
    (employee) => String(employee["id"]) === internalForm.employeeId,
  );
  const selectedEmailEmployee = employees.find(
    (employee) => String(employee["id"]) === emailForm.employeeId,
  );

  const filteredRows = useMemo(() => {
    const needle = tableSearch.trim().toLocaleLowerCase("ar");
    return archive.filter((row) => {
      const sentAt = String(row["sent_at"] ?? row["created_at"] ?? "").slice(0, 10);
      const matchesFilters =
        (!appliedFilters.employeeId || String(row["employee_id"]) === appliedFilters.employeeId) &&
        (!appliedFilters.channel || String(row["channel"]) === appliedFilters.channel) &&
        (!appliedFilters.fromDate || sentAt >= appliedFilters.fromDate) &&
        (!appliedFilters.toDate || sentAt <= appliedFilters.toDate);
      const matchesSearch =
        !needle ||
        [
          row["employee_name"],
          row["emp_no"],
          row["national_id"],
          row["phone"],
          row["sender_name"],
          row["sender_email"],
          row["subject"],
          stripHtml(row["message_html"] ?? row["message"]),
          row["delivery_status"],
        ].some((value) =>
          String(value ?? "")
            .toLocaleLowerCase("ar")
            .includes(needle),
        );
      return matchesFilters && matchesSearch;
    });
  }, [appliedFilters, archive, tableSearch]);

  const pages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, pages);
  const pageRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  function changeInternalBranch(value: string) {
    setInternalForm((current) => ({ ...current, branch: value, department: "", employeeId: "" }));
  }

  function changeInternalDepartment(value: string) {
    setInternalForm((current) => ({ ...current, department: value, employeeId: "" }));
  }

  function changeEmailBranch(value: string) {
    setEmailForm((current) => ({ ...current, branch: value, department: "", employeeId: "" }));
  }

  function changeEmailDepartment(value: string) {
    setEmailForm((current) => ({ ...current, department: value, employeeId: "" }));
  }

  async function currentSender() {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) throw error ?? new Error("انتهت جلسة تسجيل الدخول");
    return {
      id: user.id,
      email: user.email ?? "",
      name: String(user.user_metadata?.["full_name"] ?? user.email ?? "مدير النظام"),
    };
  }

  async function insertCorrespondence(values: Record<string, unknown>) {
    try {
      await sendCorrespondenceFn({
        data: {
          directionType: values["channel"] === "internal" ? "internal" : "outgoing",
          confidentiality: "normal",
          classification: String(values["channel"] || "general"),
          subject: String(values["subject"] || "مراسلة إدارية"),
          message: String(values["message"] || ""),
          recipientEmail: values["recipient_email"] ? String(values["recipient_email"]) : undefined,
          employeeId: values["employee_id"] ? String(values["employee_id"]) : undefined,
          employeeName: values["employee_name"] ? String(values["employee_name"]) : undefined,
          branch: values["branch"] ? String(values["branch"]) : undefined,
          department: values["department"] ? String(values["department"]) : undefined,
          attachmentName: values["attachment_name"] ? String(values["attachment_name"]) : undefined,
          attachmentPath: values["attachment_path"] ? String(values["attachment_path"]) : undefined,
        },
      });
    } catch {
      const { error } = await correspondenceDb.from("employee_correspondence").insert(values);
      if (error) throw error;
    }
    await queryClient.invalidateQueries({ queryKey: ["employee_correspondence"] });
  }

  async function sendInternal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedInternalEmployee || !internalForm.message.trim()) {
      toast.error("اختر الموظف واكتب نص الرسالة");
      return;
    }
    setSendingInternal(true);
    try {
      const sender = await currentSender();
      const message = internalForm.message.trim();
      await insertCorrespondence({
        channel: "internal",
        employee_id: selectedInternalEmployee["id"],
        employee_name: selectedInternalEmployee["full_name"],
        emp_no: selectedInternalEmployee["emp_no"],
        national_id: selectedInternalEmployee["national_id"],
        phone: selectedInternalEmployee["phone"],
        employee_email: selectedInternalEmployee["email"],
        branch: selectedInternalEmployee["branch"],
        department: selectedInternalEmployee["department"],
        priority: "عادي",
        subject: "رسالة داخلية",
        message,
        status: "تم التسجيل",
        delivery_status: "غير مقروء",
        character_count: message.length,
        sender_name: sender.name,
        sender_email: sender.email,
        created_by: sender.id,
      });
      toast.success("تم إرسال الرسالة وإضافتها إلى الأرشيف");
      setInternalForm(initialInternal);
      setTab("archive");
    } catch (error) {
      toast.error(`تعذر إرسال الرسالة: ${(error as Error).message}`);
    } finally {
      setSendingInternal(false);
    }
  }

  async function sendEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = stripHtml(emailForm.messageHtml);
    const recipientEmail =
      emailForm.alternateEmail.trim() || String(selectedEmailEmployee?.["email"] ?? "");
    if (!selectedEmailEmployee || !recipientEmail || !emailForm.subject.trim() || !message) {
      toast.error("أكمل بيانات الموظف وعنوان البريد ونص الرسالة");
      return;
    }
    setSendingEmail(true);
    let attachmentPath: string | null = null;
    try {
      const sender = await currentSender();
      if (attachmentFile) {
        attachmentPath = `${sender.id}/${crypto.randomUUID()}-${safeFileName(attachmentFile.name)}`;
        const { error } = await supabase.storage
          .from("correspondence-attachments")
          .upload(attachmentPath, attachmentFile, { upsert: false });
        if (error) throw error;
      }
      await insertCorrespondence({
        channel: "email",
        employee_id: selectedEmailEmployee["id"],
        employee_name: selectedEmailEmployee["full_name"],
        emp_no: selectedEmailEmployee["emp_no"],
        national_id: selectedEmailEmployee["national_id"],
        phone: selectedEmailEmployee["phone"],
        employee_email: selectedEmailEmployee["email"],
        recipient_email: recipientEmail,
        branch: selectedEmailEmployee["branch"],
        department: selectedEmailEmployee["department"],
        priority: emailForm.priority,
        subject: emailForm.subject.trim(),
        message,
        message_html: emailForm.messageHtml,
        redirect_url: emailForm.redirectUrl.trim() || null,
        status: "في قائمة الإرسال",
        delivery_status: "بانتظار مزود البريد",
        character_count: message.length,
        sender_name: sender.name,
        sender_email: sender.email,
        attachment_name: attachmentFile?.name ?? null,
        attachment_path: attachmentPath,
        created_by: sender.id,
      });
      toast.success("تمت إضافة البريد إلى قائمة الإرسال والأرشيف");
      setEmailForm(initialEmail);
      setAttachmentFile(null);
      if (editorRef.current) editorRef.current.innerHTML = "";
      setTab("archive");
    } catch (error) {
      if (attachmentPath) {
        await supabase.storage.from("correspondence-attachments").remove([attachmentPath]);
      }
      toast.error(`تعذر حفظ البريد: ${(error as Error).message}`);
    } finally {
      setSendingEmail(false);
    }
  }

  function applyArchiveFilters() {
    setAppliedFilters(filters);
    setPage(1);
  }

  function clearArchiveFilters() {
    setFilters(initialFilters);
    setAppliedFilters(initialFilters);
    setTableSearch("");
    setPage(1);
  }

  function exportCsv() {
    const rows = filteredRows.map((row) =>
      [
        row["character_count"],
        row["employee_name"],
        row["national_id"],
        row["emp_no"],
        row["sender_email"],
        row["channel"] === "email" ? "بريد إلكتروني" : "رسالة داخلية",
        stripHtml(row["message_html"] ?? row["message"]),
        row["phone"],
        row["sender_name"],
        row["priority"],
        row["delivery_status"],
        row["sent_at"],
      ]
        .map(escapeCsv)
        .join(","),
    );
    const headings = archiveColumns.filter((column) => column !== "الإجراء");
    const csv = `\uFEFF${headings.map(escapeCsv).join(",")}\n${rows.join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "correspondence-archive.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function openAttachment(row: Row) {
    const path = String(row["attachment_path"] ?? "");
    if (!path) return;
    const { data, error } = await supabase.storage
      .from("correspondence-attachments")
      .createSignedUrl(path, 60);
    if (error) {
      toast.error(`تعذر فتح المرفق: ${error.message}`);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <AppShell>
      <div>
        <Breadcrumbs trail={["شؤون الموظفين", "المراسلات"]} />
        <PageBanner
          icon="mark_email_unread"
          title="المراسلات"
          subtitle="إرسال رسائل الموظفين والبريد الإلكتروني ومتابعة الأرشيف من مكان واحد"
          actions={
            <Btn icon="send" variant="onDark" onClick={() => setTab("message")}>
              مراسلة جديدة
            </Btn>
          }
        />

        <CorrespondenceTabs tab={tab} onChange={setTab} />

        {tab === "message" && (
          <form onSubmit={sendInternal} className="mt-4">
            <Card title="إرسال رسالة داخلية" icon="chat">
              <div className="space-y-5">
                <RecipientFields
                  form={internalForm}
                  employees={employees}
                  onBranch={changeInternalBranch}
                  onDepartment={changeInternalDepartment}
                  onEmployee={(employeeId) =>
                    setInternalForm((current) => ({ ...current, employeeId }))
                  }
                />
                <FieldLabel
                  label="الرسالة"
                  required
                  hint={`${new Intl.NumberFormat("ar-EG").format(internalForm.message.length)} حرف`}
                >
                  <textarea
                    value={internalForm.message}
                    onChange={(event) =>
                      setInternalForm((current) => ({ ...current, message: event.target.value }))
                    }
                    maxLength={2000}
                    placeholder="اكتب الرسالة المراد إرسالها للموظف..."
                    className={`${controlClass} min-h-36 resize-y py-3 leading-7`}
                  />
                </FieldLabel>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={sendingInternal}
                    className="flex items-center gap-2 rounded-xl bg-teal px-6 py-3 text-[13px] font-extrabold text-primary-foreground shadow-sm transition-opacity disabled:opacity-60"
                  >
                    <MaterialIcon
                      name={sendingInternal ? "progress_activity" : "send"}
                      size={19}
                      className={sendingInternal ? "animate-spin" : undefined}
                    />
                    {sendingInternal ? "جارٍ الإرسال..." : "إرسال الرسالة"}
                  </button>
                </div>
              </div>
            </Card>
          </form>
        )}

        {tab === "email" && (
          <form onSubmit={sendEmail} className="mt-4 space-y-4">
            <Card title="بيانات مستلم البريد" icon="contact_mail">
              <div className="space-y-4">
                <RecipientFields
                  form={emailForm}
                  employees={employees}
                  onBranch={changeEmailBranch}
                  onDepartment={changeEmailDepartment}
                  onEmployee={(employeeId) =>
                    setEmailForm((current) => ({ ...current, employeeId }))
                  }
                />
                <div className="grid gap-4 md:grid-cols-2">
                  <FieldLabel label="أولوية الأمر" required>
                    <SelectControl
                      value={emailForm.priority}
                      onChange={(priority) => setEmailForm((current) => ({ ...current, priority }))}
                      options={priorities.map((value) => ({ value, label: value }))}
                    />
                  </FieldLabel>
                  <FieldLabel
                    label="عنوان بريد آخر"
                    hint={String(selectedEmailEmployee?.["email"] ?? "بريد الموظف غير مسجل")}
                  >
                    <input
                      type="email"
                      value={emailForm.alternateEmail}
                      onChange={(event) =>
                        setEmailForm((current) => ({
                          ...current,
                          alternateEmail: event.target.value,
                        }))
                      }
                      placeholder="اتركه فارغًا لاستخدام بريد الموظف"
                      className={controlClass}
                    />
                  </FieldLabel>
                </div>
              </div>
            </Card>

            <Card title="محتوى البريد" icon="edit_note">
              <div className="space-y-4">
                <FieldLabel label="عنوان الإيميل" required>
                  <input
                    value={emailForm.subject}
                    onChange={(event) =>
                      setEmailForm((current) => ({ ...current, subject: event.target.value }))
                    }
                    maxLength={180}
                    placeholder="اكتب عنوان البريد الإلكتروني"
                    className={controlClass}
                  />
                </FieldLabel>
                <FieldLabel
                  label="الرسالة"
                  required
                  hint={`${new Intl.NumberFormat("ar-EG").format(stripHtml(emailForm.messageHtml).length)} حرف`}
                >
                  <RichEditor
                    editorRef={editorRef}
                    onChange={(messageHtml) =>
                      setEmailForm((current) => ({ ...current, messageHtml }))
                    }
                  />
                </FieldLabel>
                <FieldLabel label="عنوان التوجيه عند الضغط على الصورة">
                  <input
                    type="url"
                    value={emailForm.redirectUrl}
                    onChange={(event) =>
                      setEmailForm((current) => ({ ...current, redirectUrl: event.target.value }))
                    }
                    placeholder="https://example.com"
                    className={controlClass}
                  />
                </FieldLabel>
                <div className="grid items-end gap-4 lg:grid-cols-[1fr_auto]">
                  <FieldLabel label="المرفقات">
                    <AttachmentDrop file={attachmentFile} onFile={setAttachmentFile} />
                  </FieldLabel>
                  <button
                    type="submit"
                    disabled={sendingEmail}
                    className="flex h-12 items-center justify-center gap-2 rounded-xl bg-teal px-7 text-[13px] font-extrabold text-primary-foreground shadow-sm transition-opacity disabled:opacity-60"
                  >
                    <MaterialIcon
                      name={sendingEmail ? "progress_activity" : "forward_to_inbox"}
                      size={19}
                      className={sendingEmail ? "animate-spin" : undefined}
                    />
                    {sendingEmail ? "جارٍ الحفظ..." : "إرسال البريد"}
                  </button>
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-gyellow/30 bg-gyellow/10 p-3 text-[11px] font-semibold text-foreground/75">
                  <MaterialIcon name="info" size={18} className="shrink-0 text-gold" filled />
                  يتم الآن حفظ البريد في قائمة الإرسال والأرشيف. يتحول إلى إرسال خارجي فعلي بعد
                  تفعيل مزود البريد الآمن من إعدادات النظام.
                </div>
              </div>
            </Card>
          </form>
        )}

        {tab === "archive" && (
          <div className="mt-4 space-y-4">
            <Card title="بحث الأرشيف" icon="manage_search">
              <div className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <FieldLabel label="الموظف">
                  <SelectControl
                    value={filters.employeeId}
                    onChange={(employeeId) => setFilters((current) => ({ ...current, employeeId }))}
                    options={employees.map((employee) => ({
                      value: String(employee["id"]),
                      label: `${String(employee["full_name"])} · ${String(employee["emp_no"])}`,
                    }))}
                    placeholder="كل الموظفين"
                  />
                </FieldLabel>
                <FieldLabel label="نوع المراسلة">
                  <SelectControl
                    value={filters.channel}
                    onChange={(channel) => setFilters((current) => ({ ...current, channel }))}
                    options={[
                      { value: "internal", label: "رسالة داخلية" },
                      { value: "email", label: "بريد إلكتروني" },
                    ]}
                    placeholder="كل الأنواع"
                  />
                </FieldLabel>
                <FieldLabel label="التاريخ من">
                  <input
                    type="date"
                    value={filters.fromDate}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, fromDate: event.target.value }))
                    }
                    className={controlClass}
                  />
                </FieldLabel>
                <FieldLabel label="التاريخ إلى">
                  <input
                    type="date"
                    value={filters.toDate}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, toDate: event.target.value }))
                    }
                    className={controlClass}
                  />
                </FieldLabel>
                <div className="flex gap-2">
                  <Btn icon="search" onClick={applyArchiveFilters}>
                    بحث
                  </Btn>
                  <Btn icon="restart_alt" variant="ghost" onClick={clearArchiveFilters}>
                    مسح
                  </Btn>
                </div>
              </div>
            </Card>

            <Card padded={false}>
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                <div className="me-auto">
                  <h2 className="flex items-center gap-2 text-sm font-extrabold">
                    <MaterialIcon name="inventory_2" size={19} className="text-primary" filled />
                    أرشيف المراسلات
                  </h2>
                  <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
                    {new Intl.NumberFormat("ar-EG").format(filteredRows.length)} مراسلة مطابقة
                  </p>
                </div>
                <div className="relative">
                  <input
                    value={tableSearch}
                    onChange={(event) => {
                      setTableSearch(event.target.value);
                      setPage(1);
                    }}
                    placeholder="بحث سريع..."
                    className={`${controlClass} h-9 w-52 pe-9`}
                  />
                  <MaterialIcon
                    name="search"
                    size={17}
                    className="pointer-events-none absolute inset-y-0 left-3 my-auto h-fit text-muted-foreground"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => window.print()}
                  title="طباعة / PDF"
                  className="grid size-9 place-items-center rounded-xl border border-border bg-secondary text-destructive transition-colors hover:bg-accent"
                >
                  <MaterialIcon name="picture_as_pdf" size={18} />
                </button>
                <button
                  type="button"
                  onClick={exportCsv}
                  title="تصدير Excel"
                  className="grid size-9 place-items-center rounded-xl border border-border bg-secondary text-teal transition-colors hover:bg-accent"
                >
                  <MaterialIcon name="table_view" size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  title="طباعة"
                  className="grid size-9 place-items-center rounded-xl border border-border bg-secondary text-primary transition-colors hover:bg-accent"
                >
                  <MaterialIcon name="print" size={18} />
                </button>
              </div>

              {archiveQuery.isError ? (
                <div className="m-5 flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                  <MaterialIcon name="error" size={20} filled />
                  <div>
                    <p className="font-extrabold">تعذر تحميل أرشيف المراسلات</p>
                    <p className="mt-1 text-[12px] font-semibold opacity-80">
                      تأكد من تطبيق تحديث قاعدة البيانات الخاص بشاشة المراسلات.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1800px] border-collapse text-right">
                    <thead>
                      <tr className="bg-topbar text-topbar-foreground">
                        {archiveColumns.map((column) => (
                          <th
                            key={column}
                            className="whitespace-nowrap border-l border-white/10 px-3 py-3 text-[11px] font-extrabold last:border-l-0"
                          >
                            <span className="flex items-center gap-1.5">
                              <MaterialIcon
                                name="filter_alt"
                                size={13}
                                className="text-topbar-accent"
                              />
                              {column}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {archiveQuery.isLoading && (
                        <tr>
                          <td
                            colSpan={archiveColumns.length}
                            className="px-4 py-16 text-center text-sm font-bold text-muted-foreground"
                          >
                            <MaterialIcon
                              name="progress_activity"
                              size={28}
                              className="mb-2 inline-block animate-spin text-primary"
                            />
                            <span className="block">جارٍ تحميل الأرشيف...</span>
                          </td>
                        </tr>
                      )}
                      {!archiveQuery.isLoading && pageRows.length === 0 && (
                        <tr>
                          <td
                            colSpan={archiveColumns.length}
                            className="px-4 py-16 text-center text-sm font-bold text-muted-foreground"
                          >
                            <MaterialIcon
                              name="inbox"
                              size={34}
                              className="mb-2 block text-border"
                            />
                            لا توجد مراسلات مطابقة للفلاتر الحالية
                          </td>
                        </tr>
                      )}
                      {pageRows.map((row) => {
                        const message = stripHtml(row["message_html"] ?? row["message"]);
                        return (
                          <tr
                            key={String(row["id"])}
                            className="border-b border-border odd:bg-secondary/35 hover:bg-accent/50"
                          >
                            <td className="whitespace-nowrap px-3 py-3 text-center text-[12px] font-black text-primary">
                              {new Intl.NumberFormat("ar-EG").format(
                                Number(row["character_count"] ?? message.length),
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-[12px] font-extrabold">
                              {String(row["employee_name"] ?? "—")}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-[12px] font-semibold">
                              {String(row["national_id"] ?? "—")}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-[12px] font-semibold">
                              {String(row["emp_no"] ?? "—")}
                            </td>
                            <td className="max-w-48 truncate px-3 py-3 text-[12px] font-semibold">
                              {String(row["sender_email"] ?? "—")}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3">
                              <Chip
                                label={
                                  row["channel"] === "email" ? "بريد إلكتروني" : "رسالة داخلية"
                                }
                                tone={row["channel"] === "email" ? "teal" : "blue"}
                              />
                            </td>
                            <td
                              className="max-w-72 truncate px-3 py-3 text-[12px] font-semibold"
                              title={message}
                            >
                              {message || "—"}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-[12px] font-semibold">
                              {String(row["phone"] ?? "—")}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-[12px] font-semibold">
                              {String(row["sender_name"] ?? "—")}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3">
                              <Chip
                                label={String(row["priority"] ?? "عادي")}
                                tone={row["priority"] === "عاجل" ? "amber" : "muted"}
                              />
                            </td>
                            <td className="whitespace-nowrap px-3 py-3">
                              {deliveryChip(String(row["delivery_status"] ?? "تم التسجيل"))}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-[12px] font-semibold">
                              {dateTimeAr(row["sent_at"] ?? row["created_at"])}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3">
                              <button
                                type="button"
                                onClick={() => setSelectedRow(row)}
                                className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                                title="عرض التفاصيل"
                              >
                                <MaterialIcon name="visibility" size={17} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 text-[12px] font-bold">
                <div className="flex items-center gap-1">
                  {[5, 10, 20].map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => {
                        setPageSize(size);
                        setPage(1);
                      }}
                      className={`grid size-8 place-items-center rounded-lg transition-colors ${
                        pageSize === size
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-secondary"
                      }`}
                    >
                      {new Intl.NumberFormat("ar-EG").format(size)}
                    </button>
                  ))}
                </div>
                <span className="text-muted-foreground">
                  صفحة {new Intl.NumberFormat("ar-EG").format(safePage)} من{" "}
                  {new Intl.NumberFormat("ar-EG").format(pages)} ·{" "}
                  {new Intl.NumberFormat("ar-EG").format(filteredRows.length)} عنصر
                </span>
                <div className="ms-auto flex items-center gap-1">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-30"
                  >
                    <MaterialIcon name="chevron_right" size={18} />
                  </button>
                  {Array.from({ length: Math.min(pages, 5) }, (_, index) => index + 1).map(
                    (number) => (
                      <button
                        key={number}
                        type="button"
                        onClick={() => setPage(number)}
                        className={`grid size-8 place-items-center rounded-lg transition-colors ${
                          safePage === number
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-secondary"
                        }`}
                      >
                        {new Intl.NumberFormat("ar-EG").format(number)}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    disabled={safePage >= pages}
                    onClick={() => setPage((current) => Math.min(pages, current + 1))}
                    className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-30"
                  >
                    <MaterialIcon name="chevron_left" size={18} />
                  </button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>

      {selectedRow && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="تفاصيل المراسلة"
          className="fixed inset-0 z-50 grid place-items-center bg-topbar/55 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedRow(null);
          }}
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-border bg-card shadow-2xl">
            <div className="flex items-center gap-3 border-b border-border p-5">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <MaterialIcon
                  name={selectedRow["channel"] === "email" ? "mail" : "chat"}
                  size={21}
                  filled
                />
              </span>
              <div>
                <h2 className="text-base font-extrabold">
                  {String(selectedRow["subject"] ?? "تفاصيل المراسلة")}
                </h2>
                <p className="text-[11px] font-semibold text-muted-foreground">
                  إلى {String(selectedRow["employee_name"] ?? "—")} ·{" "}
                  {dateTimeAr(selectedRow["sent_at"])}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRow(null)}
                className="ms-auto grid size-9 place-items-center rounded-xl text-muted-foreground hover:bg-secondary"
                aria-label="إغلاق"
              >
                <MaterialIcon name="close" size={20} />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div className="flex flex-wrap gap-2">
                <Chip
                  label={selectedRow["channel"] === "email" ? "بريد إلكتروني" : "رسالة داخلية"}
                  tone={selectedRow["channel"] === "email" ? "teal" : "blue"}
                />
                {deliveryChip(String(selectedRow["delivery_status"] ?? "تم التسجيل"))}
                <Chip label={String(selectedRow["priority"] ?? "عادي")} tone="muted" />
              </div>
              <div className="rounded-2xl border border-border bg-secondary/45 p-4 text-[13px] font-semibold leading-8 whitespace-pre-wrap">
                {stripHtml(selectedRow["message_html"] ?? selectedRow["message"]) || "—"}
              </div>
              <div className="grid gap-3 text-[12px] sm:grid-cols-2">
                <p>
                  <span className="font-extrabold">المرسل: </span>
                  {String(selectedRow["sender_name"] ?? "—")}
                </p>
                <p>
                  <span className="font-extrabold">البريد المستلم: </span>
                  {String(selectedRow["recipient_email"] ?? selectedRow["employee_email"] ?? "—")}
                </p>
              </div>
              {selectedRow["attachment_path"] && (
                <Btn icon="attachment" variant="ghost" onClick={() => openAttachment(selectedRow)}>
                  فتح المرفق · {String(selectedRow["attachment_name"] ?? "ملف")}
                </Btn>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
