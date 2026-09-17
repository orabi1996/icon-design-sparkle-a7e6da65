import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { AppShell } from "@/components/hr/AppShell";
import { MaterialIcon } from "@/components/MaterialIcon";
import { useCompanyWorkspace } from "@/components/hr/CompanyWorkspace";
import { useRows } from "@/lib/hr-db";
import {
  listBranchesFn,
  saveBranchFn,
  deactivateBranchFn,
} from "@/lib/organization.functions";
import type { BranchEntity } from "@/lib/organization-core.mjs";

export const Route = createFileRoute("/settings/branches")({
  head: () => ({ meta: [{ title: "تهيئة بيانات الفروع | إعدادات النظام" }] }),
  component: BranchesSettingsPage,
});

const inputCls =
  "h-9 w-full rounded-xl border border-input bg-background px-3 text-[12px] font-semibold text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/25";

function BranchesSettingsPage() {
  const queryClient = useQueryClient();
  const workspace = useCompanyWorkspace();
  const company = workspace.selectedCompany;

  const { data: employees = [] } = useRows("employees");

  // Fetch real branches from DB via TanStack Start server function
  const { data: serverBranches = [], isLoading } = useQuery({
    queryKey: ["org-branches", company?.tenant_id, company?.id],
    enabled: Boolean(company?.id && company?.tenant_id),
    queryFn: async () => {
      if (!company?.id || !company?.tenant_id) return [];
      return await listBranchesFn({
        data: { tenantId: company.tenant_id, companyId: company.id },
      });
    },
  });

  // Save Branch Mutation
  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (!company?.id || !company?.tenant_id) throw new Error("اختر شركة أولاً");
      return await saveBranchFn({
        data: {
          ...payload,
          tenantId: company.tenant_id,
          companyId: company.id,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-branches"] });
      toast.success("تم حفظ بيانات الفرع بنجاح");
      setIsModalOpen(false);
    },
    onError: (err: Error) => {
      toast.error(`تعذر الحفظ: ${err.message}`);
    },
  });

  // Deactivate Branch Mutation (fail-safe soft deactivation, zero destructive delete)
  const deactivateMutation = useMutation({
    mutationFn: async (branchId: string) => {
      if (!company?.tenant_id) throw new Error("اختر شركة أولاً");
      return await deactivateBranchFn({
        data: { branchId, tenantId: company.tenant_id },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-branches"] });
      toast.success("تم إيقاف الفرع بنجاح مع الحفاظ الكامل على السجلات التاريخية");
    },
    onError: (err: Error) => {
      toast.error(`تعذر إيقاف الفرع: ${err.message}`);
    },
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<BranchEntity | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [formData, setFormData] = useState({
    id: undefined as string | undefined,
    code: "",
    nameAr: "",
    nameEn: "",
    city: "الرياض",
    district: "",
    managerId: "",
    phone: "",
    email: "",
    active: true,
  });

  // Map employee IDs to names
  const employeeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const emp of employees) {
      const id = emp["id"] ? String(emp["id"]) : "";
      const name = (emp["full_name"] as string) || (emp["name"] as string) || "";
      if (id && name) map.set(id, name);
    }
    return map;
  }, [employees]);

  // Count employees per branch
  const employeeCountByBranch = useMemo(() => {
    const map = new Map<string, number>();
    for (const emp of employees) {
      const bId = emp["branch_id"] ? String(emp["branch_id"]) : "";
      const bName = emp["branch"] ? String(emp["branch"]) : "";
      if (bId) map.set(bId, (map.get(bId) || 0) + 1);
      if (bName) map.set(bName, (map.get(bName) || 0) + 1);
    }
    return map;
  }, [employees]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return serverBranches;
    const q = searchQuery.toLowerCase();
    return serverBranches.filter(
      (b) =>
        b.name_ar.toLowerCase().includes(q) ||
        b.code.toLowerCase().includes(q) ||
        (b.city && b.city.toLowerCase().includes(q)) ||
        (b.name_en && b.name_en.toLowerCase().includes(q)) ||
        (b.manager_id && employeeNameById.get(b.manager_id)?.toLowerCase().includes(q))
    );
  }, [serverBranches, searchQuery, employeeNameById]);

  const handleOpenAdd = () => {
    setEditingBranch(null);
    setFormData({
      id: undefined,
      code: `BR-0${serverBranches.length + 1}`,
      nameAr: "",
      nameEn: "",
      city: "الرياض",
      district: "",
      managerId: "",
      phone: "",
      email: "",
      active: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (b: BranchEntity) => {
    setEditingBranch(b);
    setFormData({
      id: b.id,
      code: b.code,
      nameAr: b.name_ar,
      nameEn: b.name_en || "",
      city: b.city || "الرياض",
      district: b.district || "",
      managerId: b.manager_id || "",
      phone: b.phone || "",
      email: b.email || "",
      active: b.active !== false,
    });
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!formData.nameAr.trim() || !formData.code.trim()) {
      toast.error("يرجى ملء كود واسم الفرع بالعربية");
      return;
    }

    saveMutation.mutate({
      id: formData.id,
      code: formData.code.trim(),
      nameAr: formData.nameAr.trim(),
      nameEn: formData.nameEn.trim() || undefined,
      city: formData.city.trim() || undefined,
      district: formData.district.trim() || undefined,
      managerId: formData.managerId || null,
      phone: formData.phone.trim() || undefined,
      email: formData.email.trim() || undefined,
      active: formData.active,
    });
  };

  const handleDeactivate = (branch: BranchEntity) => {
    if (!branch.id) return;
    if (
      window.confirm(
        `هل أنت متأكد من إيقاف فرع "${branch.name_ar}"؟ لن يتم حذف السجلات التاريخية أو بيانات الموظفين المرتبطة به.`
      )
    ) {
      deactivateMutation.mutate(branch.id);
    }
  };

  /* ─── Export ─── */
  const exportExcel = () => {
    const headers = [
      "كود الفرع",
      "اسم الفرع (عربي)",
      "الاسم بالإنجليزية",
      "المدينة",
      "الحي",
      "مدير الفرع",
      "الهاتف",
      "البريد الإلكتروني",
      "عدد الموظفين",
      "الحالة",
    ];
    const data = filtered.map((b) => {
      const bId = b.id ?? "";
      const bName = b.name_ar ?? "";
      const count =
        (bId ? employeeCountByBranch.get(bId) : undefined) ??
        (bName ? employeeCountByBranch.get(bName) : undefined) ??
        0;
      return [
        b.code,
        b.name_ar,
        b.name_en || "",
        b.city || "",
        b.district || "",
        (b.manager_id && employeeNameById.get(b.manager_id)) || "غير محدد",
        b.phone || "",
        b.email || "",
        count,
        b.active !== false ? "نشط" : "غير نشط",
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    if (!ws["!views"]) ws["!views"] = [];
    ws["!views"].push({ rightToLeft: true });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "فروع الشركة");
    XLSX.writeFile(wb, `دليل-فروع-${company?.display_name || "الشركة"}.xlsx`);
  };

  const uniqueCitiesCount = useMemo(() => {
    const cities = new Set(
      serverBranches
        .map((b) => b.city)
        .filter((c): c is string => Boolean(c))
    );
    return cities.size;
  }, [serverBranches]);

  return (
    <AppShell>
      {/* Title */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
        <h1 className="text-[16px] font-extrabold text-foreground flex items-center gap-2">
          <MaterialIcon name="store" size={22} className="text-primary" />
          تهيئة وإدارة بيانات فروع المنشأة
        </h1>
        {company && (
          <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-bold text-primary">
            <MaterialIcon name="domain" size={16} />
            الشركة: {company.display_name}
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4" dir="rtl">
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">إجمالي الفروع المسجلة</div>
          <div className="text-lg font-extrabold text-blue-700 font-mono mt-1">
            {serverBranches.length} فروع
          </div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">الفروع النشطة العاملة</div>
          <div className="text-lg font-extrabold text-emerald-700 font-mono mt-1">
            {serverBranches.filter((b) => b.active !== false).length} فرع
          </div>
        </div>
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">تغطية المدن والمناطق</div>
          <div className="text-lg font-extrabold text-indigo-700 font-mono mt-1">
            {uniqueCitiesCount} مدن
          </div>
        </div>
        <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-3 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">إجمالي موظفي المنشأة</div>
          <div className="text-lg font-extrabold text-purple-700 font-mono mt-1">
            {employees.length} موظف
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div
        className="mb-4 flex flex-wrap items-center justify-between gap-3 bg-muted/40 p-3 rounded-xl border border-border"
        dir="rtl"
      >
        <div className="relative">
          <input
            type="text"
            placeholder="البحث بالاسم، الكود، المدينة، المدير..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-64 rounded-xl border border-input bg-background pe-8 ps-3 text-[11px] font-medium outline-none focus:border-primary focus:ring-2 focus:ring-ring/25"
          />
          <MaterialIcon
            name="search"
            size={16}
            className="pointer-events-none absolute left-2.5 top-2.5 text-muted-foreground"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenAdd}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-primary h-9 px-4 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 transition"
          >
            <MaterialIcon name="add" size={16} />
            إضافة فرع جديد
          </button>
          <button
            onClick={exportExcel}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 h-9 px-3.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
          >
            <MaterialIcon name="table_chart" size={15} />
            Excel
          </button>
        </div>
      </div>

      {/* Branches Table */}
      <div className="overflow-x-auto rounded-xl border border-border shadow-xs bg-card" dir="rtl">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-primary text-primary-foreground">
              <th className="px-3 py-2.5 font-extrabold border-r border-primary/20 text-center">كود الفرع</th>
              <th className="px-3 py-2.5 font-extrabold border-r border-primary/20 text-right">اسم الفرع</th>
              <th className="px-3 py-2.5 font-extrabold border-r border-primary/20 text-right">المدينة والحي</th>
              <th className="px-3 py-2.5 font-extrabold border-r border-primary/20 text-right">مدير الفرع</th>
              <th className="px-3 py-2.5 font-extrabold border-r border-primary/20 text-center">هاتف الفرع</th>
              <th className="px-3 py-2.5 font-extrabold border-r border-primary/20 text-left">البريد الإلكتروني</th>
              <th className="px-3 py-2.5 font-extrabold border-r border-primary/20 text-center">الموظفين</th>
              <th className="px-3 py-2.5 font-extrabold border-r border-primary/20 text-center">الحالة</th>
              <th className="px-3 py-2.5 font-extrabold text-center">إجراءات</th>
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-muted-foreground">
                  جاري تحميل بيانات الفروع...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-muted-foreground">
                  لا توجد فروع مسجلة لهذه الشركة حالياً
                </td>
              </tr>
            ) : (
              filtered.map((b, idx) => {
                const bId = b.id ?? "";
                const bName = b.name_ar ?? "";
                const count =
                  (bId ? employeeCountByBranch.get(bId) : undefined) ??
                  (bName ? employeeCountByBranch.get(bName) : undefined) ??
                  0;
                const managerName = b.manager_id
                  ? employeeNameById.get(b.manager_id) || "غير معروف"
                  : "غير محدد";

                return (
                  <tr
                    key={b.id}
                    className={`border-b border-border transition hover:bg-muted/40 ${
                      idx % 2 === 0 ? "bg-background" : "bg-muted/10"
                    }`}
                  >
                    <td className="px-3 py-2 border-r border-border text-center font-mono font-bold text-primary">
                      {b.code}
                    </td>
                    <td className="px-3 py-2 border-r border-border text-right font-bold text-foreground">
                      <div>{b.name_ar}</div>
                      {b.name_en && (
                        <div className="text-[10px] font-normal text-muted-foreground font-sans">
                          {b.name_en}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 border-r border-border text-right text-foreground">
                      {b.city || "—"} {b.district ? `(${b.district})` : ""}
                    </td>
                    <td className="px-3 py-2 border-r border-border text-right font-medium text-foreground">
                      {managerName}
                    </td>
                    <td className="px-3 py-2 border-r border-border text-center font-mono text-muted-foreground">
                      {b.phone || "—"}
                    </td>
                    <td className="px-3 py-2 border-r border-border text-left font-mono text-xs text-muted-foreground">
                      {b.email || "—"}
                    </td>
                    <td className="px-3 py-2 border-r border-border text-center font-mono font-bold text-primary">
                      {count} موظف
                    </td>
                    <td className="px-3 py-2 border-r border-border text-center">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          b.active !== false
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                            : "bg-destructive/10 text-destructive"
                        }`}
                      >
                        {b.active !== false ? "نشط" : "غير نشط"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleOpenEdit(b)}
                          title="تعديل الفرع"
                          className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition"
                        >
                          <MaterialIcon name="edit" size={16} />
                        </button>
                        {b.active !== false && b.id && (
                          <button
                            onClick={() => handleDeactivate(b)}
                            title="إيقاف الفرع (حفظ تاريخي)"
                            className="rounded-lg p-1 text-destructive/70 hover:bg-destructive/10 hover:text-destructive transition"
                          >
                            <MaterialIcon name="power_settings_new" size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
          dir="rtl"
        >
          <div className="w-full max-w-lg rounded-2xl bg-card p-5 shadow-2xl border border-border">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <h3 className="text-sm font-extrabold text-foreground flex items-center gap-2">
                <MaterialIcon name="store" size={20} className="text-primary" />
                {editingBranch ? "تعديل بيانات الفرع" : "إضافة فرع جديد للمنشأة"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-muted-foreground hover:text-foreground transition"
              >
                <MaterialIcon name="close" size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-foreground">كود الفرع *</span>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData((p) => ({ ...p, code: e.target.value }))}
                  className={inputCls}
                  placeholder="مثال: BR-01"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-foreground">اسم الفرع (بالعربية) *</span>
                <input
                  type="text"
                  value={formData.nameAr}
                  onChange={(e) => setFormData((p) => ({ ...p, nameAr: e.target.value }))}
                  className={inputCls}
                  placeholder="مثال: الفرع الرئيسي - الرياض"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-foreground">الاسم بالإنجليزية (اختياري)</span>
                <input
                  type="text"
                  value={formData.nameEn}
                  onChange={(e) => setFormData((p) => ({ ...p, nameEn: e.target.value }))}
                  className={`${inputCls} text-left`}
                  placeholder="Main Branch - Riyadh"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-foreground">المدينة</span>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData((p) => ({ ...p, city: e.target.value }))}
                  className={inputCls}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-foreground">الحي والشارع</span>
                <input
                  type="text"
                  value={formData.district}
                  onChange={(e) => setFormData((p) => ({ ...p, district: e.target.value }))}
                  className={inputCls}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-foreground">مدير الفرع</span>
                <select
                  value={formData.managerId}
                  onChange={(e) => setFormData((p) => ({ ...p, managerId: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">(غير محدد)</option>
                  {employees.map((emp) => {
                    const empId = String(emp["id"] ?? "");
                    const empName = (emp["full_name"] as string) || (emp["name"] as string) || empId;
                    const empNo = emp["emp_no"] ? String(emp["emp_no"]) : "";
                    return (
                      <option key={empId} value={empId}>
                        {empName} {empNo ? `(${empNo})` : ""}
                      </option>
                    );
                  })}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-foreground">هاتف الفرع</span>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                  className={inputCls}
                />
              </label>

              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-xs font-bold text-foreground">البريد الإلكتروني للفرع</span>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                  className={`${inputCls} text-left`}
                  placeholder="branch@company.com"
                />
              </label>

              <div className="flex items-center gap-2 sm:col-span-2 pt-1">
                <input
                  type="checkbox"
                  id="activeBranchCheck"
                  checked={formData.active}
                  onChange={(e) => setFormData((p) => ({ ...p, active: e.target.checked }))}
                  className="rounded border-input text-primary focus:ring-primary h-4 w-4"
                />
                <label htmlFor="activeBranchCheck" className="text-xs font-bold text-foreground">
                  الفرع نشط حالياً ويعمل في الهيكل
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 h-9 rounded-xl border border-input text-foreground text-xs font-bold hover:bg-muted transition"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="px-5 h-9 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold shadow-xs transition disabled:opacity-50"
              >
                {saveMutation.isPending ? "جاري الحفظ..." : "حفظ الفرع"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 text-center text-xs font-bold text-muted-foreground border-t border-border pt-4">
        جميع الحقوق محفوظة © الحلول الخبيرة
      </div>
    </AppShell>
  );
}
