const CATEGORIES = ["شؤون موظفين", "مالية", "إدارية", "عمليات"];
const STATUSES = ["نشط", "معطل"];
const DEFAULT_CHAIN = ["المدير المباشر", "الموارد البشرية"];

export const REQUEST_CATEGORIES = Object.freeze([...CATEGORIES]);
export const REQUEST_STATUSES = Object.freeze([...STATUSES]);

export const DEFAULT_REQUEST_TYPES = Object.freeze([
  {
    id: "req-1",
    code: "REQ-LV",
    name: "طلب إجازة اعتيادية / مرضية",
    category: "شؤون موظفين",
    approval_chain: ["المدير المباشر", "مسؤول الموارد البشرية"],
    max_sla_hours: 24,
    requires_attachment: false,
    allow_cancel: true,
    status: "نشط",
  },
  {
    id: "req-2",
    code: "REQ-LN",
    name: "طلب سلفة مالية على الراتب",
    category: "مالية",
    approval_chain: ["المدير المباشر", "الموارد البشرية", "المدير المالي"],
    max_sla_hours: 48,
    requires_attachment: false,
    allow_cancel: true,
    status: "نشط",
  },
  {
    id: "req-3",
    code: "REQ-PRM",
    name: "طلب إذن وخروج مؤقت أثناء الدوام",
    category: "عمليات",
    approval_chain: ["المدير المباشر"],
    max_sla_hours: 4,
    requires_attachment: false,
    allow_cancel: true,
    status: "نشط",
  },
  {
    id: "req-4",
    code: "REQ-LTR",
    name: "طلب خطاب تعريف بالراتب موجه لجهة رسمية",
    category: "إدارية",
    approval_chain: ["مسؤول الموارد البشرية"],
    max_sla_hours: 12,
    requires_attachment: false,
    allow_cancel: false,
    status: "نشط",
  },
  {
    id: "req-5",
    code: "REQ-EOS",
    name: "طلب تصفية نهاية الخدمة والاستقالة",
    category: "شؤون موظفين",
    approval_chain: ["المدير المباشر", "الموارد البشرية", "المدير المالي", "المدير العام"],
    max_sla_hours: 72,
    requires_attachment: true,
    allow_cancel: true,
    status: "نشط",
  },
]);

const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value, max) => {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized.length <= max ? normalized : normalized.slice(0, max);
};
const cloneDefaults = () => DEFAULT_REQUEST_TYPES.map((item) => ({ ...item, approval_chain: [...item.approval_chain] }));

export function validateRequestConfig(input) {
  if (!isRecord(input)) return { ok: false, errors: { form: "بيانات نوع الطلب غير صحيحة." } };

  const errors = {};
  const id = text(input.id, 80);
  const code = text(input.code, 32).toUpperCase();
  const name = text(input.name, 160);
  const category = text(input.category, 40);
  const status = text(input.status, 20);
  const chain = Array.isArray(input.approval_chain)
    ? input.approval_chain.map((step) => text(step, 120)).filter(Boolean)
    : [];
  const maxSla = typeof input.max_sla_hours === "number" ? input.max_sla_hours : Number(input.max_sla_hours);

  if (!id || !/^req-[a-z0-9-]+$/i.test(id)) errors.id = "معرّف نوع الطلب غير صحيح.";
  if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code)) errors.code = "كود الطلب يجب أن يكون من 3 إلى 32 حرفًا أو رقمًا.";
  if (name.length < 2) errors.name = "اسم الطلب مطلوب.";
  if (!CATEGORIES.includes(category)) errors.category = "تصنيف الطلب غير صحيح.";
  if (chain.length < 1 || chain.length > 8) errors.approval_chain = "أضف خطوة اعتماد واحدة إلى 8 خطوات.";
  if (chain.some((step) => step.length < 2)) errors.approval_chain = "كل خطوة اعتماد يجب أن تحتوي على اسم واضح.";
  if (!Number.isInteger(maxSla) || maxSla < 1 || maxSla > 720) errors.max_sla_hours = "زمن الاعتماد يجب أن يكون بين ساعة و720 ساعة.";
  if (typeof input.requires_attachment !== "boolean") errors.requires_attachment = "قيمة المرفقات غير صحيحة.";
  if (typeof input.allow_cancel !== "boolean") errors.allow_cancel = "قيمة الإلغاء غير صحيحة.";
  if (!STATUSES.includes(status)) errors.status = "حالة الطلب غير صحيحة.";

  const value = {
    id,
    code,
    name,
    category,
    approval_chain: [...new Set(chain)],
    max_sla_hours: maxSla,
    requires_attachment: input.requires_attachment === true,
    allow_cancel: input.allow_cancel === true,
    status,
  };
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, errors: {}, value };
}

export function parseRequestConfigs(raw) {
  if (typeof raw !== "string" || !raw.trim()) return { configs: cloneDefaults(), invalidCount: 0, source: "defaults" };

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { configs: cloneDefaults(), invalidCount: 1, source: "defaults" };

    const configs = [];
    const ids = new Set();
    const codes = new Set();
    let invalidCount = 0;

    for (const candidate of parsed) {
      const result = validateRequestConfig(candidate);
      const value = result.value;
      if (!result.ok || !value || ids.has(value.id) || codes.has(value.code)) {
        invalidCount += 1;
        continue;
      }
      ids.add(value.id);
      codes.add(value.code);
      configs.push(value);
    }

    return configs.length
      ? { configs, invalidCount, source: "saved" }
      : { configs: cloneDefaults(), invalidCount: Math.max(1, invalidCount), source: "defaults" };
  } catch {
    return { configs: cloneDefaults(), invalidCount: 1, source: "defaults" };
  }
}

export function serializeRequestConfigs(configs) {
  if (!Array.isArray(configs) || configs.length === 0) throw new Error("يجب الاحتفاظ بنوع طلب واحد على الأقل.");
  const normalized = [];
  const ids = new Set();
  const codes = new Set();

  for (const config of configs) {
    const result = validateRequestConfig(config);
    if (!result.ok || !result.value || ids.has(result.value.id) || codes.has(result.value.code)) {
      throw new Error("إعدادات أنواع الطلبات تحتوي على تكرار أو بيانات غير صحيحة.");
    }
    ids.add(result.value.id);
    codes.add(result.value.code);
    normalized.push(result.value);
  }
  return JSON.stringify(normalized);
}

export function splitApprovalChain(value) {
  if (typeof value !== "string") return [...DEFAULT_CHAIN];
  const steps = [...new Set(value.split(/[,،\n]+/).map((step) => step.trim()).filter(Boolean))];
  return steps.length ? steps : [...DEFAULT_CHAIN];
}
