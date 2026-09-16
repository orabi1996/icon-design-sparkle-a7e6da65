import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Row } from "@/lib/hr-db";

// Legacy report adapter. This is not a tenant migration or a financial posting API.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const columns = {
  employees: "id,emp_no,full_name,branch,department,job_title",
  loans: "id,employee_id,employee_name,emp_no,branch,department,job_title,amount,approved_amount,paid_amount,monthly_amount,request_status,status",
};

export function useLoanReportRows(table: keyof typeof columns) {
  return useQuery<Row[]>({
    queryKey: [table, "complete-loan-report"],
    retry: false,
    queryFn: async ({ signal }) => {
      const result: Row[] = [];
      let expected: number | null = null;
      for (let from = 0; from < 100000; from += 500) {
        const { data, count, error } = await db.from(table)
          .select(columns[table], { count: "exact" })
          .order("id").range(from, from + 499).abortSignal(signal);
        if (error) throw new Error(error.message);
        if (expected !== null && count !== expected) throw new Error("تغيرت البيانات أثناء تحميل التقرير؛ أعد المحاولة.");
        expected = count;
        result.push(...(data ?? []));
        if (!data || data.length < 500) {
          if (expected !== null && result.length !== expected) throw new Error("لم تكتمل بيانات التقرير؛ أعد المحاولة.");
          return result;
        }
      }
      throw new Error("تجاوز التقرير 100000 سجل؛ يلزم تقرير خادمي مخصص بدل عرض إجماليات ناقصة.");
    },
  });
}
