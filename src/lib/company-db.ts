import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { validateCompanyProfile, type CompanyProfile } from "@/lib/business-core.mjs";

export const COMPANY_BUSINESS_ENABLED = import.meta.env["VITE_COMPANY_BUSINESS_ENABLED"] === "true";

// New additive tables intentionally do not require hand-editing generated Supabase types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type CompanyDirectoryEntry = {
  id: string; tenant_id: string; tenant_name: string; display_name: string;
  display_name_en: string; country_code: string; version: number; updated_at: string;
  can_manage: boolean;
};
export type CompanySnapshot = {
  id: string; tenant_id: string; profile: CompanyProfile; version: number;
  updated_at: string; updated_by: string;
};
export type CompanyVersion = {
  company_id: string; tenant_id: string; version: number; profile: CompanyProfile;
  effective_from: string; changed_by: string; change_reason: string; request_id: string;
};
export type SaveCompanyInput = {
  companyId: string; tenantId: string; profile: CompanyProfile; expectedVersion: number;
  reason: string; requestId: string; newTenantName?: string;
};

export function useCompanyDirectory(userId: string | null) {
  return useQuery<CompanyDirectoryEntry[]>({
    queryKey: ["company-directory", userId],
    enabled: COMPANY_BUSINESS_ENABLED && Boolean(userId),
    retry: false,
    queryFn: async ({ signal }) => {
      const rows: CompanyDirectoryEntry[] = [];
      for (let from = 0; from < 10000; from += 500) {
        const { data, error } = await db.from("hr_company_directory").select("*")
          .order("id").range(from, from + 499).abortSignal(signal);
        if (error) throw new Error("تعذر تحميل الشركات. تحقق من تطبيق ترحيل قاعدة البيانات وصلاحيات العضوية.");
        rows.push(...(data ?? []));
        if (!data || data.length < 500) return rows;
      }
      throw new Error("عدد الشركات يتطلب تحميلًا مقسمًا؛ لم يتم عرض قائمة ناقصة.");
    },
  });
}

export function useCompanyProfile(company: CompanyDirectoryEntry | null) {
  return useQuery<CompanySnapshot | null>({
    queryKey: ["company-profile", company?.tenant_id, company?.id],
    enabled: COMPANY_BUSINESS_ENABLED && Boolean(company?.can_manage),
    retry: false,
    queryFn: async ({ signal }) => {
      if (!company) return null;
      const { data, error } = await db.from("hr_company_profiles").select("*")
        .eq("tenant_id", company.tenant_id).eq("id", company.id).maybeSingle().abortSignal(signal);
      if (error) throw new Error(error.message);
      if (!data) throw new Error("لم يعد ملف الشركة متاحًا؛ حدّث قائمة الشركات وتحقق من صلاحياتك.");
      return data as CompanySnapshot;
    },
  });
}

export function useCompanyVersions(company: CompanyDirectoryEntry | null) {
  return useQuery<CompanyVersion[]>({
    queryKey: ["company-versions", company?.tenant_id, company?.id],
    enabled: COMPANY_BUSINESS_ENABLED && Boolean(company?.can_manage),
    retry: false,
    queryFn: async ({ signal }) => {
      if (!company) return [];
      const { data, error } = await db.from("hr_company_versions").select("*")
        .eq("tenant_id", company.tenant_id).eq("company_id", company.id)
        .order("version", { ascending: false }).limit(50).abortSignal(signal);
      if (error) throw new Error(error.message);
      return (data ?? []) as CompanyVersion[];
    },
  });
}

export function useSaveCompanyProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveCompanyInput): Promise<CompanySnapshot> => {
      if (!COMPANY_BUSINESS_ENABLED) throw new Error("تفعيل منطق الشركات غير مكتمل");
      const validated = validateCompanyProfile(input.profile);
      if (Object.keys(validated.errors).length) throw new Error(Object.values(validated.errors).join("، "));
      if (input.reason.trim().length < 3 || input.reason.trim().length > 500) {
        throw new Error("سبب التغيير مطلوب (3 إلى 500 حرف)");
      }
      const { data, error } = await db.rpc("save_hr_company_profile", {
        p_tenant_id: input.tenantId, p_company_id: input.companyId, p_profile: validated.profile,
        p_expected_version: input.expectedVersion, p_change_reason: input.reason.trim(),
        p_request_id: input.requestId, p_new_tenant_name: input.newTenantName ?? null,
      });
      if (error) throw new Error(error.message);
      if (!data || data.id !== input.companyId || data.tenant_id !== input.tenantId || !data.version) {
        throw new Error("لم يصل تأكيد الحفظ؛ أعد المحاولة بنفس البيانات للتحقق دون تكرار العملية.");
      }
      return data as CompanySnapshot;
    },
    onSuccess: async (snapshot) => {
      queryClient.setQueryData(["company-profile", snapshot.tenant_id, snapshot.id], snapshot);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["company-directory"] }),
        queryClient.invalidateQueries({ queryKey: ["company-versions", snapshot.tenant_id, snapshot.id] }),
        queryClient.invalidateQueries({ queryKey: ["company-profile", snapshot.tenant_id, snapshot.id] }),
      ]);
      toast.success("تم حفظ بيانات الشركة وتسجيل إصدار جديد بنجاح");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
