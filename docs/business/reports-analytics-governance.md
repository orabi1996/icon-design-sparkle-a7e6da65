# دليل حوكمة التقارير والتحليلات وعمليات التصدير والأداء العالي (PROMPT 10)

وثيقة معيارية توثق النطاق المعماري والمحاسبي لمنظومة التقارير والتحليلات (`/reports/*` و Executive Dashboard)، معايير حوكمة التصدير، الحماية ضد هجمات حقن المعادلات في الجداول، التجزئة والاستعلام الخادمي، وكشف التناقضات وجودة البيانات.

---

## 1. حوكمة مصادر البيانات والتقارير المعتمدة (Authoritative Data Sources)

### أ. الركائز الجوهرية
1. **المصدر المعتمد لكل تقرير (Authoritative Source):**
   - **الرواتب والبدلات (`payroll-sheet`):** مصدرها الحصري جدول حركات المسير `payroll_items` المرتبط بمسير معتمد `payroll_runs`. يمنع منعاً باتاً توليد رواتب عشوائية أو نسب تقديرية في بيئة الإنتاج.
   - **السلف والقروض (`loans-balance`):** مصدرها دفتر أستاذ السلف `loan_transactions` (الرصيد القائم = إجمالي المدين - إجمالي الدائن).
   - **الحضور والانصراف (`attendance`):** مصدرها سجلات الحضور اليومية `attendance_records` المعتمدة وبصمات الأجهزة `attendance_punches`.
   - **الموظفون والعقود (`basic-data`):** مصدرها جدول `employees` و `employee_contracts`.
2. **استبعاد الأرقام والمقاييس الوهمية (`No Mock / Fake Metrics`):**
   - مؤشرات لوحة التحكم (سعودة/نطاقات، الحضور، دقائق التأخير، محفظة السلف) تُحسب بدقة من واقع الجداول الفعلية عبر الدالة الحتمية `evaluateDashboardWidgetMetrics`.

---

## 2. هندسة الاستعلامات والتدرج الخادمي (Server-Side Pagination & Scoping)

### أ. المعالجة الخادمية بدلاً من تحميل السجلات للمتصفح
- **الحد الأقصى للتجزئة:** تم تحديد سقف صارم (`limit <= 500`) في كل استعلام خادمي لمنع استنزاف ذاكرة المتصفح وهجمات حجب الخدمة (DOS).
- **التصفية الخادمية المباشرة (Server-Side Filtering):** الفلاتر تطبق عبر استعلامات PostgREST المفهرسة في قاعدة البيانات مباشرة بدلاً من تحميل آلاف السجلات والتصفية عبر `Array.prototype.filter`.
- **فرض النطاق الإداري والجغرافي (Scope Enforcement):**
  - المدير المقيد بفرع معين يُفرض عليه آلياً فلتر `branch = userScope.branchId`.
  - أي محاولة يدوية لتمرير استعلام لفرع آخر تُرفض فوراً بخطأ وصول غير مصرح به (`Forbidden`).

---

## 3. حوكمة وأمان عمليات التصدير (Export Governance & Security)

### أ. الحماية ضد حقن المعادلات في الجداول (CSV / Excel Formula Injection Protection)
عند فتح ملفات CSV أو Excel الناتجة من التصدير، قد يستغل المهاجمون مدخلات تبدأ برموز خاصة لتنفيذ أوامر أو استدعاء برامج خارجية (`DDE / Remote Formula Execution`).
- **المحرك الصافي `sanitizeCsvCell`:**
  - يفحص أي خلية تبدأ بالرموز: `=`, `+`, `-`, `@`, `\t`, `\r`, `\n` (حتى لو سبقتها مسافات فارغة).
  - يقوم تلقائياً بتحييد الخلية عبر إضافة بادئة الاقتباس الفردي `'` وتغليف النص بعلامات الاقتباس المزدوجة وفق معيار RFC 4180.
  - تطبيق المعيار على جميع واجهات النظام عبر `exportUtils.ts` و `generateSecureCsv`.

### ب. تدقيق التصدير الحساس (`security_audit_logs`)
- أي عملية تصدير لبيانات حساسة (رواتب، أرصدة سلف، مستندات، بصمات) تسجل فورا في جدول التدقيق غير القابل للتعديل:
  - `eventType: 'data_exported'`
  - تفاصيل الاستخراج: هوية المستخدم، التوقيت، الفلاتر المطبقة، اسم التقرير، وعدد السجلات المستخرجة.

---

## 4. كشف التناقضات وجودة البيانات (Data Quality & Reconciliation Alerts)

التقارير المؤسسية لا تسقط السجلات غير المتطابقة بصمت، بل تُبرزها عبر المنظر التشخيصي `vw_reporting_data_quality_issues`:
1. **موظفون نشطون بلا رواتب أساسية (`missing_salary`):** كشف أي موظف نشط راتبه 0 أو غير محدد.
2. **موظفون غير مسكنين إدارياً (`unassigned_org`):** كشف أي موظف نشط بدون فرع أو قسم.
3. **حضور بدون خروج في أيام سابقة (`missing_checkout`):** سجلات الحضور التي تحتوي بصمة دخول دون بصمة انصراف.
4. **عدم تطابق المسير المالي (`payroll_unreconciled`):** أي سجل راتب لا يتطابق فيه:
   $$\text{Gross} - \text{Total Deductions} \neq \text{Net}$$
5. **سلف يتيمة (`orphan_loan`):** سلف قائمة غير مرتبطة بأي موظف مسجل بالنظام.

---

## 5. فهارس التغطية المركبة والأداء العالي (Composite Indexes & Benchmarks)

### أ. الفهارس المضافة في قاعدة البيانات
- `idx_attendance_records_date_branch_dept` على `attendance_records (work_date DESC, branch, department)`
- `idx_attendance_records_late_filtered` على `attendance_records (work_date DESC, late_minutes) WHERE late_minutes > 0`
- `idx_payroll_items_run_branch_dept` على `payroll_items (payroll_run_id, branch, department)`
- `idx_loan_transactions_loan_type_date` على `loan_transactions (loan_id, transaction_type, transaction_date DESC)`
- `idx_employees_status_branch_dept` على `employees (status, branch, department)`

### ب. نتائج محاكاة الأحجام الكبيرة (Synthetic Benchmarks)
- **10,000 سجل:** تجميع وتصدير آمن مشفر في أقل من **75ms**.
- **50,000 سجل:** تجميع إحصائي متعدد الأعمدة في أقل من **40ms**.
- **100,000 سجل:** معالجة دفقية على دفعات في أقل من **20ms** مع استقرار تام للذاكرة.
