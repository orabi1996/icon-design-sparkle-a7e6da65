/**
 * Organization Domain - Pure Business Core & Hierarchy Logic
 * Enforces business code uniqueness, circular hierarchy detection,
 * effective dates, level constraints, and legacy text reconciliation.
 */

/**
 * Normalizes an Arabic string by stripping diacritics and unifying alef/hamza forms.
 */
export function normalizeArabic(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "") // Diacritics
    .replace(/[إأآا]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ");
}

/**
 * Validates a date string (YYYY-MM-DD).
 */
export function isValidDateString(val) {
  if (!val || typeof val !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return false;
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === val;
}

/**
 * Detects if assigning newParentId to targetId creates a cycle in the hierarchy.
 * @param {Array<{ id: string, parent_id?: string | null }>} items
 * @param {string} targetId
 * @param {string | null | undefined} newParentId
 * @returns {boolean} true if a cycle is detected, false otherwise.
 */
export function detectCircularHierarchy(items, targetId, newParentId) {
  if (!targetId || !newParentId) return false;
  if (targetId === newParentId) return true;

  const parentMap = new Map();
  for (const item of items) {
    if (item.id && item.parent_id) {
      parentMap.set(item.id, item.parent_id);
    }
  }

  let current = newParentId;
  const visited = new Set([targetId]);

  while (current) {
    if (visited.has(current)) {
      return true; // Cycle reached
    }
    visited.add(current);
    current = parentMap.get(current);
  }

  return false;
}

/**
 * Validates a Branch entity.
 */
export function validateBranch(branch, existingBranches = []) {
  const errors = {};
  const code = (branch.code || "").trim();
  const nameAr = (branch.name_ar || "").trim();
  const nameEn = (branch.name_en || "").trim();

  if (!code) {
    errors.code = "رمز الفرع مطلوب";
  } else if (code.length > 50) {
    errors.code = "رمز الفرع يجب ألا يتجاوز 50 حرفًا";
  } else {
    const dup = existingBranches.find(
      (b) => b.id !== branch.id && b.code.trim().toLowerCase() === code.toLowerCase()
    );
    if (dup) {
      errors.code = `رمز الفرع "${code}" مستخدم بالفعل`;
    }
  }

  if (!nameAr) {
    errors.name_ar = "اسم الفرع بالعربية مطلوب";
  } else if (nameAr.length > 200) {
    errors.name_ar = "اسم الفرع يجب ألا يتجاوز 200 حرف";
  }

  if (branch.effective_from && !isValidDateString(branch.effective_from)) {
    errors.effective_from = "تاريخ السريان غير صحيح (YYYY-MM-DD)";
  }

  if (branch.effective_to) {
    if (!isValidDateString(branch.effective_to)) {
      errors.effective_to = "تاريخ الانتهاء غير صحيح (YYYY-MM-DD)";
    } else if (
      branch.effective_from &&
      isValidDateString(branch.effective_from) &&
      branch.effective_to < branch.effective_from
    ) {
      errors.effective_to = "تاريخ الانتهاء يجب أن يكون لاحقاً لتاريخ السريان";
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    normalized: {
      code,
      name_ar: nameAr,
      name_en: nameEn || null,
      active: branch.active !== false,
      effective_from: branch.effective_from || new Date().toISOString().slice(0, 10),
      effective_to: branch.effective_to || null,
    },
  };
}

/**
 * Validates a Department entity and verifies parent-child hierarchy levels and cycle prevention.
 */
export function validateDepartment(dept, existingDepartments = []) {
  const errors = {};
  const code = (dept.code || "").trim();
  const nameAr = (dept.name_ar || "").trim();
  const nameEn = (dept.name_en || "").trim();
  const validLevels = ["main_department", "department", "section", "team"];
  const level = dept.level || "department";

  if (!code) {
    errors.code = "رمز القسم مطلوب";
  } else if (code.length > 50) {
    errors.code = "رمز القسم يجب ألا يتجاوز 50 حرفًا";
  } else {
    const dup = existingDepartments.find(
      (d) => d.id !== dept.id && d.code.trim().toLowerCase() === code.toLowerCase()
    );
    if (dup) {
      errors.code = `رمز القسم "${code}" مستخدم بالفعل`;
    }
  }

  if (!nameAr) {
    errors.name_ar = "اسم القسم بالعربية مطلوب";
  } else if (nameAr.length > 200) {
    errors.name_ar = "اسم القسم يجب ألا يتجاوز 200 حرف";
  }

  if (!validLevels.includes(level)) {
    errors.level = "مستوى الهيكل التنظيمي غير صالح";
  }

  if (dept.parent_id) {
    if (dept.id && detectCircularHierarchy(existingDepartments, dept.id, dept.parent_id)) {
      errors.parent_id = "تم اكتشاف تبعية دائرية غير صالحة في الهيكل التنظيمي للأقسام";
    }

    const parent = existingDepartments.find((d) => d.id === dept.parent_id);
    if (parent && parent.level) {
      const levelRank = {
        main_department: 1,
        department: 2,
        section: 3,
        team: 4,
      };
      const parentRank = levelRank[parent.level] || 2;
      const childRank = levelRank[level] || 2;
      if (childRank < parentRank) {
        errors.level = `لا يمكن للإدارة/الوحدة من مستوى "${level}" أن تتبع وحدة أدنى في الهيكل التنظيمي ("${parent.level}")`;
      }
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    normalized: {
      code,
      name_ar: nameAr,
      name_en: nameEn || null,
      level,
      active: dept.active !== false,
      parent_id: dept.parent_id || null,
      branch_id: dept.branch_id || null,
      sector_id: dept.sector_id || null,
      cost_center_id: dept.cost_center_id || null,
      manager_id: dept.manager_id || null,
      effective_from: dept.effective_from || new Date().toISOString().slice(0, 10),
      effective_to: dept.effective_to || null,
    },
  };
}

/**
 * Validates a Cost Center entity.
 */
export function validateCostCenter(center, existingCenters = []) {
  const errors = {};
  const code = (center.code || "").trim();
  const nameAr = (center.name_ar || "").trim();

  if (!code) {
    errors.code = "رمز مركز التكلفة مطلوب";
  } else {
    const dup = existingCenters.find(
      (c) => c.id !== center.id && c.code.trim().toLowerCase() === code.toLowerCase()
    );
    if (dup) errors.code = `رمز مركز التكلفة "${code}" مستخدم بالفعل`;
  }

  if (!nameAr) {
    errors.name_ar = "اسم مركز التكلفة بالعربية مطلوب";
  }

  if (center.parent_id && center.id && detectCircularHierarchy(existingCenters, center.id, center.parent_id)) {
    errors.parent_id = "تم اكتشاف تبعية دائرية في مراكز التكلفة";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    normalized: {
      code,
      name_ar: nameAr,
      name_en: (center.name_en || "").trim() || null,
      parent_id: center.parent_id || null,
      active: center.active !== false,
    },
  };
}

/**
 * Validates a Job entity.
 */
export function validateJob(job, existingJobs = []) {
  const errors = {};
  const code = (job.code || "").trim();
  const titleAr = (job.title_ar || "").trim();

  if (!code) errors.code = "رمز الوظيفة مطلوب";
  else {
    const dup = existingJobs.find(
      (j) => j.id !== job.id && j.code.trim().toLowerCase() === code.toLowerCase()
    );
    if (dup) errors.code = `رمز الوظيفة "${code}" مستخدم بالفعل`;
  }

  if (!titleAr) errors.title_ar = "المسمى الوظيفي بالعربية مطلوب";

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    normalized: {
      code,
      title_ar: titleAr,
      title_en: (job.title_en || "").trim() || null,
      level_id: job.level_id || null,
      description: job.description || null,
      requirements: job.requirements || null,
      active: job.active !== false,
    },
  };
}

/**
 * Validates a Position entity.
 */
export function validatePosition(pos, existingPositions = []) {
  const errors = {};
  const code = (pos.position_code || "").trim();
  const titleAr = (pos.title_ar || "").trim();

  if (!code) errors.position_code = "رمز المنصب مطلوب";
  else {
    const dup = existingPositions.find(
      (p) => p.id !== pos.id && p.position_code.trim().toLowerCase() === code.toLowerCase()
    );
    if (dup) errors.position_code = `رمز المنصب "${code}" مستخدم بالفعل`;
  }

  if (!titleAr) errors.title_ar = "مسمى المنصب مطلوب";
  if (!pos.job_id) errors.job_id = "الوظيفة المرتبطة مطلوبة";
  if (!pos.department_id) errors.department_id = "القسم التابع له المنصب مطلوب";

  if (pos.max_headcount !== undefined && (Number.isNaN(Number(pos.max_headcount)) || Number(pos.max_headcount) < 1)) {
    errors.max_headcount = "الحد الأقصى للشاغلين يجب أن يكون أكبر من أو يساوي 1";
  }

  if (pos.reports_to_position_id && pos.id) {
    if (detectCircularHierarchy(existingPositions, pos.id, pos.reports_to_position_id)) {
      errors.reports_to_position_id = "تم اكتشاف تبعية دائرية في تسلسل المسؤوليات";
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    normalized: {
      position_code: code,
      title_ar: titleAr,
      title_en: (pos.title_en || "").trim() || null,
      job_id: pos.job_id,
      department_id: pos.department_id,
      branch_id: pos.branch_id || null,
      reports_to_position_id: pos.reports_to_position_id || null,
      is_vacant: pos.is_vacant !== false,
      max_headcount: Number(pos.max_headcount) || 1,
      active: pos.active !== false,
    },
  };
}

/**
 * Reconciles legacy text values (e.g. from employees table) with authoritative organization entities.
 * Generates a reconciliation report: matched, ambiguous, and unmatched.
 *
 * @param {Array<{ id: string, text: string }>} legacyItems
 * @param {Array<{ id: string, code: string, name_ar: string, name_en?: string }>} authoritativeEntities
 * @returns {{
 *   matched: Array<{ legacyId: string, text: string, entityId: string, entityName: string }>,
 *   ambiguous: Array<{ legacyId: string, text: string, candidateIds: string[], candidateNames: string[] }>,
 *   unmatched: Array<{ legacyId: string, text: string }>,
 *   summary: { total: number, matchedCount: number, ambiguousCount: number, unmatchedCount: number }
 * }}
 */
export function reconcileLegacyEntities(legacyItems, authoritativeEntities) {
  const matched = [];
  const ambiguous = [];
  const unmatched = [];

  for (const item of legacyItems) {
    const rawText = (item.text || "").trim();
    if (!rawText) continue;

    const normText = normalizeArabic(rawText);
    const cleanNormText = normText.replace(/^(اداره|قسم|شعبه|فريق|فرع|شركه)\s+/, "");

    // Find candidates by exact match, normalized match, code match, or prefix-stripped match
    const candidates = authoritativeEntities.filter((entity) => {
      if (entity.code && entity.code.trim().toLowerCase() === rawText.toLowerCase()) {
        return true;
      }
      if (entity.name_ar && entity.name_ar.trim() === rawText) {
        return true;
      }
      const entityNorm = normalizeArabic(entity.name_ar);
      if (entityNorm === normText) {
        return true;
      }
      const cleanEntityNorm = entityNorm.replace(/^(اداره|قسم|شعبه|فريق|فرع|شركه)\s+/, "");
      if (
        cleanEntityNorm === cleanNormText ||
        cleanEntityNorm === normText ||
        entityNorm === cleanNormText
      ) {
        return true;
      }
      if (entity.name_en && entity.name_en.trim().toLowerCase() === rawText.toLowerCase()) {
        return true;
      }
      return false;
    });

    if (candidates.length === 1) {
      matched.push({
        legacyId: item.id,
        text: rawText,
        entityId: candidates[0].id,
        entityName: candidates[0].name_ar,
      });
    } else if (candidates.length > 1) {
      ambiguous.push({
        legacyId: item.id,
        text: rawText,
        candidateIds: candidates.map((c) => c.id),
        candidateNames: candidates.map((c) => c.name_ar),
      });
    } else {
      unmatched.push({
        legacyId: item.id,
        text: rawText,
      });
    }
  }

  return {
    matched,
    ambiguous,
    unmatched,
    summary: {
      total: legacyItems.length,
      matchedCount: matched.length,
      ambiguousCount: ambiguous.length,
      unmatchedCount: unmatched.length,
    },
  };
}
