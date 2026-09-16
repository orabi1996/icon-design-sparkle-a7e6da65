import type { NavItem } from "@/components/MegaMenu";

export const nav: NavItem[] = [
  {
    label: "إدارة المهام",
    icon: "dashboard_customize",
    columns: [
      {
        title: "إدارة المهام الإضافية",
        items: [
          { label: "المهام", to: "/tasks" },
          { label: "التهيئة", to: "/tasks/setup" },
          { label: "إدارة الصلاحيات", to: "/tasks/permissions" },
          { label: "التقارير", to: "/tasks/reports" },
        ],
      },
    ],
  },
  { label: "الصلاحيات", icon: "shield_person", to: "/permissions" },
  { label: "تقرير تقييم الأداء", icon: "trending_up", to: "/reports/evaluation" },
  {
    label: "طلبات الاعتماد",
    icon: "task_alt",
    columns: [
      {
        title: "متابعة الطلبات",
        items: [{ label: "طلبات الاعتماد", to: "/approval-requests" }],
      },
    ],
  },
  {
    label: "التقارير",
    icon: "lab_profile",
    columns: [
      {
        title: "تقارير البصمة",
        items: [
          { label: "تقرير البصمة", to: "/reports/fingerprint" },
          { label: "تقرير حضور وإنصراف البصمة", to: "/reports/attendance" },
          {
            label: "تقرير إحصائي عن الحضور والانصراف",
            to: "/reports/attendance-statistics",
          },
          {
            label: "تقرير الحضور والانصراف التفصيلي",
            to: "/reports/attendance-detailed",
          },
          {
            label: "تقرير الحضور والإنصراف الشامل",
            to: "/reports/attendance-comprehensive",
          },
          { label: "تقرير التأخير اليومي", to: "/reports/daily-late" },
          { label: "تقرير غياب الموظف", to: "/reports/absence-employee" },
          { label: "تقرير الغياب اليومي", to: "/reports/absence-daily" },
          { label: "تفاصيل قيمة غياب الموظف", to: "/reports/absence-value" },
          {
            label: "مقارنة الغياب والتأخير للفروع والأقسام",
            to: "/reports/absence-late-comparison",
          },
          { label: "تقرير استثناءات الحضور والإنصراف", to: "/reports/exceptions" },
          { label: "تقرير عدد أيام الغياب", to: "/reports/absence-days-count" },
          { label: "تقرير عدد الدقائق وساعات التأخير", to: "/reports/late-minutes" },
          { label: "تقرير الغياب بالأيام", to: "/reports/absence-days-list" },
          { label: "تقرير التأخير بالأيام", to: "/reports/late-days-list" },
          { label: "تقرير الانصراف المبكر بالأيام", to: "/reports/early-checkout-days" },
          { label: "تقرير حصر الغياب بالأشهر", to: "/reports/absence-monthly" },
        ],
      },
      {
        title: "تقارير بيانات الموظفين",
        items: [
          { label: "تقرير بيانات الموظفين", to: "/reports/employee-data" },
          { label: "تقرير البيانات الاساسية", to: "/reports/basic-data" },
          { label: "تقرير التعيينات وإنهاء الخدمة", to: "/reports/hire-and-termination" },
          { label: "تقرير ملفات الموظفين", to: "/reports/employee-files" },
          { label: "تقرير التقييم", to: "/reports/evaluation" },
          { label: "طباعة النماذج الإدارية", to: "/reports/admin-forms" },
          { label: "تقرير التأمين الطبي للموظفين", to: "/reports/medical-insurance" },
          { label: "تقرير البيانات المالية", to: "/reports/financial-data" },
          { label: "تقرير اجازات الموظفين", to: "/reports/employee-leaves" },
          { label: "تقرير المرافقين", to: "/reports/employee-dependents" },
          { label: "تقرير الشهادات", to: "/reports/employee-certificates" },
          { label: "تقرير الدورات التدريبية", to: "/reports/employee-training" },
        ],
      },
      {
        title: "تقارير ماليات الموظفين",
        items: [
          { label: "مسير الرواتب", to: "/reports/payroll-sheet" },
          { label: "مقارنة بين شهرين للمسير", to: "/reports/payroll-comparison" },
          { label: "تقرير الاستحقاقات والاستقطاعات", to: "/reports/entitlements-deductions" },
          { label: "تقرير كشف الحساب البنكي", to: "/reports/bank-statement" },
          { label: "تقرير تعديل المسير", to: "/reports/payroll-adjustments" },
          { label: "تقرير بيانات السلف", to: "/reports/loans-data" },
          { label: "تقرير رصيد السلف", to: "/reports/loans-balance" },
          { label: "تقرير العهد النقدية", to: "/reports/petty-cash" },
          { label: "كشف حساب الموظف للعام", to: "/reports/employee-account-statement" },
        ],
      },
      {
        title: "تقارير إحصائية",
        items: [
          { label: "تقرير الموازنة التقديرية للقوى العاملة", to: "/reports/manpower-budget" },
          { label: "تقرير اعداد الموظفين", to: "/reports/employee-headcount" },
          { label: "تقرير عقود الموظفين", to: "/reports/employee-contracts-report" },
          { label: "تقرير الطلبات المتنوعة", to: "/reports/requests-summary" },
          { label: "تقرير التعميمات والاستبيانات", to: "/reports/surveys-report" },
        ],
      },
      {
        title: "تقارير تاريخية",
        items: [
          { label: "تقرير الملف التاريخي لاجازات الموظفين", to: "/reports/historical-leaves" },
          { label: "الأرشيف", to: "/reports/archive" },
        ],
      },
    ],
  },
  {
    label: "الطلبات",
    icon: "campaign",
    columns: [
      {
        title: "الموافقة على الطلبات",
        items: [
          { label: "الطلبات", to: "/approval-requests" },
          { label: "ميزانية الشراء", to: "/requests/purchase-budget" },
          { label: "تهيئة الطلبات", to: "/requests/setup" },
        ],
      },
    ],
  },
  {
    label: "اللوائح",
    icon: "format_list_bulleted",
    columns: [
      {
        title: "التهيئة المالية",
        items: [
          { label: "لائحة الإستحقاقات", to: "/regulations" },
          { label: "لائحة الإستقطاعات", to: "/regulations/deductions" },
          { label: "تهيئة العمولات البنكية", to: "/regulations/bank-fees" },
        ],
      },
      {
        title: "إعدادات متنوعة",
        items: [
          { label: "تهيئة الاجازات", to: "/regulations/vacations" },
          { label: "تهيئة مجموعات الدوام", to: "/regulations/shifts" },
          { label: "إدارة الشفتات والجداول", to: "/shifts/rosters" },
          { label: "جدولي المنشور", to: "/shifts/mine" },
          { label: "تهيئة السلف", to: "/regulations/loans" },
          { label: "تهيئة سلاسل الموافقات", to: "/regulations/approvals" },
          { label: "تهيئة لائحة الأذونات", to: "/regulations/permits" },
        ],
      },
      {
        title: "لائحة خصومات البصمة",
        items: [{ label: "لائحة خصومات البصمة", to: "/regulations/fingerprint" }],
      },
      {
        title: "لوائح أخرى",
        items: [
          { label: "لوائح أخرى", to: "/regulations/other" },
          { label: "لائحة نهاية الخدمة", to: "/regulations/eos" },
        ],
      },
    ],
  },
  {
    label: "عمليات شؤون الموظفين",
    icon: "manage_accounts",
    columns: [
      {
        title: "متابعة المستندات",
        items: [{ label: "اشعارات الطلبات", to: "/request-notifications" }],
      },
      { title: "بيانات الموظفين", items: [{ label: "شؤون الموظفين", to: "/staff" }] },
      {
        title: "عمليات الموظفين",
        items: [
          { label: "الأجازات", to: "/vacations" },
          { label: "طلبات الأجازات", to: "/leaves" },
          { label: "الاستبيانات و التعميم", to: "/surveys" },
          { label: "المسائلات", to: "/inquiries" },
          { label: "الأذونات", to: "/permits" },
          { label: "المراسلات", to: "/correspondence" },
          { label: "مخصص نهاية الخدمة", to: "/end-of-service-provision" },
          { label: "طلبات نهاية الخدمة", to: "/end-of-service-requests" },
        ],
      },
      { title: "ماليات الموظفين", items: [{ label: "السلف", to: "/loans" }] },
      {
        title: "رواتب الموظفين",
        items: [
          { label: "تجهيز مسودة المسير", to: "/payroll" },
          { label: "ملف البنك", to: "/payroll/bank-file" },
        ],
      },
    ],
  },
  {
    label: "إعدادات النظام",
    icon: "settings",
    columns: [
      {
        title: "تهيئة البيانات الأساسية",
        items: [
          { label: "التهيئة العامة للبرنامج", to: "/settings/general" },
          { label: "تهيئة البيانات الاساسية", to: "/settings/basic" },
          { label: "تهيئة ربط الحسابات", to: "/settings/account-links" },
        ],
      },
      {
        title: "تهيئة بيانات الشركات والفروع",
        items: [
          { label: "تهيئة بيانات الشركة", to: "/settings/company" },
          { label: "تهيئة بيانات الفروع", to: "/settings/branches" },
          { label: "مستندات الشركة والافرع", to: "/settings/company-documents" },
        ],
      },
      {
        title: "إعدادات أخرى",
        items: [
          { label: "تهيئة السنوات والشهور", to: "/settings/calendar" },
          { label: "تهيئة الكفلاء", to: "/settings/sponsors" },
          { label: "تهيئة أسباب الايقاف", to: "/settings/suspension-reasons" },
          { label: "تحديد اعداد الموظفين في الفروع", to: "/settings/branch-quotas" },
        ],
      },
    ],
  },
];

export const sidebar: { label: string; icon: string; to?: string; badge?: string }[] = [
  { label: "اللوحة الرئيسية", icon: "space_dashboard", to: "/" },
  { label: "الموظفون", icon: "groups", to: "/staff" },
  { label: "العقود", icon: "description", to: "/staff/contracts" },
  {
    label: "اشعارات الطلبات",
    icon: "notifications_active",
    to: "/request-notifications",
  },
  {
    label: "الحضور والانصراف",
    icon: "schedule",
    to: "/reports/attendance-comprehensive",
  },
  { label: "الإجازات", icon: "beach_access", to: "/leaves" },
  { label: "الأذونات", icon: "approval", to: "/permits" },
  { label: "المراسلات", icon: "mail", to: "/correspondence" },
  { label: "مخصص نهاية الخدمة", icon: "savings", to: "/end-of-service-provision" },
  { label: "طلبات نهاية الخدمة", icon: "person_remove", to: "/end-of-service-requests" },
  { label: "اللوائح المالية", icon: "format_list_bulleted", to: "/regulations" },
  { label: "الرواتب", icon: "payments", to: "/payroll" },
  { label: "تقارير التدريب", icon: "school", to: "/reports/employee-training" },
];
