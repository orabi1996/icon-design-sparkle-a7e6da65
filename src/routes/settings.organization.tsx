import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/hr/AppShell";
import { MaterialIcon } from "@/components/MaterialIcon";
import { useCompanyWorkspace } from "@/components/hr/CompanyWorkspace";
import { useRows } from "@/lib/hr-db";
import {
  listDepartmentsFn,
  saveDepartmentFn,
  deactivateDepartmentFn,
  runLegacyOrgReconciliationFn,
} from "@/lib/organization.functions";
import type { DepartmentEntity } from "@/lib/organization-core.mjs";

export const Route = createFileRoute("/settings/organization")({
  head: () => ({ meta: [{ title: "الهيكل التنظيمي والأقسام | إعدادات النظام" }] }),
  component: OrganizationSettingsPage,
});

const inputCls =
  "h-9 w-full rounded-xl border border-input bg-background px-3 text-[12px] font-semibold text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/25";

type OrgTab = "tree" | "departments" | "reconciliation";

function OrganizationSettingsPage() {
  const queryClient = useQueryClient();
  const workspace = useCompanyWorkspace();
  const company = workspace.selectedCompany;
  const [tab, setTab] = useState<OrgTab>("tree");
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<DepartmentEntity | null>(null);

  const { data: employees = [] } = useRows("employees");

  // Fetch departments for current company
  const { data: departments = [], isLoading } = useQuery({
    queryKey: ["org-departments", company?.tenant_id, company?.id],
    enabled: Boolean(company?.id && company?.tenant_id),
    queryFn: async () => {
      if (!company?.id || !company?.tenant_id) return [];
      return await listDepartmentsFn({
        data: { tenantId: company.tenant_id, companyId: company.id },
      });
    },
  });

  // Save Department Mutation
  const saveMutation = useMutation({
    mutationFn: async (deptPayload: any) => {
      if (!company?.id || !company?.tenant_id) throw new Error("اختر شركة أولاً");
      return await saveDepartmentFn({
        data: {
          ...deptPayload,
          tenantId: company.tenant_id,
          companyId: company.id,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-departments"] });
      toast.success("تم حفظ بيانات القسم بنجاح");
      setIsModalOpen(false);
    },
    onError: (err: Error) => {
      toast.error(`تعذر الحفظ: ${err.message}`);
    },
  });

  // Deactivate Department Mutation
  const deactivateMutation = useMutation({
    mutationFn: async (departmentId: string) => {
      if (!company?.tenant_id) throw new Error("اختر شركة أولاً");
      return await deactivateDepartmentFn({
        data: { departmentId, tenantId: company.tenant_id },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-departments"] });
      toast.success("تم إيقاف القسم بنجاح دون حذف السجلات التاريخية");
    },
    onError: (err: Error) => {
      toast.error(`تعذر الإيقاف: ${err.message}`);
    },
  });

  // Form State
  const [formData, setFormData] = useState({
    code: "",
    nameAr: "",
    nameEn: "",
    level: "department" as "main_department" | "department" | "section" | "team",
    parentId: "",
    branchId: "",
    managerId: "",
    active: true,
  });

  const handleOpenAdd = () => {
    setEditingDept(null);
    setFormData({
      code: `DEP-0${departments.length + 1}`,
      nameAr: "",
      nameEn: "",
      level: "department",
      parentId: "",
      branchId: "",
      managerId: "",
      active: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (d: DepartmentEntity) => {
    setEditingDept(d);
    setFormData({
      code: d.code,
      nameAr: d.name_ar,
      nameEn: d.name_en || "",
      level: d.level || "department",
      parentId: d.parent_id || "",
      branchId: d.branch_id || "",
      managerId: d.manager_id || "",
      active: d.active !== false,
    });
    setIsModalOpen(true);
  };

  // Reconciliation State
  const [reconReport, setReconReport] = useState<any>(null);
  const [reconLoading, setReconLoading] = useState(false);

  const runReconciliation = async (dryRun: boolean) => {
    if (!company?.id || !company?.tenant_id) {
      toast.error("يرجى اختيار شركة من مساحة العمل أولاً");
      return;
    }
    setReconLoading(true);
    try {
      const res = await runLegacyOrgReconciliationFn({
        data: { tenantId: company.tenant_id, companyId: company.id, dryRun },
      });
      setReconReport(res);
      toast.success(
        dryRun
          ? "اكتمل فحص المطابقة التجريبي بنجاح"
          : "تم تطبيق المطابقة وربط السجلات المعيارية بنجاح",
      );
    } catch (err: any) {
      toast.error(err.message || "تعذر إجراء المطابقة");
    } finally {
      setReconLoading(false);
    }
  };

  const filteredDepartments = useMemo(() => {
    if (!searchQuery.trim()) return departments;
    const q = searchQuery.toLowerCase();
    return departments.filter(
      (d) =>
        d.name_ar.toLowerCase().includes(q) ||
        d.code.toLowerCase().includes(q) ||
        (d.name_en && d.name_en.toLowerCase().includes(q)),
    );
  }, [departments, searchQuery]);

  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-extrabold text-foreground">
            <MaterialIcon name="account_tree" size={24} className="text-primary" />
            الهيكل التنظيمي وإدارة الأقسام
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            إدارة الوحدات التنظيمية والتبعية الهرمية ومطابقة البيانات النصية القديمة
          </p>
        </div>

        {company && (
          <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-bold text-primary">
            <MaterialIcon name="domain" size={16} />
            الشركة الحالية: {company.display_name}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-2 border-b border-border pb-2">
        <button
          onClick={() => setTab("tree")}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
            tab === "tree"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-secondary"
          }`}
        >
          <MaterialIcon name="schema" size={16} />
          شجرة الهيكل التنظيمي
        </button>
        <button
          onClick={() => setTab("departments")}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
            tab === "departments"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-secondary"
          }`}
        >
          <MaterialIcon name="list" size={16} />
          دليل الأقسام والوحدات ({departments.length})
        </button>
        <button
          onClick={() => setTab("reconciliation")}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
            tab === "reconciliation"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-secondary"
          }`}
        >
          <MaterialIcon name="rule" size={16} />
          تقرير مطابقة البيانات القديمة (Reconciliation)
        </button>
      </div>

      {/* Tab: Tree View */}
      {tab === "tree" && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">تدرج الهيكل التنظيمي للشركة</h2>
            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90"
            >
              <MaterialIcon name="add" size={16} />
              إضافة قسم
            </button>
          </div>

          {departments.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              لا توجد أقسام مسجلة لهذه الشركة حتى الآن. ابدأ بإضافة الإدارات الرئيسية ثم الأقسام
              الفرعية.
            </div>
          ) : (
            <div className="space-y-3" dir="rtl">
              {departments
                .filter((d) => !d.parent_id)
                .map((parent) => (
                  <div key={parent.id} className="rounded-xl border border-border bg-secondary/30 p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary font-bold text-xs">
                          {parent.level === "main_department" ? "إ.ر" : "ق"}
                        </span>
                        <div>
                          <div className="font-bold text-sm text-foreground">{parent.name_ar}</div>
                          <div className="text-[11px] font-mono text-muted-foreground">
                            {parent.code} {parent.name_en ? `· ${parent.name_en}` : ""}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenEdit(parent)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary"
                        >
                          <MaterialIcon name="edit" size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Children */}
                    <div className="mt-3 ps-6 space-y-2 border-r-2 border-primary/20 me-2">
                      {departments
                        .filter((c) => c.parent_id === parent.id)
                        .map((child) => (
                          <div
                            key={child.id}
                            className="flex items-center justify-between rounded-lg bg-background p-2 border border-border/60"
                          >
                            <div className="flex items-center gap-2">
                              <MaterialIcon
                                name="subdirectory_arrow_right"
                                size={14}
                                className="text-muted-foreground"
                              />
                              <div>
                                <span className="text-xs font-bold text-foreground">
                                  {child.name_ar}
                                </span>
                                <span className="ms-2 text-[10px] font-mono text-muted-foreground">
                                  ({child.code})
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() => handleOpenEdit(child)}
                              className="rounded p-1 text-muted-foreground hover:bg-secondary"
                            >
                              <MaterialIcon name="edit" size={14} />
                            </button>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Departments List */}
      {tab === "departments" && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <input
              type="text"
              placeholder="البحث بالاسم أو الرمز..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-64 rounded-xl border border-input bg-background px-3 text-xs outline-none focus:border-primary"
            />
            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-1 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90"
            >
              <MaterialIcon name="add" size={16} />
              إضافة قسم جديد
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs" dir="rtl">
              <thead>
                <tr className="border-b border-border bg-secondary/40 text-muted-foreground">
                  <th className="p-2.5 font-bold">الرمز</th>
                  <th className="p-2.5 font-bold">اسم القسم</th>
                  <th className="p-2.5 font-bold">المستوى</th>
                  <th className="p-2.5 font-bold">القسم الأب</th>
                  <th className="p-2.5 font-bold">الحالة</th>
                  <th className="p-2.5 font-bold text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredDepartments.map((d) => (
                  <tr key={d.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="p-2.5 font-mono font-bold">{d.code}</td>
                    <td className="p-2.5 font-bold">{d.name_ar}</td>
                    <td className="p-2.5">
                      <span className="rounded-md bg-secondary px-2 py-0.5 text-[11px] font-semibold">
                        {d.level === "main_department"
                          ? "إدارة عامة"
                          : d.level === "section"
                            ? "شعبة"
                            : d.level === "team"
                              ? "فريق"
                              : "قسم"}
                      </span>
                    </td>
                    <td className="p-2.5 text-muted-foreground">
                      {departments.find((p) => p.id === d.parent_id)?.name_ar || "—"}
                    </td>
                    <td className="p-2.5">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                          d.active !== false
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-red-50 text-red-700"
                        }`}
                      >
                        {d.active !== false ? "نشط" : "معطل"}
                      </span>
                    </td>
                    <td className="p-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleOpenEdit(d)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary"
                        >
                          <MaterialIcon name="edit" size={16} />
                        </button>
                        {d.active !== false && (
                          <button
                            onClick={() => {
                              if (confirm(`هل أنت متأكد من إيقاف القسم "${d.name_ar}"؟`)) {
                                if (d.id) deactivateMutation.mutate(d.id);
                              }
                            }}
                            className="rounded-lg p-1.5 text-amber-600 hover:bg-amber-50"
                            title="إيقاف القسم"
                          >
                            <MaterialIcon name="block" size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Legacy Reconciliation */}
      {tab === "reconciliation" && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm" dir="rtl">
          <div className="mb-4">
            <h2 className="text-base font-extrabold text-foreground flex items-center gap-2">
              <MaterialIcon name="compare_arrows" size={20} className="text-primary" />
              مطابقة وترحيل النصوص القديمة إلى المعرفات المعتمدة (Legacy Reconciliation)
            </h2>
            <p className="mt-1 text-xs text-muted-foreground leading-5">
              يقوم هذا النظام بفحص الحقول النصية القديمة في بيانات الموظفين (`branch` و
              `department`) ومطابقتها مع الكيانات المعتمدة في الهيكل التنظيمي، لمنع فقدان البيانات
              التاريخية وتطبيق مبدأ عدم الربط التلقائي في حال وجود أسماء متكررة أو ملتبسة.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-6">
            <button
              onClick={() => runReconciliation(true)}
              disabled={reconLoading}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-secondary px-4 py-2 text-xs font-bold text-foreground hover:bg-secondary/80 transition disabled:opacity-50"
            >
              <MaterialIcon name="search" size={16} />
              فحص تجريبي للمطابقة (Dry Run)
            </button>
            <button
              onClick={() => {
                if (
                  confirm(
                    "هل أنت متأكد من تطبيق وتثبيت المطابقات المعتمدة على سجلات الموظفين؟ لن يتم المساس بالسجلات الملتبسة.",
                  )
                ) {
                  runReconciliation(false);
                }
              }}
              disabled={reconLoading}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50"
            >
              <MaterialIcon name="done_all" size={16} />
              تثبيت المطابقات المعتمدة (Commit Reconciliation)
            </button>
          </div>

          {reconReport && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Branches Summary */}
                <div className="rounded-xl border border-border bg-secondary/20 p-4">
                  <h3 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2">
                    <MaterialIcon name="store" size={18} className="text-blue-600" />
                    مطابقة الفروع (Branches)
                  </h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center p-2 rounded bg-emerald-50 text-emerald-800 font-bold">
                      <span>سجلات مطابقة بنجاح (Matched):</span>
                      <span className="font-mono">{reconReport.branches.matched}</span>
                    </div>
                    <div className="flex justify-between items-center p-2 rounded bg-amber-50 text-amber-800 font-bold">
                      <span>سجلات ملتبسة أو مكررة (Ambiguous):</span>
                      <span className="font-mono">{reconReport.branches.ambiguous}</span>
                    </div>
                    <div className="flex justify-between items-center p-2 rounded bg-red-50 text-red-800 font-bold">
                      <span>سجلات غير موجودة بالهيكل (Unmatched):</span>
                      <span className="font-mono">{reconReport.branches.unmatched}</span>
                    </div>
                  </div>
                </div>

                {/* Departments Summary */}
                <div className="rounded-xl border border-border bg-secondary/20 p-4">
                  <h3 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2">
                    <MaterialIcon name="category" size={18} className="text-indigo-600" />
                    مطابقة الأقسام (Departments)
                  </h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center p-2 rounded bg-emerald-50 text-emerald-800 font-bold">
                      <span>سجلات مطابقة بنجاح (Matched):</span>
                      <span className="font-mono">{reconReport.departments.matched}</span>
                    </div>
                    <div className="flex justify-between items-center p-2 rounded bg-amber-50 text-amber-800 font-bold">
                      <span>سجلات ملتبسة أو مكررة (Ambiguous):</span>
                      <span className="font-mono">{reconReport.departments.ambiguous}</span>
                    </div>
                    <div className="flex justify-between items-center p-2 rounded bg-red-50 text-red-800 font-bold">
                      <span>سجلات غير موجودة بالهيكل (Unmatched):</span>
                      <span className="font-mono">{reconReport.departments.unmatched}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal for Add / Edit Department */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div
            className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl"
            dir="rtl"
          >
            <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-extrabold text-foreground">
                {editingDept ? "تعديل بيانات القسم" : "إضافة قسم جديد في الهيكل"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-secondary"
              >
                <MaterialIcon name="close" size={20} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveMutation.mutate({
                  ...(editingDept?.id ? { id: editingDept.id } : {}),
                  code: formData.code,
                  nameAr: formData.nameAr,
                  nameEn: formData.nameEn || undefined,
                  level: formData.level,
                  parentId: formData.parentId || null,
                  branchId: formData.branchId || null,
                  managerId: formData.managerId || null,
                  active: formData.active,
                });
              }}
              className="space-y-4 text-xs font-semibold"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-bold text-foreground">رمز القسم *</label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className={inputCls}
                    placeholder="مثال: HR-OPS"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-bold text-foreground">مستوى الوحدة *</label>
                  <select
                    value={formData.level}
                    onChange={(e) => setFormData({ ...formData, level: e.target.value as any })}
                    className={inputCls}
                  >
                    <option value="main_department">إدارة رئيسية</option>
                    <option value="department">قسم</option>
                    <option value="section">شعبة</option>
                    <option value="team">فريق عمل</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block font-bold text-foreground">الاسم بالعربية *</label>
                <input
                  type="text"
                  required
                  value={formData.nameAr}
                  onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                  className={inputCls}
                  placeholder="مثال: إدارة العمليات والموارد البشرية"
                />
              </div>

              <div>
                <label className="mb-1 block font-bold text-foreground">الاسم بالإنجليزية</label>
                <input
                  type="text"
                  value={formData.nameEn}
                  onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                  className={inputCls}
                  placeholder="e.g. HR Operations"
                />
              </div>

              <div>
                <label className="mb-1 block font-bold text-foreground">القسم الأب (التبعية)</label>
                <select
                  value={formData.parentId}
                  onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
                  className={inputCls}
                >
                  <option value="">بدون قسم أب (إدارة عليا)</option>
                  {departments
                    .filter((d) => d.id !== editingDept?.id)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name_ar} ({d.code})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block font-bold text-foreground">مدير القسم</label>
                <select
                  value={formData.managerId}
                  onChange={(e) => setFormData({ ...formData, managerId: e.target.value })}
                  className={inputCls}
                >
                  <option value="">اختر مدير القسم...</option>
                  {employees.map((emp) => (
                    <option key={String(emp["id"])} value={String(emp["id"])}>
                      {(emp["name"] as string) || (emp["full_name"] as string)} ({(emp["emp_no"] as string) || "بدون رقم"})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="dept-active"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  className="rounded border-input text-primary focus:ring-ring"
                />
                <label htmlFor="dept-active" className="text-xs font-bold text-foreground">
                  قسم نشط ويعمل حالياً
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-border px-4 py-2 font-bold text-foreground hover:bg-secondary"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="rounded-xl bg-primary px-5 py-2 font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {saveMutation.isPending ? "جارٍ الحفظ..." : "حفظ القسم"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
