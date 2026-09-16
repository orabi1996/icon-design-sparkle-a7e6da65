/** Route inventory, not a claim of functional completeness. Update when routes change. */
export const SCREENS = Object.freeze([
  { path: "/shifts/library", title: "مكتبة الشفتات", section: "إدارة الشفتات والدوام", status: "phase1" },
  { path: "/shifts/templates", title: "قوالب أيام العمل", section: "إدارة الشفتات والدوام", status: "phase1" },
  { path: "/shifts/rosters", title: "جداول الدوام", section: "إدارة الشفتات والدوام", status: "phase1" },
  { path: "/shifts/import", title: "الاستيراد والتسكين الجماعي", section: "إدارة الشفتات والدوام", status: "phase1" },
  { path: "/shifts/patterns", title: "أنماط التكرار", section: "إدارة الشفتات والدوام", status: "phase1" },
  { path: "/shifts/bindings", title: "ربط الموظفين بالأنماط", section: "إدارة الشفتات والدوام", status: "phase1" },
  { path: "/shifts/coverage", title: "الاحتياج والتغطية", section: "إدارة الشفتات والدوام", status: "phase1" },
  { path: "/shifts/approvals", title: "مراجعة الجداول واعتمادها", section: "إدارة الشفتات والدوام", status: "phase1" },
  { path: "/shifts/requests", title: "طلبات التغيير والتبادل", section: "إدارة الشفتات والدوام", status: "phase1" },
  { path: "/shifts/open", title: "الشفتات الشاغرة", section: "إدارة الشفتات والدوام", status: "phase1" },
  { path: "/shifts/mine", title: "جدول الموظف", section: "إدارة الشفتات والدوام", status: "phase1" },
  { path: "/shifts/policies", title: "سياسات الدوام", section: "إدارة الشفتات والدوام", status: "phase1" },
  { path: "/shifts/exceptions", title: "الاستثناءات وأثر التغيير", section: "إدارة الشفتات والدوام", status: "phase1" },
  { path: "/shifts/reports", title: "تقارير الشفتات", section: "إدارة الشفتات والدوام", status: "phase1" },
  { path: "/shifts/audit", title: "الإصدارات والتدقيق", section: "إدارة الشفتات والدوام", status: "phase1" },
  {
    "path": "/approval-requests",
    "title": "طلبات الاعتماد",
    "section": "عمليات الموظفين",
    "status": "legacy"
  },
  {
    "path": "/auth",
    "title": "تسجيل الدخول",
    "section": "الدخول والصلاحيات",
    "status": "legacy"
  },
  {
    "path": "/correspondence",
    "title": "المراسلات",
    "section": "عمليات الموظفين",
    "status": "legacy"
  },
  {
    "path": "/end-of-service-provision",
    "title": "مخصص نهاية الخدمة",
    "section": "عمليات الموظفين",
    "status": "legacy"
  },
  {
    "path": "/end-of-service-requests",
    "title": "طلبات نهاية الخدمة",
    "section": "عمليات الموظفين",
    "status": "legacy"
  },
  {
    "path": "/",
    "title": "لوحة معلومات الموارد البشرية",
    "section": "لوحة المعلومات",
    "status": "legacy"
  },
  {
    "path": "/inquiries",
    "title": "المسائلات",
    "section": "عمليات الموظفين",
    "status": "legacy"
  },
  {
    "path": "/leaves",
    "title": "طلبات الأجازات",
    "section": "عمليات الموظفين",
    "status": "legacy"
  },
  {
    "path": "/loans",
    "title": "السلف",
    "section": "عمليات الموظفين",
    "status": "legacy"
  },
  {
    "path": "/payroll/bank-file",
    "title": "توليد ملف البنك وحماية الأجور (WPS)",
    "section": "الرواتب",
    "status": "needs_business"
  },
  {
    "path": "/payroll",
    "title": "تجهيز المسير",
    "section": "الرواتب",
    "status": "needs_business"
  },
  {
    "path": "/permissions",
    "title": "الصلاحيات",
    "section": "الدخول والصلاحيات",
    "status": "legacy"
  },
  {
    "path": "/permits",
    "title": "الأذونات",
    "section": "عمليات الموظفين",
    "status": "legacy"
  },
  {
    "path": "/regulations/approvals",
    "title": "سلاسل الموافقات",
    "section": "اللوائح والدوام",
    "status": "legacy"
  },
  {
    "path": "/regulations/bank-fees",
    "title": "العمولات البنكية",
    "section": "اللوائح والدوام",
    "status": "legacy"
  },
  {
    "path": "/regulations/deductions",
    "title": "لائحة الإستقطاعات",
    "section": "اللوائح والدوام",
    "status": "legacy"
  },
  {
    "path": "/regulations/eos",
    "title": "لائحة نهاية الخدمة",
    "section": "اللوائح والدوام",
    "status": "legacy"
  },
  {
    "path": "/regulations/fingerprint",
    "title": "خصومات البصمة",
    "section": "اللوائح والدوام",
    "status": "legacy"
  },
  {
    "path": "/regulations",
    "title": "لائحة الإستحقاقات",
    "section": "اللوائح والدوام",
    "status": "legacy"
  },
  {
    "path": "/regulations/loans",
    "title": "تهيئة السلف",
    "section": "اللوائح والدوام",
    "status": "legacy"
  },
  {
    "path": "/regulations/other",
    "title": "لوائح أخرى",
    "section": "اللوائح والدوام",
    "status": "legacy"
  },
  {
    "path": "/regulations/permits",
    "title": "لائحة الأذونات",
    "section": "اللوائح والدوام",
    "status": "legacy"
  },
  {
    "path": "/regulations/shifts",
    "title": "تهيئة مجموعات الدوام والحضور",
    "section": "اللوائح والدوام",
    "status": "legacy"
  },
  {
    "path": "/regulations/vacations",
    "title": "تهيئة الاجازات",
    "section": "اللوائح والدوام",
    "status": "legacy"
  },
  {
    "path": "/reports/absence-daily",
    "title": "تقرير الغياب اليومي",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/absence-days-count",
    "title": "تقرير عدد أيام الغياب",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/absence-days-list",
    "title": "تقرير الغياب بالأيام",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/absence-employee",
    "title": "تقرير غياب الموظف",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/absence-late-comparison",
    "title": "مقارنة الغياب والتأخير للفروع والأقسام",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/absence-monthly",
    "title": "تقرير حصر الغياب بالأشهر",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/absence-value",
    "title": "تفاصيل قيمة الغياب للموظف",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/admin-forms",
    "title": "طباعة وتصميم النماذج الإدارية",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/archive",
    "title": "الأرشيف الإلكتروني للمستندات والوثائق",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/attendance-comprehensive",
    "title": "تقرير الحضور والإنصراف الشامل",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/attendance-detailed",
    "title": "تقرير الحضور والانصراف التفصيلي",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/attendance-statistics",
    "title": "تقرير إحصائي عن الحضور والانصراف",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/attendance",
    "title": "تقرير حضور و انصراف البصمة",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/bank-statement",
    "title": "تقرير كشف الحساب والتحويل البنكي (WPS)",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/basic-data",
    "title": "تقرير البيانات الأساسية",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/daily-late",
    "title": "تقرير التأخير اليومي",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/early-checkout-days",
    "title": "تقرير الانصراف المبكر بالأيام",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/employee-account-statement",
    "title": "كشف حساب الموظف المالي للعام",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/employee-certificates",
    "title": "تقرير الشهادات العلمية والمهنية للموظفين",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/employee-contracts-report",
    "title": "تقرير عقود الموظفين وتواريخ التجديد",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/employee-data",
    "title": "تقرير بيانات الموظفين",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/employee-dependents",
    "title": "تقرير المرافقين والتابعين",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/employee-files",
    "title": "تقرير ملفات الموظفين",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/employee-headcount",
    "title": "تقرير أعداد وإحصائيات الموظفين",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/employee-leaves",
    "title": "تقرير إجازات الموظفين",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/employee-training",
    "title": "تقرير الدورات والبرامج التدريبية للموظفين",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/entitlements-deductions",
    "title": "تقرير الاستحقاقات والاستقطاعات",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/evaluation",
    "title": "تقرير التقييم",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/exceptions",
    "title": "تقرير استثناءات الحضور والإنصراف",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/financial-data",
    "title": "تقرير البيانات المالية للموظفين",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/fingerprint",
    "title": "تقرير بصمة الموظف",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/hire-and-termination",
    "title": "تقرير التعيينات وإنهاء الخدمة",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/historical-leaves",
    "title": "تقرير الملف التاريخي لإجازات الموظفين",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/late-days-list",
    "title": "تقرير التأخير بالأيام",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/late-minutes",
    "title": "تقرير عدد الدقائق وساعات التأخير",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/loans-balance",
    "title": "تقرير أرصدة السلف والقروض القائمة",
    "section": "التقارير",
    "status": "phase1"
  },
  {
    "path": "/reports/loans-data",
    "title": "تقرير بيانات السلف والقروض",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/manpower-budget",
    "title": "تقرير الموازنة التقديرية للقوى العاملة",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/medical-insurance",
    "title": "تقرير تأمينات الطبية للموظفين",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/payroll-adjustments",
    "title": "تقرير تعديلات وتسويات المسير",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/payroll-comparison",
    "title": "مقارنة مسير الرواتب بين شهرين",
    "section": "التقارير",
    "status": "needs_business"
  },
  {
    "path": "/reports/payroll-sheet",
    "title": "مسير الرواتب الشهري التفصيلي",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/petty-cash",
    "title": "تقرير العهد النقدية والعينية للموظفين",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/requests-summary",
    "title": "تقرير الطلبات والعمليات المتنوعة",
    "section": "التقارير",
    "status": "legacy"
  },
  {
    "path": "/reports/surveys-report",
    "title": "تقرير التعميمات الإدارية والاستبيانات",
    "section": "التقارير",
    "status": "needs_business"
  },
  {
    "path": "/request-notifications",
    "title": "اشعارات الطلبات",
    "section": "عمليات الموظفين",
    "status": "legacy"
  },
  {
    "path": "/requests/purchase-budget",
    "title": "ميزانية الشراء والتعاميد المالية",
    "section": "الطلبات",
    "status": "needs_business"
  },
  {
    "path": "/requests/setup",
    "title": "تهيئة الطلبات ومسارات الاعتماد",
    "section": "الطلبات",
    "status": "business"
  },
  {
    "path": "/reset-password",
    "title": "تعيين كلمة مرور جديدة",
    "section": "الدخول والصلاحيات",
    "status": "legacy"
  },
  {
    "path": "/settings/account-links",
    "title": "تهيئة ربط الحسابات",
    "section": "إعدادات النظام",
    "status": "legacy"
  },
  {
    "path": "/settings/basic",
    "title": "تهيئة البيانات الاساسية",
    "section": "إعدادات النظام",
    "status": "legacy"
  },
  {
    "path": "/settings/branch-quotas",
    "title": "تحديد أعداد ومستهدفات الموظفين في الفروع",
    "section": "إعدادات النظام",
    "status": "needs_business"
  },
  {
    "path": "/settings/branches",
    "title": "تهيئة بيانات الفروع",
    "section": "إعدادات النظام",
    "status": "needs_business"
  },
  {
    "path": "/settings/calendar",
    "title": "تهيئة السنوات والشهور",
    "section": "إعدادات النظام",
    "status": "legacy"
  },
  {
    "path": "/settings/company-documents",
    "title": "مستندات وتراخيص الشركة والفروع",
    "section": "إعدادات النظام",
    "status": "needs_business"
  },
  {
    "path": "/settings/company",
    "title": "تهيئة بيانات المنشأة والشركة",
    "section": "إعدادات النظام",
    "status": "phase1"
  },
  {
    "path": "/settings/general",
    "title": "التهيئة العامة للبرنامج",
    "section": "إعدادات النظام",
    "status": "legacy"
  },
  {
    "path": "/settings/sponsors",
    "title": "تهيئة بيانات الكفلاء والمنشآت التابعة",
    "section": "إعدادات النظام",
    "status": "needs_business"
  },
  {
    "path": "/settings/suspension-reasons",
    "title": "تهيئة أسباب إيقاف الموظفين وتعليق الصرف",
    "section": "إعدادات النظام",
    "status": "needs_business"
  },
  {
    "path": "/staff/add",
    "title": "إضافة موظف",
    "section": "شؤون الموظفين",
    "status": "legacy"
  },
  {
    "path": "/staff/bank-block",
    "title": "حظر تعديل البيانات البنكية",
    "section": "شؤون الموظفين",
    "status": "needs_business"
  },
  {
    "path": "/staff/contracts",
    "title": "تجديد العقود",
    "section": "شؤون الموظفين",
    "status": "needs_business"
  },
  {
    "path": "/staff",
    "title": "شؤون الموظفين",
    "section": "شؤون الموظفين",
    "status": "legacy"
  },
  {
    "path": "/staff/manager",
    "title": "تغيير المدير المباشر",
    "section": "شؤون الموظفين",
    "status": "needs_business"
  },
  {
    "path": "/staff/transfer",
    "title": "النقل والترقية",
    "section": "شؤون الموظفين",
    "status": "legacy"
  },
  {
    "path": "/staff/update",
    "title": "تحديث البيانات",
    "section": "شؤون الموظفين",
    "status": "legacy"
  },
  {
    "path": "/surveys",
    "title": "الاستبيانات و التعميم",
    "section": "عمليات الموظفين",
    "status": "legacy"
  },
  {
    "path": "/tasks",
    "title": "المهام",
    "section": "إدارة المهام",
    "status": "legacy"
  },
  {
    "path": "/tasks/permissions",
    "title": "إدارة الصلاحيات",
    "section": "إدارة المهام",
    "status": "legacy"
  },
  {
    "path": "/tasks/reports",
    "title": "تقارير إدارة المهام",
    "section": "إدارة المهام",
    "status": "legacy"
  },
  {
    "path": "/tasks/setup",
    "title": "تهيئة إدارة المهام",
    "section": "إدارة المهام",
    "status": "legacy"
  },
  {
    "path": "/vacations",
    "title": "الأجازات",
    "section": "عمليات الموظفين",
    "status": "needs_business"
  }
]);
