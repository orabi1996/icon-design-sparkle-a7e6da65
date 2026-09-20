import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "@/lib/server/authorization";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function getAdminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as Db;
}

/**
 * 1. Paged Attendance Records (Selective projection & keyset/offset pagination)
 */
export const getPagedAttendanceRecordsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        companyId: z.string().uuid(),
        workDate: z.string().optional(),
        employeeId: z.string().uuid().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(500).default(50),
        cursor: z.string().optional(),
      })
      .parse(input);
  })
  .handler(async ({ context, data }) => {
    await requirePermission(context, "attendance_records", "read");
    const db = await getAdminDb();

    let query = db
      .from("m08_attendance_daily")
      .select("id, company_id, employee_id, emp_no, work_date, first_punch_in, last_punch_out, work_minutes, delay_minutes, overtime_minutes, status, stage")
      .eq("company_id", data.companyId)
      .order("work_date", { ascending: false });

    if (data.workDate) {
      query = query.eq("work_date", data.workDate);
    }
    if (data.employeeId) {
      query = query.eq("employee_id", data.employeeId);
    }

    if (data.cursor) {
      query = query.lt("id", data.cursor).limit(data.pageSize);
    } else {
      const from = (data.page - 1) * data.pageSize;
      query = query.range(from, from + data.pageSize - 1);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(`فشل استرجاع سجلات الحضور: ${error.message}`);
    return rows ?? [];
  });

/**
 * 2. Paged Raw Punches (High throughput device events)
 */
export const getPagedRawPunchesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        companyId: z.string().uuid(),
        deviceId: z.string().optional(),
        biometricUserId: z.string().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(500).default(50),
        cursor: z.string().optional(),
      })
      .parse(input);
  })
  .handler(async ({ context, data }) => {
    await requirePermission(context, "attendance_records", "read");
    const db = await getAdminDb();

    let query = db
      .from("m08_raw_punches")
      .select("id, company_id, device_id, biometric_user_id, employee_id, punch_time, punch_state, match_status")
      .eq("company_id", data.companyId)
      .order("punch_time", { ascending: false });

    if (data.deviceId) query = query.eq("device_id", data.deviceId);
    if (data.biometricUserId) query = query.eq("biometric_user_id", data.biometricUserId);

    if (data.cursor) {
      query = query.lt("punch_time", data.cursor).limit(data.pageSize);
    } else {
      const from = (data.page - 1) * data.pageSize;
      query = query.range(from, from + data.pageSize - 1);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(`فشل استرجاع بصمات الأجهزة: ${error.message}`);
    return rows ?? [];
  });

/**
 * 3. Paged Leave History
 */
export const getPagedLeaveHistoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        companyId: z.string().uuid(),
        employeeId: z.string().uuid().optional(),
        status: z.string().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(500).default(50),
        cursor: z.string().optional(),
      })
      .parse(input);
  })
  .handler(async ({ context, data }) => {
    await requirePermission(context, "leave_requests", "read");
    const db = await getAdminDb();

    let query = db
      .from("leave_requests")
      .select("id, company_id, employee_id, leave_type_id, start_date, end_date, days_count, status, created_at")
      .eq("company_id", data.companyId)
      .order("start_date", { ascending: false });

    if (data.employeeId) query = query.eq("employee_id", data.employeeId);
    if (data.status) query = query.eq("status", data.status);

    if (data.cursor) {
      query = query.lt("start_date", data.cursor).limit(data.pageSize);
    } else {
      const from = (data.page - 1) * data.pageSize;
      query = query.range(from, from + data.pageSize - 1);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(`فشل استرجاع سجل الإجازات: ${error.message}`);
    return rows ?? [];
  });

/**
 * 4. Paged Security Audit Logs
 */
export const getPagedAuditLogsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        tenantId: z.string().uuid(),
        eventType: z.string().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(500).default(50),
        cursor: z.string().optional(),
      })
      .parse(input);
  })
  .handler(async ({ context, data }) => {
    await requirePermission(context, "permissions", "read");
    const db = await getAdminDb();

    let query = db
      .from("security_audit_logs")
      .select("id, tenant_id, user_id, actor_email, event_type, status, resource, action, ip_address, created_at")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false });

    if (data.eventType) query = query.eq("event_type", data.eventType);

    if (data.cursor) {
      query = query.lt("created_at", data.cursor).limit(data.pageSize);
    } else {
      const from = (data.page - 1) * data.pageSize;
      query = query.range(from, from + data.pageSize - 1);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(`فشل استرجاع سجلات التدقيق: ${error.message}`);
    return rows ?? [];
  });

/**
 * 5. Paged Email Notification Logs
 */
export const getPagedEmailLogsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    return z
      .object({
        tenantId: z.string().uuid(),
        status: z.string().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(500).default(50),
        cursor: z.string().optional(),
      })
      .parse(input);
  })
  .handler(async ({ context, data }) => {
    await requirePermission(context, "permissions", "read");
    const db = await getAdminDb();

    let query = db
      .from("wf_outbox_events")
      .select("id, tenant_id, status, template_key, recipient_email, retry_count, scheduled_at, processed_at, created_at")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false });

    if (data.status) query = query.eq("status", data.status);

    if (data.cursor) {
      query = query.lt("created_at", data.cursor).limit(data.pageSize);
    } else {
      const from = (data.page - 1) * data.pageSize;
      query = query.range(from, from + data.pageSize - 1);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(`فشل استرجاع سجلات البريد: ${error.message}`);
    return rows ?? [];
  });
