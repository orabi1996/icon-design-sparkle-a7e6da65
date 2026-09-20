// Narrow DB client avoiding massive generated type overhead
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type ResolvedRecipient = {
  email: string | null;
  name: string | null;
  empNo: string | null;
  role?: string;
};

/**
 * Resolve the email and profile information of an employee.
 */
export async function resolveEmployeeEmail(
  db: Db,
  employeeId?: string,
  empNo?: string
): Promise<ResolvedRecipient> {
  if (!employeeId && !empNo) {
    return { email: null, name: null, empNo: null };
  }

  try {
    let q = db.from("employees").select("id, emp_no, full_name, email, private_email, manager_name, department, branch");
    if (employeeId) {
      q = q.eq("id", employeeId);
    } else if (empNo) {
      q = q.eq("emp_no", empNo);
    }
    const { data: emp } = await q.maybeSingle();

    if (emp) {
      const email = emp.email?.trim() || emp.private_email?.trim() || null;
      return {
        email,
        name: emp.full_name || null,
        empNo: emp.emp_no || null,
      };
    }

    // Fallback to profiles table if not in employees
    let pq = db.from("profiles").select("id, full_name, email, emp_no");
    if (empNo) {
      pq = pq.eq("emp_no", empNo);
    }
    const { data: profile } = await pq.maybeSingle();
    if (profile) {
      return {
        email: profile.email?.trim() || null,
        name: profile.full_name || null,
        empNo: profile.emp_no || null,
      };
    }
  } catch (error) {
    console.error("[RecipientResolver] Error resolving employee email:", error);
  }

  return { email: null, name: null, empNo: empNo || null };
}

/**
 * Resolve the approver(s) for a given stage in an approval workflow.
 */
export async function resolveApproverEmails(
  db: Db,
  options: {
    stage: string;
    employeeId?: string | undefined;
    directManagerName?: string | undefined;
    awaitingApproverName?: string | undefined;
    approverEmail?: string | undefined;
    department?: string | undefined;
    branch?: string | undefined;
  }
): Promise<ResolvedRecipient[]> {
  // If an explicit email was provided, return it immediately
  if (options.approverEmail?.trim()) {
    return [
      {
        email: options.approverEmail.trim(),
        name: options.awaitingApproverName || options.stage,
        empNo: null,
        role: options.stage,
      },
    ];
  }

  const stageLower = options.stage.toLowerCase();
  const results: ResolvedRecipient[] = [];

  try {
    // Case 1: Direct Manager (المدير المباشر)
    if (
      stageLower.includes("مدير مباشر") ||
      stageLower.includes("المدير المباشر") ||
      stageLower.includes("direct manager")
    ) {
      let managerName = options.directManagerName;
      if (!managerName && options.employeeId) {
        const { data: emp } = await db
          .from("employees")
          .select("manager_name, department_id, department")
          .eq("id", options.employeeId)
          .maybeSingle();
        managerName = emp?.manager_name;

        // Prefer authoritative department manager relation if available
        if (emp?.department_id) {
          const { data: dept } = await db
            .from("departments")
            .select("manager_id")
            .eq("id", emp.department_id)
            .maybeSingle();
          if (dept?.manager_id) {
            const { data: manager } = await db
              .from("employees")
              .select("id, full_name, emp_no, email, private_email")
              .eq("id", dept.manager_id)
              .maybeSingle();
            if (manager) {
              const email = manager.email?.trim() || manager.private_email?.trim() || null;
              return [
                {
                  email,
                  name: manager.full_name,
                  empNo: manager.emp_no,
                  role: "المدير المباشر",
                },
              ];
            }
          }
        }
      }

      if (managerName) {
        const { data: manager } = await db
          .from("employees")
          .select("id, full_name, emp_no, email, private_email")
          .ilike("full_name", `%${managerName.trim()}%`)
          .limit(1)
          .maybeSingle();

        if (manager) {
          const email = manager.email?.trim() || manager.private_email?.trim() || null;
          return [
            {
              email,
              name: manager.full_name,
              empNo: manager.emp_no,
              role: "المدير المباشر",
            },
          ];
        }
      }
    }

    // Case 2: Named Approver (اسم محدد)
    if (options.awaitingApproverName?.trim()) {
      const { data: approver } = await db
        .from("employees")
        .select("id, full_name, emp_no, email, private_email")
        .ilike("full_name", `%${options.awaitingApproverName.trim()}%`)
        .limit(1)
        .maybeSingle();

      if (approver) {
        const email = approver.email?.trim() || approver.private_email?.trim() || null;
        return [
          {
            email,
            name: approver.full_name,
            empNo: approver.emp_no,
            role: options.stage,
          },
        ];
      }
    }

    // Case 3: Department / Role based (e.g. الموارد البشرية HR, المالية Finance, المدير العام Executive)
    let deptPattern = "";
    if (stageLower.includes("موارد") || stageLower.includes("hr")) {
      deptPattern = "موارد بشرية";
    } else if (stageLower.includes("مالي") || stageLower.includes("finance")) {
      deptPattern = "المالية";
    } else if (stageLower.includes("تنفيذي") || stageLower.includes("عام") || stageLower.includes("إدارة")) {
      deptPattern = "الإدارة العامة";
    }

    if (deptPattern) {
      const { data: staff } = await db
        .from("employees")
        .select("id, full_name, emp_no, email, private_email")
        .ilike("department", `%${deptPattern}%`)
        .not("email", "is", null)
        .limit(3);

      for (const s of staff ?? []) {
        const email = s.email?.trim() || s.private_email?.trim() || null;
        if (email) {
          results.push({
            email,
            name: s.full_name,
            empNo: s.emp_no,
            role: options.stage,
          });
        }
      }
    }
  } catch (error) {
    console.error("[RecipientResolver] Error resolving approver emails:", error);
  }

  return results;
}
