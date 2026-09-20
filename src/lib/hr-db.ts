import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseTableClient = any;

/** Loose client wrapper: keeps generated types out of the hot type path. */
const db = supabase as unknown as {
  from: (t: string) => LooseTableClient;
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type HrTable =
  | "employees"
  | "employee_relatives"
  | "employee_documents"
  | "employee_entitlements"
  | "employee_deductions"
  | "departments"
  | "entitlements"
  | "deductions"
  | "loans"
  | "leave_requests"
  | "requests"
  | "announcements"
  | "attendance_records"
  | "payroll_runs"
  | "work_shift_groups"
  | "regulation_rules"
  | "basic_lookups"
  | "inquiries"
  | "app_settings"
  | "account_links"
  | "employee_permits"
  | "employee_correspondence"
  | "employee_eos_provisions"
  | "eos_provision_postings"
  | "end_of_service_requests"
  | "task_categories"
  | "task_priorities"
  | "task_statuses"
  | "task_creator_permissions"
  | "task_receiver_permissions"
  | "tasks"
  | "approval_requests"
  | "fingerprint_records"
  | "permission_groups"
  | "permission_group_members"
  | "permission_rules"
  | "permission_scopes"
  | "permission_features"
  | "email_logs"
  | "email_templates";

export type RowFilters = Record<string, string | number | boolean>;

export type RowsOptions = {
  orderBy?: string;
  ascending?: boolean;
  limit?: number;
  /** equality filters applied server-side */
  filters?: RowFilters;
  /** inclusive date range applied on `rangeColumn` (default: created_at) */
  from?: string;
  to?: string;
  rangeColumn?: string;
};

export function useRows(table: HrTable, opts?: RowsOptions) {
  return useQuery({
    queryKey: [
      table,
      opts?.orderBy ?? "created_at",
      opts?.ascending ?? false,
      opts?.limit ?? 0,
      opts?.filters ?? null,
      opts?.from ?? null,
      opts?.to ?? null,
      opts?.rangeColumn ?? "created_at",
    ],
    queryFn: async (): Promise<Row[]> => {
      let q = db
        .from(table)
        .select("*")
        .order(opts?.orderBy ?? "created_at", { ascending: opts?.ascending ?? false });
      for (const [k, v] of Object.entries(opts?.filters ?? {})) q = q.eq(k, v);
      const col = opts?.rangeColumn ?? "created_at";
      if (opts?.from) q = q.gte(col, opts.from);
      if (opts?.to)
        q = q.lte(
          col,
          opts.to.length === 10 && col !== "created_at" ? opts.to : `${opts.to}T23:59:59`,
        );
      if (opts?.limit) q = q.limit(opts.limit);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>, table: HrTable) {
  qc.invalidateQueries({ queryKey: [table] });
}

/** Insert when the row has no id, update otherwise. */
export function useSaveRow(table: HrTable) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Row) => {
      const { id, created_at: _c, updated_at: _u, ...values } = row;
      if (id) {
        const { data, error } = await db.from(table).update(values).eq("id", id).select().single();
        if (error) throw error;
        return data as Row;
      }
      const { data, error } = await db.from(table).insert(values).select().single();
      if (error) throw error;
      return data as Row;
    },
    onSuccess: (_d, vars) => {
      invalidate(qc, table);
      toast.success(vars["id"] ? "تم تحديث السجل بنجاح" : "تمت الإضافة بنجاح");
    },
    onError: (e: Error) => toast.error(`تعذر الحفظ: ${e.message}`),
  });
}

/** Insert a validated batch in a single request. */
export function useInsertRows(table: HrTable) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Row[]) => {
      if (rows.length === 0) throw new Error("لا توجد بيانات صالحة للإضافة");
      const { data, error } = await db.from(table).insert(rows).select();
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    onSuccess: (rows) => {
      invalidate(qc, table);
      toast.success(`تمت إضافة ${rows.length} موظف بنجاح`);
    },
    onError: (e: Error) => toast.error(`تعذر استيراد الموظفين: ${e.message}`),
  });
}

/** Atomically update a validated batch by its unique conflict key. */
export type BatchMutationMessages = {
  empty?: string;
  success?: (count: number) => string;
  error?: (message: string) => string;
};

export function useUpsertRows(
  table: HrTable,
  onConflict: string,
  messages?: BatchMutationMessages,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Row[]) => {
      if (rows.length === 0) {
        throw new Error(messages?.empty ?? "لا توجد بيانات صالحة للتحديث");
      }
      const { data, error } = await db.from(table).upsert(rows, { onConflict }).select();
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    onSuccess: (rows) => {
      invalidate(qc, table);
      toast.success(
        messages?.success?.(rows.length) ?? `تم تحديث بيانات ${rows.length} موظف بنجاح`,
      );
    },
    onError: (e: Error) =>
      toast.error(messages?.error?.(e.message) ?? `تعذر تحديث بيانات الموظفين: ${e.message}`),
  });
}

export type StaffBulkImportType =
  "facility" | "salaries" | "documents" | "entitlement" | "deduction" | "bank";

/** Apply a fully validated spreadsheet in one database transaction. */
export function useApplyStaffBulkImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ importType, rows }: { importType: StaffBulkImportType; rows: Row[] }) => {
      if (rows.length === 0) throw new Error("لا توجد بيانات صالحة للحفظ");
      const { data, error } = await db.rpc("apply_staff_bulk_import", {
        p_import_type: importType,
        p_rows: rows,
      });
      if (error) throw new Error(error.message);
      return data as { processed: number; import_type: StaffBulkImportType };
    },
    onSuccess: () => {
      for (const table of [
        "employees",
        "employee_documents",
        "employee_entitlements",
        "employee_deductions",
      ] satisfies HrTable[]) {
        invalidate(qc, table);
      }
    },
  });
}

export function useDeleteRow(table: HrTable) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from(table).delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      invalidate(qc, table);
      toast.success("تم حذف السجل");
    },
    onError: (e: Error) => toast.error(`تعذر الحذف: ${e.message}`),
  });
}

export const ar = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
export const money = (n: number) => `${new Intl.NumberFormat("en-US").format(Math.round(n))} ر.س`;

/* ============ إعدادات التهيئة العامة (app_settings) ============ */

export type SettingsMap = Record<string, string>;

export function useSettings(section: string) {
  return useQuery({
    queryKey: ["app_settings", section],
    queryFn: async (): Promise<SettingsMap> => {
      const { data, error } = await db.from("app_settings").select("*").eq("section", section);
      if (error) throw error;
      const map: SettingsMap = {};
      for (const r of (data ?? []) as Row[]) map[r["key"] as string] = (r["value"] ?? "") as string;
      return map;
    },
  });
}

export function useSaveSettings(section: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: SettingsMap) => {
      const rows = Object.entries(values).map(([key, value]) => ({ section, key, value }));
      const { error } = await db.from("app_settings").upsert(rows, { onConflict: "section,key" });
      if (error) throw error;
      return rows.length;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app_settings", section] });
      toast.success("تم حفظ الإعدادات بنجاح");
    },
    onError: (e: Error) => toast.error(`تعذر الحفظ: ${e.message}`),
  });
}

/* ============ Bulk facility data update (national_id -> labor_office_no) ============ */

export type FacilityUpdateInput = {
  IdNumber: string;
  workNumber: string;
};

export type FacilityUpdateOutcome = {
  IdNumber: string;
  workNumber: string;
  employeeName: string | null;
  empNo: string | null;
  status: "updated" | "not_found" | "error";
  message?: string;
};

export type FacilityUpdateResult = {
  updated: FacilityUpdateOutcome[];
  notFound: FacilityUpdateOutcome[];
  failed: FacilityUpdateOutcome[];
};

/**
 * Look up employees by national_id and return whether each row is matched
 * (used for the preview before running the actual update).
 */
export function useMatchFacilityRows() {
  return useMutation({
    mutationFn: async (rows: FacilityUpdateInput[]): Promise<FacilityUpdateOutcome[]> => {
      const ids = rows.map((r) => r.IdNumber).filter(Boolean);
      if (ids.length === 0) return [];
      const { data, error } = await db
        .from("employees")
        .select("id, national_id, full_name, emp_no, labor_office_no")
        .in("national_id", ids);
      if (error) throw error;
      const byId = new Map<string, Row>();
      for (const e of (data ?? []) as Row[]) {
        byId.set(String(e["national_id"]), e);
      }
      return rows.map((r) => {
        const emp = byId.get(r.IdNumber);
        return {
          IdNumber: r.IdNumber,
          workNumber: r.workNumber,
          employeeName: (emp?.["full_name"] as string) ?? null,
          empNo: (emp?.["emp_no"] as string) ?? null,
          status: emp ? "updated" : "not_found",
        } satisfies FacilityUpdateOutcome;
      });
    },
    onError: (e: Error) => toast.error(`تعذر مطابقة البيانات: ${e.message}`),
  });
}

/** Run the actual bulk update of labor_office_no for the matched IDs. */
export function useUpdateFacilityRows() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: FacilityUpdateInput[]): Promise<FacilityUpdateResult> => {
      const result: FacilityUpdateResult = { updated: [], notFound: [], failed: [] };
      // batch lookup first to avoid an update per non-existent id
      const ids = rows.map((r) => r.IdNumber);
      const { data: existing, error: lookupErr } = await db
        .from("employees")
        .select("id, national_id, full_name, emp_no")
        .in("national_id", ids);
      if (lookupErr) throw lookupErr;
      const byId = new Map<string, Row>();
      for (const e of (existing ?? []) as Row[]) {
        byId.set(String(e["national_id"]), e);
      }

      for (const r of rows) {
        const emp = byId.get(r.IdNumber);
        if (!emp) {
          result.notFound.push({
            IdNumber: r.IdNumber,
            workNumber: r.workNumber,
            employeeName: null,
            empNo: null,
            status: "not_found",
          });
          continue;
        }
        const { error: upErr } = await db
          .from("employees")
          .update({ labor_office_no: r.workNumber })
          .eq("id", emp["id"]);
        if (upErr) {
          result.failed.push({
            IdNumber: r.IdNumber,
            workNumber: r.workNumber,
            employeeName: (emp["full_name"] as string) ?? null,
            empNo: (emp["emp_no"] as string) ?? null,
            status: "error",
            message: upErr.message,
          });
        } else {
          result.updated.push({
            IdNumber: r.IdNumber,
            workNumber: r.workNumber,
            employeeName: (emp["full_name"] as string) ?? null,
            empNo: (emp["emp_no"] as string) ?? null,
            status: "updated",
          });
        }
      }
      return result;
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      const parts = [
        `تم تحديث ${res.updated.length} موظف`,
        res.notFound.length ? `لم يتم العثور على ${res.notFound.length}` : "",
        res.failed.length ? `فشل ${res.failed.length}` : "",
      ].filter(Boolean);
      if (res.updated.length > 0) toast.success(parts.join(" · "));
      else toast.error(parts.join(" · ") || "لم يتم تحديث أي صف");
    },
    onError: (e: Error) => toast.error(`تعذر تنفيذ التحديث: ${e.message}`),
  });
}
