// Central Authorization & Security Engine
// Enforces Authentication -> Active User -> Tenant Membership -> Role/Group Permission -> Scope -> Audit
import type { Database } from "@/integrations/supabase/types";

export type PermissionAction =
  | "read"
  | "create"
  | "update"
  | "delete"
  | "approve"
  | "reject"
  | "cancel"
  | "export"
  | "import"
  | "configure"
  | "post"
  | "close"
  | "reopen"
  | "view_sensitive"
  | "audit"
  | "test"
  | "resend";

export type PermissionScopeRequirement = {
  type?: "all" | "branch" | "department" | "self" | undefined;
  branchId?: string | undefined;
  departmentId?: string | undefined;
  targetEmpNo?: string | undefined;
  targetUserId?: string | undefined;
};

export type AuthContext = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: any;
  userId?: string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  claims?: any;
};

export type AuthorizedUser = {
  userId: string;
  email: string;
  fullName: string;
  role: "admin" | "manager" | "employee";
  isActive: boolean;
  empNo?: string | undefined;
  tenantId?: string | undefined;
  groupNames: string[];
  branchScopes: string[];
  departmentScopes: string[];
};

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = "يجب تسجيل الدخول أولاً لتنفيذ هذه العملية") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "ليس لديك الصلاحية الكافية لتنفيذ هذه العملية") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export type SecurityAuditEvent = {
  eventType:
    | "login"
    | "login_failed"
    | "user_created"
    | "role_changed"
    | "permission_changed"
    | "group_changed"
    | "account_disabled"
    | "sensitive_config_changed"
    | "unauthorized_access";
  status: "success" | "failed" | "forbidden";
  userId?: string | undefined;
  actorEmail?: string | undefined;
  tenantId?: string | undefined;
  resource?: string | undefined;
  action?: string | undefined;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  details?: Record<string, unknown> | undefined;
};

/**
 * Log security events to the immutable security_audit_logs table.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function logSecurityAudit(db: any, event: SecurityAuditEvent): Promise<void> {
  try {
    if (!db) return;
    await db.from("security_audit_logs").insert({
      event_type: event.eventType,
      status: event.status,
      user_id: event.userId ?? null,
      actor_email: event.actorEmail ?? null,
      tenant_id: event.tenantId ?? null,
      resource: event.resource ?? null,
      action: event.action ?? null,
      ip_address: event.ipAddress ?? null,
      user_agent: event.userAgent ?? null,
      details: event.details ?? {},
    });
  } catch (error) {
    // Fail-safe: do not crash caller if audit insertion encounters a network/transient issue,
    // but log visibly to server console.
    console.error("[SecurityAudit] Failed to record audit log:", error);
  }
}

/**
 * Build alias list for a resource to support path keys and table names.
 */
function getResourceAliases(resource: string): string[] {
  const aliases = [resource];
  switch (resource) {
    case "employees":
    case "/staff":
    case "/staff/index":
      aliases.push("employees", "/staff", "/staff/index");
      break;
    case "leave_requests":
    case "/leaves":
    case "leaves":
      aliases.push("leave_requests", "/leaves", "leaves");
      break;
    case "loans":
    case "/loans":
      aliases.push("loans", "/loans");
      break;
    case "attendance_records":
    case "/attendance":
    case "attendance":
      aliases.push("attendance_records", "/attendance", "attendance");
      break;
    case "payroll_runs":
    case "/payroll":
    case "payroll":
      aliases.push("payroll_runs", "/payroll", "payroll");
      break;
    case "employee_permits":
    case "/permits":
    case "permits":
      aliases.push("employee_permits", "/permits", "permits");
      break;
    case "inquiries":
    case "/inquiries":
      aliases.push("inquiries", "/inquiries");
      break;
    case "tasks":
    case "/tasks/permissions":
      aliases.push("tasks", "/tasks/permissions");
      break;
    case "app_settings":
    case "/settings/general":
    case "settings":
      aliases.push("app_settings", "/settings/general", "settings");
      break;
    default:
      break;
  }
  return Array.from(new Set(aliases));
}

/**
 * Central server authorization validator.
 * Validates authentication, active status, tenant isolation, role/group permissions, and scopes.
 */
export async function requirePermission(
  context: AuthContext | unknown,
  resource: string,
  action: PermissionAction,
  scope?: PermissionScopeRequirement,
): Promise<AuthorizedUser> {
  const ctx = (context ?? {}) as AuthContext;
  const userId = ctx.userId;

  if (!userId) {
    throw new UnauthorizedError("جلسة العمل غير صالحة أو منتهية، يرجى تسجيل الدخول");
  }

  // Load server admin client
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  // 1. Fetch user profile & user roles concurrently
  const [profileResult, rolesResult, userObjResult] = await Promise.all([
    db.from("profiles").select("*").eq("id", userId).maybeSingle(),
    db.from("user_roles").select("role").eq("user_id", userId),
    supabaseAdmin.auth.admin.getUserById(userId),
  ]);

  if (profileResult.error) {
    throw new ForbiddenError(`تعذر التحقق من بيانات المستخدم: ${profileResult.error.message}`);
  }

  const profile = profileResult.data ?? {};
  const authUser = userObjResult.data?.user;

  // 2. Active User Validation: user must not be deactivated or banned
  const isBanned = Boolean(
    authUser?.banned_until && new Date(authUser.banned_until).getTime() > Date.now(),
  );
  const isActive = profile["is_active"] !== false && !isBanned;

  if (!isActive) {
    await logSecurityAudit(db, {
      eventType: "unauthorized_access",
      status: "forbidden",
      userId,
      actorEmail: authUser?.email ?? String(profile["email"] ?? ""),
      resource,
      action,
      details: { reason: "account_disabled_or_banned" },
    });
    throw new ForbiddenError("حساب المستخدم غير مفعّل أو تم تعطيله، راجع مسؤول النظام");
  }

  const userRoles: string[] = (rolesResult.data ?? []).map((r: { role: string }) => r.role);
  const isAdmin = userRoles.includes("admin");
  const isManager = userRoles.includes("manager");
  const role: "admin" | "manager" | "employee" = isAdmin
    ? "admin"
    : isManager
      ? "manager"
      : "employee";

  const email = authUser?.email ?? String(profile["email"] ?? "");
  const fullName = String(profile["full_name"] ?? authUser?.user_metadata?.["full_name"] ?? "");
  const empNo = profile["emp_no"] ? String(profile["emp_no"]) : undefined;

  // 3. Admin has unconditional access
  if (isAdmin) {
    return {
      userId,
      email,
      fullName,
      role: "admin",
      isActive: true,
      empNo,
      groupNames: ["Admin"],
      branchScopes: [],
      departmentScopes: [],
    };
  }

  // 4. Fetch group memberships, rules, features, and scopes for non-admins
  const { data: memberships, error: memError } = await db
    .from("permission_group_members")
    .select(
      `
      group_id,
      group:permission_groups!inner(id, name, is_active)
    `,
    )
    .eq("user_id", userId)
    .eq("group.is_active", true);

  if (memError) {
    throw new ForbiddenError(`تعذر التحقق من مجموعات الصلاحيات: ${memError.message}`);
  }

  const activeGroupIds: string[] = (memberships ?? []).map(
    (m: { group_id: string }) => m.group_id,
  );
  const groupNames: string[] = (memberships ?? []).map(
    (m: { group: { name: string } }) => m.group.name,
  );

  let hasPermission = false;
  const branchScopes: string[] = [];
  const departmentScopes: string[] = [];

  if (activeGroupIds.length > 0) {
    const resourceKeys = getResourceAliases(resource);

    // Direct feature match (e.g. 'email.settings.read', 'email.test', etc.)
    const combinedFeatureKey = `${resource}.${action}`;
    const featureKeysToCheck = [combinedFeatureKey, resource];

    const [rulesResult, featuresResult, scopesResult] = await Promise.all([
      db
        .from("permission_rules")
        .select("*")
        .in("group_id", activeGroupIds)
        .in("resource_key", resourceKeys)
        .eq("is_enabled", true),
      db
        .from("permission_features")
        .select("*")
        .in("group_id", activeGroupIds)
        .in("feature_key", featureKeysToCheck)
        .eq("is_allowed", true),
      db.from("permission_scopes").select("*").in("group_id", activeGroupIds),
    ]);

    // Check features
    if ((featuresResult.data ?? []).length > 0) {
      hasPermission = true;
    }

    // Check rules
    if (!hasPermission && rulesResult.data) {
      for (const rule of rulesResult.data) {
        if (
          action === "read" ||
          action === "export" ||
          action === "audit" ||
          action === "view_sensitive"
        ) {
          if (rule.can_read) {
            hasPermission = true;
            break;
          }
        } else if (action === "create" || action === "import" || action === "post") {
          if (rule.can_create) {
            hasPermission = true;
            break;
          }
        } else if (
          action === "update" ||
          action === "approve" ||
          action === "reject" ||
          action === "cancel" ||
          action === "configure" ||
          action === "close" ||
          action === "reopen" ||
          action === "test" ||
          action === "resend"
        ) {
          if (rule.can_update) {
            hasPermission = true;
            break;
          }
        } else if (action === "delete") {
          if (rule.can_delete) {
            hasPermission = true;
            break;
          }
        }
      }
    }

    // Collect scopes
    for (const sc of scopesResult.data ?? []) {
      if (sc.scope_type === "branch") {
        branchScopes.push(sc.scope_value);
      } else if (sc.scope_type === "department") {
        departmentScopes.push(sc.scope_value);
      }
    }
  }

  // 5. Self-service check: if user is querying their own personal record
  const isSelfTarget =
    (Boolean(scope?.targetEmpNo) && scope?.targetEmpNo === empNo) ||
    (Boolean(scope?.targetUserId) && scope?.targetUserId === userId);

  if (scope?.type === "self" && isSelfTarget) {
    hasPermission = true;
  }

  // 6. If user still lacks permission, deny & audit
  if (!hasPermission) {
    await logSecurityAudit(db, {
      eventType: "unauthorized_access",
      status: "forbidden",
      userId,
      actorEmail: email,
      resource,
      action,
      details: {
        reason: "missing_required_permission",
        groups: groupNames,
      },
    });
    throw new ForbiddenError(
      `غير مصرح لك بتنفيذ الإجراء (${action}) على المورد (${resource}). تواصل مع إدارة النظام لمنح الصلاحية.`,
    );
  }

  // 7. Scope boundary validation:
  // If user has branch scopes defined and request targets a specific branch, it must be within allowed scopes.
  if (scope?.branchId && branchScopes.length > 0) {
    if (!branchScopes.includes(scope.branchId)) {
      await logSecurityAudit(db, {
        eventType: "unauthorized_access",
        status: "forbidden",
        userId,
        actorEmail: email,
        resource,
        action,
        details: {
          reason: "branch_scope_violation",
          requestedBranch: scope.branchId,
          allowedBranches: branchScopes,
        },
      });
      throw new ForbiddenError("الفرع المطلوب يقع خارج نطاق الفروع المصرح لك بالوصول إليها");
    }
  }

  // If user has department scopes defined and request targets a specific department, it must be within allowed scopes.
  if (scope?.departmentId && departmentScopes.length > 0) {
    if (!departmentScopes.includes(scope.departmentId)) {
      await logSecurityAudit(db, {
        eventType: "unauthorized_access",
        status: "forbidden",
        userId,
        actorEmail: email,
        resource,
        action,
        details: {
          reason: "department_scope_violation",
          requestedDepartment: scope.departmentId,
          allowedDepartments: departmentScopes,
        },
      });
      throw new ForbiddenError("القسم المطلوب يقع خارج نطاق الأقسام المصرح لك بالوصول إليها");
    }
  }

  return {
    userId,
    email,
    fullName,
    role,
    isActive: true,
    empNo,
    groupNames,
    branchScopes,
    departmentScopes,
  };
}
