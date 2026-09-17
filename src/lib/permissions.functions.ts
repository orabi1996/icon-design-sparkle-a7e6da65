import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission, logSecurityAudit } from "@/lib/server/authorization";

export type SystemUserRole = "admin" | "manager" | "employee";

export type SystemUser = {
  id: string;
  fullName: string;
  email: string;
  accountType: string;
  empNo: string;
  nationalId: string;
  role: SystemUserRole;
  isActive: boolean;
  createdAt: string;
  lastSignInAt: string | null;
};

const userSchema = z.object({
  id: z.string().uuid().optional(),
  fullName: z.string().trim().min(2, "اسم المستخدم مطلوب"),
  email: z.string().trim().email("البريد الإلكتروني غير صحيح"),
  password: z.string().min(8, "كلمة المرور يجب ألا تقل عن 8 أحرف").optional().or(z.literal("")),
  accountType: z.string().trim().min(1, "نوع المستخدم مطلوب"),
  empNo: z.string().trim().optional().default(""),
  nationalId: z.string().trim().optional().default(""),
  role: z.enum(["admin", "manager", "employee"]),
  isActive: z.boolean().default(true),
});

type UserPayload = z.infer<typeof userSchema>;

export const listSystemUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SystemUser[]> => {
    await requirePermission(context, "/permissions", "read");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;

    const [
      { data: authData, error: authError },
      { data: profiles, error: profilesError },
      rolesResult,
    ] = await Promise.all([
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      db.from("profiles").select("*"),
      db.from("user_roles").select("user_id, role"),
    ]);

    if (authError) throw new Error(authError.message);
    if (profilesError) throw new Error(profilesError.message);
    if (rolesResult.error) throw new Error(rolesResult.error.message);

    const profileById = new Map<string, Record<string, unknown>>(
      (profiles ?? []).map((profile: Record<string, unknown>) => [String(profile["id"]), profile]),
    );
    const rolesByUser = new Map<string, SystemUserRole[]>();
    for (const row of rolesResult.data ?? []) {
      const userId = String(row.user_id);
      const current = rolesByUser.get(userId) ?? [];
      current.push(row.role as SystemUserRole);
      rolesByUser.set(userId, current);
    }

    const rolePriority: SystemUserRole[] = ["admin", "manager", "employee"];
    return authData.users.map((user) => {
      const profile = profileById.get(user.id) ?? {};
      const userRoles = rolesByUser.get(user.id) ?? [];
      const role = rolePriority.find((candidate) => userRoles.includes(candidate)) ?? "employee";
      const banned = Boolean(
        user.banned_until && new Date(user.banned_until).getTime() > new Date().getTime(),
      );

      return {
        id: user.id,
        fullName: String(profile["full_name"] ?? user.user_metadata?.["full_name"] ?? ""),
        email: user.email ?? String(profile["email"] ?? ""),
        accountType: String(profile["account_type"] ?? "إداري"),
        empNo: String(profile["emp_no"] ?? ""),
        nationalId: String(profile["national_id"] ?? ""),
        role,
        isActive: profile["is_active"] !== false && !banned,
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at ?? null,
      };
    });
  });

export const saveSystemUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => userSchema.parse(input))
  .handler(async ({ data, context }): Promise<SystemUser> => {
    const actor = await requirePermission(context, "/permissions", "update");
    const payload = data as UserPayload;
    if (!payload.id && !payload.password) {
      throw new Error("كلمة المرور مطلوبة عند إضافة مستخدم جديد");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    let userId = payload.id;
    let created = false;

    if (userId && (payload.role !== "admin" || !payload.isActive)) {
      const [{ data: targetAdmin, error: targetAdminError }, adminCountResult] = await Promise.all([
        db.from("user_roles").select("id").eq("user_id", userId).eq("role", "admin").maybeSingle(),
        db.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "admin"),
      ]);
      if (targetAdminError) throw new Error(targetAdminError.message);
      if (adminCountResult.error) throw new Error(adminCountResult.error.message);
      if (targetAdmin && Number(adminCountResult.count ?? 0) <= 1) {
        throw new Error("لا يمكن إيقاف أو تغيير دور آخر مدير للنظام");
      }
    }

    if (userId) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        email: payload.email,
        ...(payload.password ? { password: payload.password } : {}),
        ban_duration: payload.isActive ? "none" : "876000h",
        user_metadata: {
          full_name: payload.fullName,
          account_type: payload.accountType,
          emp_no: payload.empNo,
          national_id: payload.nationalId,
        },
      });
      if (error) throw new Error(error.message);
    } else {
      const { data: createdUser, error } = await supabaseAdmin.auth.admin.createUser({
        email: payload.email,
        password: payload.password!,
        email_confirm: true,
        ban_duration: payload.isActive ? "none" : "876000h",
        user_metadata: {
          full_name: payload.fullName,
          account_type: payload.accountType,
          emp_no: payload.empNo,
          national_id: payload.nationalId,
        },
      });
      if (error || !createdUser.user) throw new Error(error?.message ?? "تعذر إنشاء المستخدم");
      userId = createdUser.user.id;
      created = true;
    }

    try {
      const { error: profileError } = await db.from("profiles").upsert(
        {
          id: userId,
          full_name: payload.fullName,
          email: payload.email,
          account_type: payload.accountType,
          emp_no: payload.empNo || null,
          national_id: payload.nationalId || null,
          is_active: payload.isActive,
        },
        { onConflict: "id" },
      );
      if (profileError) throw new Error(profileError.message);

      const { error: deleteRoleError } = await db.from("user_roles").delete().eq("user_id", userId);
      if (deleteRoleError) throw new Error(deleteRoleError.message);

      const { error: roleError } = await db
        .from("user_roles")
        .insert({ user_id: userId, role: payload.role });
      if (roleError) throw new Error(roleError.message);

      const { data: systemGroups, error: groupsError } = await db
        .from("permission_groups")
        .select("id, name")
        .eq("is_system", true);
      if (groupsError) throw new Error(groupsError.message);

      const systemGroupIds = (systemGroups ?? []).map((group: { id: string }) => group.id);
      if (systemGroupIds.length) {
        const { error: membershipDeleteError } = await db
          .from("permission_group_members")
          .delete()
          .eq("user_id", userId)
          .in("group_id", systemGroupIds);
        if (membershipDeleteError) throw new Error(membershipDeleteError.message);
      }

      const groupName =
        payload.role === "admin" ? "Admin" : payload.role === "manager" ? "Manager" : "User";
      const roleGroup = (systemGroups ?? []).find(
        (group: { name: string }) => group.name === groupName,
      );
      if (roleGroup) {
        const { error: membershipError } = await db
          .from("permission_group_members")
          .upsert({ group_id: roleGroup.id, user_id: userId }, { onConflict: "group_id,user_id" });
        if (membershipError) throw new Error(membershipError.message);
      }

      // Security Audit Logging
      if (created) {
        await logSecurityAudit(db, {
          eventType: "user_created",
          status: "success",
          userId: actor.userId,
          actorEmail: actor.email,
          resource: "user",
          action: "create",
          details: { targetUserId: userId, targetEmail: payload.email, role: payload.role },
        });
      }

      await logSecurityAudit(db, {
        eventType: "role_changed",
        status: "success",
        userId: actor.userId,
        actorEmail: actor.email,
        resource: "user_role",
        action: "update",
        details: { targetUserId: userId, newRole: payload.role },
      });

      if (!payload.isActive) {
        await logSecurityAudit(db, {
          eventType: "account_disabled",
          status: "success",
          userId: actor.userId,
          actorEmail: actor.email,
          resource: "user",
          action: "update",
          details: { targetUserId: userId, targetEmail: payload.email },
        });
      }

      await logSecurityAudit(db, {
        eventType: "group_changed",
        status: "success",
        userId: actor.userId,
        actorEmail: actor.email,
        resource: "permission_group",
        action: "update",
        details: { targetUserId: userId, assignedGroup: groupName },
      });
    } catch (error) {
      if (created && userId) await supabaseAdmin.auth.admin.deleteUser(userId);
      throw error;
    }

    return {
      id: userId!,
      fullName: payload.fullName,
      email: payload.email,
      accountType: payload.accountType,
      empNo: payload.empNo,
      nationalId: payload.nationalId,
      role: payload.role,
      isActive: payload.isActive,
      createdAt: new Date().toISOString(),
      lastSignInAt: null,
    };
  });
