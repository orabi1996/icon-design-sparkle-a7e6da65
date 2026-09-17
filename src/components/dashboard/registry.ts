import type { WidgetRegistryItem, WidgetType } from "./types";
import { LiveAttendanceWidget } from "./widgets/LiveAttendanceWidget";
import { EmployeeStatusWidget } from "./widgets/EmployeeStatusWidget";
import { PendingRequestsWidget } from "./widgets/PendingRequestsWidget";
import { DepartmentDistributionWidget } from "./widgets/DepartmentDistributionWidget";
import { JobLevelWidget } from "./widgets/JobLevelWidget";
import { NationalitiesWidget } from "./widgets/NationalitiesWidget";
import { JobCategoryWidget } from "./widgets/JobCategoryWidget";
import { SectorDistributionWidget } from "./widgets/SectorDistributionWidget";
import { PayrollSummaryWidget } from "./widgets/PayrollSummaryWidget";
import { DataExplorerWidget } from "./widgets/DataExplorerWidget";

export const WIDGET_REGISTRY: Record<WidgetType, WidgetRegistryItem> = {
  live_attendance: {
    type: "live_attendance",
    title: "حضور وانصراف اليوم المباشر",
    category: "attendance",
    description: "4 بطاقات حية للحضور، الغياب، التأخير، والانصراف المبكر مع فحص تفصيلي لكل بطاقة.",
    icon: "how_to_reg",
    defaultColSpan: 12,
    component: LiveAttendanceWidget,
  },
  employee_status: {
    type: "employee_status",
    title: "مؤشرات حالات الموظفين والقوى العاملة",
    category: "workforce",
    description: "7 بطاقات لمتابعة الموظفين المفعلين، منتهي خدماتهم، الموقوفين، في إجازة، وتحت التجربة.",
    icon: "badge",
    defaultColSpan: 12,
    component: EmployeeStatusWidget,
  },
  pending_requests: {
    type: "pending_requests",
    title: "مركز الطلبات المعلقة والموافقات",
    category: "requests",
    description: "متابعة طلبات الإجازات والسلف والاستئذان مع توضيح العاجل والمتأخر وزر لمركز الموافقات.",
    icon: "pending_actions",
    defaultColSpan: 6,
    component: PendingRequestsWidget,
  },
  department_distribution: {
    type: "department_distribution",
    title: "توزيع الموظفين حسب الأقسام",
    category: "analytics",
    description: "قائمة ترتيب الأقسام تنازلياً مع أشرطة التقدم والنسب وإمكانية عرض الكل.",
    icon: "domain",
    defaultColSpan: 6,
    component: DepartmentDistributionWidget,
  },
  job_levels: {
    type: "job_levels",
    title: "توزيع المستويات الوظيفية",
    category: "analytics",
    description: "رسم بياني تفاعلي يوضح توزيع الكوادر حسب المستويات القيادية والإشرافية والتنفيذية.",
    icon: "stacked_bar_chart",
    defaultColSpan: 6,
    availableChartTypes: ["bar", "horizontal_bar", "pie"],
    component: JobLevelWidget,
  },
  nationalities: {
    type: "nationalities",
    title: "الجنسيات ومؤشر السعودة والتوطين",
    category: "analytics",
    description: "إحصائية جنسيات الموظفين مع رسم Donut تفاعلي لمعدل التوطين والسعودة.",
    icon: "public",
    defaultColSpan: 6,
    availableChartTypes: ["donut", "pie", "bar"],
    component: NationalitiesWidget,
  },
  job_categories: {
    type: "job_categories",
    title: "توزيع الفئات الوظيفية",
    category: "analytics",
    description: "تصنيف الموظفين حسب الفئات (إداري، تقني، تشغيلي، عمالة، تعليمي).",
    icon: "category",
    defaultColSpan: 6,
    component: JobCategoryWidget,
  },
  sectors: {
    type: "sectors",
    title: "توزيع القطاعات الوظيفية",
    category: "analytics",
    description: "توزيع الكوادر حسب القطاعات التنظيمية الكبرى.",
    icon: "lan",
    defaultColSpan: 6,
    component: SectorDistributionWidget,
  },
  payroll_summary: {
    type: "payroll_summary",
    title: "ملخص الأجور ومسيرات الرواتب",
    category: "finance",
    description: "إجمالي الأجور، صافي المستحق، الاستقطاعات، ومتوسط الراتب.",
    icon: "payments",
    defaultColSpan: 12,
    component: PayrollSummaryWidget,
  },
  data_explorer: {
    type: "data_explorer",
    title: "مستكشف البيانات التحليلي",
    category: "analytics",
    description: "جدول تحليلي متقدم متعدد الأبعاد مع دعم البحث والفرز والترقيم وتصدير Excel و CSV.",
    icon: "table_chart",
    defaultColSpan: 12,
    component: DataExplorerWidget,
  },
};
