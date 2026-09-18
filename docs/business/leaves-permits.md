# PROMPT 5 — نطاق الإجازات والأرصدة والاستئذانات

## 1. نظرة عامة

تُقدِّم هذه الوحدة نظامًا للإجازات والاستئذانات مبنيًا على مبدأ **السجل المحاسبي غير القابل للتغيير** (Immutable Ledger)، حيث لا يُخزَّن أي رصيد مباشرةً بل يُحسَب دائمًا من مجموع الحركات التاريخية.

## 2. مكونات النطاق

| الملف | النوع | الوصف |
|---|---|---|
| `supabase/migrations/20260918050000_leave_balances_permits_domain.sql` | SQL Migration | جداول النطاق + stored procs + RLS |
| `src/lib/leave-core.mjs` | Domain Logic | منطق الأعمال الصافي (بدون تبعيات خارجية) |
| `src/lib/leave-core.d.mts` | TypeScript | تعريفات الأنواع |
| `src/lib/leave.functions.ts` | Server Functions | نقاط الإدخال للعميل |
| `tests/leave-balances.test.mjs` | Tests | 25+ اختبار وحدة |

## 3. هيكل قاعدة البيانات

### 3.1 جداول السياسات

#### `leave_policies`
تُحدِّد قواعد كل نوع إجازة لكل فرع/قسم:
- الحد الأدنى/الأقصى للأيام لكل طلب
- عدد أيام الأرصدة السنوية
- السماح بالرصيد السالب أم لا
- أيام الراحة الأسبوعية (الجمعة والسبت)

#### `official_holidays`
جدول العطل الرسمية بالتاريخ والبيانات متعددة السنوات، تُستخدم لاستبعادها من حساب الأيام القابلة للخصم.

#### `permit_policies`
قواعد الاستئذانات:
- الحد الأقصى لعدد مرات الاستئذان شهريًا
- الحد الأقصى للساعات الإجمالية شهريًا
- الحد الأقصى للمدة لكل استئذان

### 3.2 جداول العمليات

#### `leave_ledger` (للقراءة فقط بعد الإدراج)
السجل المحاسبي الثابت للإجازات. **لا يُسمح بأي UPDATE أو DELETE**.

أنواع الحركات:
| النوع | الإشارة | الوصف |
|---|---|---|
| `opening` | + | رصيد افتتاحي |
| `accrual` | + | استحقاق دوري |
| `consumption` | − | خصم بعد الاعتماد |
| `reversal` | + | استرداد بعد الرفض/الإلغاء |
| `adjustment` | +/− | تعديل يدوي مع موافقة |
| `reservation` | − | حجز مؤقت عند تقديم الطلب |
| `expiry` | − | انتهاء صلاحية رصيد |
| `carry_forward` | + | ترحيل من العام السابق |

#### `leave_requests_domain`
طلبات الإجازات المرتبطة بمحرك Workflow ومربوطة بـ `leave_ledger` و`wf_request_instances`.

#### `permit_requests_domain`
طلبات الاستئذانات مع دعم الحساب بالدقائق.

### 3.3 الجسر مع الجداول الموروثة

أُضيف عمود `domain_request_id` بشكل مُضاف (Additive) إلى:
- `leave_requests.domain_request_id` — ربط بـ `leave_requests_domain.id`
- `employee_permits.domain_request_id` — ربط بـ `permit_requests_domain.id`

بما يضمن التوافق مع الكود القديم مع الاستفادة من النطاق الجديد.

## 4. منطق الأعمال (`leave-core.mjs`)

### 4.1 حساب الأيام القابلة للخصم

```
calculateDeductibleDays(fromDate, toDate, officialHolidays)
```

**القواعد:**
- يُستبعَد الجمعة (DOW=5) والسبت (DOW=6) تلقائيًا
- تُستبعَد أي أيام موجودة في `official_holidays`
- الحساب بالتوقيت UTC لتجنب مشاكل التوقيت المحلي

### 4.2 حساب الرصيد من السجل

```
computeBalanceFromLedger(entries)
→ { current, reserved, available }
```

- **current**: مجموع كل الحركات ما عدا الحجوزات
- **reserved**: مجموع `|حركات الحجز|`
- **available**: current − reserved

### 4.3 التحقق من الأهلية

```
validateLeaveEligibility(request, balance, policy, existingLeaves)
→ { valid: boolean, errors: string[] }
```

**الفحوصات المتسلسلة:**
1. الحد الأدنى لعدد الأيام المطلوبة
2. الحد الأقصى لعدد الأيام المطلوبة
3. رصيد كافٍ (أو سماح برصيد سالب)
4. عدم التداخل مع إجازات موجودة (حالة `approved` أو `pending`)

### 4.4 التحقق من حصة الاستئذان

```
validatePermitQuota(request, policy, existingPermits)
→ { valid: boolean, errors: string[] }
```

**الفحوصات:**
1. الحد الأقصى للمدة لكل استئذان (بالدقائق)
2. الحد الأقصى لعدد المرات شهريًا
3. الحد الأقصى للساعات الإجمالية شهريًا

## 5. Server Functions (`leave.functions.ts`)

### `submitLeaveRequestFn`
1. يتحقق من أهلية الموظف والرصيد والتداخل
2. يحجز الأيام في السجل (`reservation`)
3. يُنشئ `wf_request_instance` عبر محرك Workflow
4. يُزامن الجدول الموروث `leave_requests`

### `decideLeaveRequestFn`
1. يُحدِّث قرار مرحلة Workflow عبر `execute_workflow_decision`
2. عند الاعتماد النهائي: يُحوِّل الحجز إلى استهلاك (`consumption`)
3. عند الرفض/الإلغاء: يعكس الحجز (`reversal`)
4. يُزامن حالة `leave_requests` الموروث

### `getEmployeeLeaveBalanceFn`
يحسب الرصيد الحقيقي من السجل في الوقت الفعلي لكل سياسة إجازة.

### `submitPermitRequestFn`
1. يتحقق من حصة الاستئذانات الشهرية
2. يُنشئ `permit_requests_domain` وربطه بـ Workflow
3. يُزامن `employee_permits`

## 6. RLS وسياسات الأمان

- **صفر وصول مجهول** لجميع جداول النطاق
- يرى الموظف فقط سجلات `employee_id = current_emp_no()`
- المدراء يرون النطاق المفوَّض إليهم فقط
- Triggers تمنع أي UPDATE/DELETE على `leave_ledger`

## 7. بنية الاختبارات

```
tests/leave-balances.test.mjs   25 اختبار
├── toIsoDate                    2 اختبارات
├── detectDateOverlap            6 اختبارات
├── calculateDeductibleDays      5 اختبارات
├── computeBalanceFromLedger     5 اختبارات
├── validateLeaveEligibility     6 اختبارات
└── validatePermitQuota          5 اختبارات
```

## 8. التكامل مع محرك Workflow

جميع طلبات الإجازات والاستئذانات تمر عبر **محرك Workflow المركزي** (PROMPT 4):
- تُقفَل على `workflow_version_id` عند التقديم
- دورات الاعتماد متعددة المراحل مدعومة كاملًا
- التفويض وSLA وOutbox للإشعارات موروثة من المحرك

## 9. الارتباطات

- [محرك Workflow المركزي](./requests-workflow.md)
- [Migration SQL](../../supabase/migrations/20260918050000_leave_balances_permits_domain.sql)
- [leave-core.mjs](../../src/lib/leave-core.mjs)
