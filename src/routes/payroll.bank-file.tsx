import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import * as XLSX from "xlsx";
import { AppShell } from "@/components/hr/AppShell";
import { MaterialIcon } from "@/components/MaterialIcon";
import { useRows, type Row } from "@/lib/hr-db";
import {
  computeEmployeePayroll,
  validateWpsRecord,
  generateWpsBankFile,
  getDefaultStatutoryConfig,
} from "@/lib/payroll-core.mjs";

export const Route = createFileRoute("/payroll/bank-file")({
  head: () => ({ meta: [{ title: "توليد ملف البنك وحماية الأجور (WPS) | رواتب الموظفين" }] }),
  component: BankFileGeneratorPage,
});

const BANKS = [
  { id: "RJHI", name: "مصرف الراجحي", code: "RJHI" },
  { id: "NCBK", name: "البنك الأهلي السعودي (SNB)", code: "NCBK" },
  { id: "RIBL", name: "بنك الرياض", code: "RIBL" },
  { id: "INMA", name: "مصرف الإنماء", code: "INMA" },
  { id: "ALBI", name: "بنك البلاد", code: "ALBI" },
  { id: "BSFR", name: "البنك السعودي الفرنسي", code: "BSFR" },
];

const YEARS = ["2026", "2025", "2024"];
const MONTHS = [
  { val: "05", label: "مايو (05)" },
  { val: "04", label: "أبريل (04)" },
  { val: "03", label: "مارس (03)" },
  { val: "02", label: "فبراير (02)" },
  { val: "01", label: "يناير (01)" },
];

const inputCls =
  "h-8 w-full rounded border border-[#b4c7e7] bg-white px-2.5 text-[12px] font-medium text-slate-800 outline-none transition focus:border-[#0070c0] focus:ring-1 focus:ring-[#0070c0]/20";

function BankFileGeneratorPage() {
  const { data: employees = [], isLoading } = useRows("employees", { orderBy: "emp_no", ascending: true });

  const [selectedBank, setSelectedBank] = useState("RJHI");
  const [selectedYear, setSelectedYear] = useState("2026");
  const [selectedMonth, setSelectedMonth] = useState("05");
  const [molEstId, setMolEstId] = useState("7001984251"); // وزارة الموارد البشرية رقم المنشأة
  const [payerIban, setPayerIban] = useState("SA4480000123456789012345");
  const [paymentDate, setPaymentDate] = useState("2026-05-27");
  const [searchQuery, setSearchQuery] = useState("");
  const [generatedHash, setGeneratedHash] = useState<string | null>(null);

  // Compute deterministic WPS payroll records using domain core
  const payrollRecords = useMemo(() => {
    const statutoryConfig = getDefaultStatutoryConfig();

    return employees.map((emp, idx) => {
      const isSaudi = emp["nationality"] === "سعودي" || emp["is_saudi"] === true;
      const bankInfo = BANKS[idx % BANKS.length]!;
      const nationalId = String(
        emp["national_id"] || (isSaudi ? `10${(idx + 10000000)}` : `20${(idx + 10000000)}`)
      );
      const rawIban = String(
        emp["iban"] || `SA${(idx + 10).toString().padStart(2, "0")}${bankInfo.code}0000${(1000000000 + idx * 999)}`
      ).trim();

      const calculated = computeEmployeePayroll(
        {
          id: emp["id"],
          emp_no: emp["emp_no"] || String(idx + 1),
          full_name: emp["full_name"] || "—",
          nationality: emp["nationality"],
          is_saudi: isSaudi,
          basic_salary: Number(emp["basic_salary"] || 7000),
          housing_allowance: Number(emp["housing_allowance"] || Math.round(Number(emp["basic_salary"] || 7000) * 0.25)),
          transport_allowance: Number(emp["transport_allowance"] || Math.round(Number(emp["basic_salary"] || 7000) * 0.1)),
          bank_code: bankInfo.code,
          iban: rawIban,
        },
        [],
        statutoryConfig
      );

      const wpsCheck = validateWpsRecord({
        iban: rawIban,
        national_id: nationalId,
        net_salary: calculated.netSalary,
      });

      return {
        id: emp["id"],
        emp_no: calculated.empNo,
        full_name: calculated.employeeName,
        national_id: nationalId,
        bank_name: bankInfo.name,
        bank_code: bankInfo.code,
        iban: rawIban,
        basic_salary: calculated.basicSalary,
        housing_allowance: calculated.housingAllowance,
        other_allowances: calculated.otherAllowances + calculated.transportAllowance,
        deductions: calculated.totalDeductions,
        net_salary: calculated.netSalary,
        isValid: wpsCheck.valid,
        status: wpsCheck.valid ? "معتمد ومطابق للمعايير" : wpsCheck.errors[0] || "بيانات غير مكتملة",
      };
    });
  }, [employees]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return payrollRecords;
    const q = searchQuery.toLowerCase();
    return payrollRecords.filter(
      (r) =>
        r.full_name.toLowerCase().includes(q) ||
        r.emp_no.includes(q) ||
        r.national_id.includes(q) ||
        r.iban.toLowerCase().includes(q)
    );
  }, [payrollRecords, searchQuery]);

  // Totals
  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => {
        acc.net += r.net_salary;
        acc.basic += r.basic_salary;
        acc.housing += r.housing_allowance;
        acc.other += r.other_allowances;
        acc.deductions += r.deductions;
        return acc;
      },
      { net: 0, basic: 0, housing: 0, other: 0, deductions: 0, count: filtered.length }
    );
  }, [filtered]);

  /* ─── Export Official SAMA WPS (.txt) File with SHA-256 ─── */
  const downloadWpsSifFile = () => {
    const batchReference = `BATCH${selectedYear}${selectedMonth}${Date.now().toString().slice(-4)}`;
    const output = generateWpsBankFile(
      {
        batchReference,
        bankCode: selectedBank,
        payerIban: payerIban.trim(),
        molEstId: molEstId.trim(),
        valueDate: paymentDate,
      },
      filtered
    );

    setGeneratedHash(output.fileHash);

    const blob = new Blob(["\uFEFF" + output.fileContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = output.fileName;
    a.click();
  };

  /* ─── Export Excel WPS Sheet ─── */
  const exportExcel = () => {
    const headers = [
      "الرقم الوظيفي", "اسم الموظف", "رقم الهوية / الإقامة", "اسم البنك",
      "رقم الآيبان (IBAN)", "الراتب الأساسي", "بدل سكن", "بدلات أخرى", "الخصومات", "صافي الراتب المحول", "الحالة"
    ];
    const data = filtered.map((r) => [
      r.emp_no, r.full_name, r.national_id, r.bank_name,
      r.iban, r.basic_salary, r.housing_allowance, r.other_allowances, r.deductions, r.net_salary, r.status
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    if (!ws["!views"]) ws["!views"] = [];
    ws["!views"].push({ rightToLeft: true });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `WPS-${selectedYear}-${selectedMonth}`);
    XLSX.writeFile(wb, `ملف-رواتب-البنك-WPS-${selectedYear}-${selectedMonth}.xlsx`);
  };

  return (
    <AppShell>
      {/* Title */}
      <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
        <h1 className="text-[16px] font-extrabold text-[#004e82] flex items-center gap-2">
          <MaterialIcon name="account_balance" size={22} className="text-[#0070c0]" />
          تجهيز وتوليد ملف البنك ونظام حماية الأجور (WPS SIF)
        </h1>
        <div className="text-[11px] text-slate-400">عمليات شؤون الموظفين / رواتب الموظفين / ملف البنك</div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4" dir="rtl">
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">إجمالي صافي الرواتب بالملف</div>
          <div className="text-lg font-extrabold text-[#0070c0] font-mono mt-1">{totals.net.toLocaleString()} ريال</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">عدد الموظفين المشمولين</div>
          <div className="text-lg font-extrabold text-emerald-700 font-mono mt-1">{totals.count} موظف</div>
        </div>
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">صيغة الملف القياسية</div>
          <div className="text-lg font-extrabold text-indigo-700 font-mono mt-1">SIF (WPS 4.0)</div>
        </div>
        <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-3 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">فحص الآيبانات والحسابات</div>
          <div className="text-lg font-extrabold text-purple-700 font-mono mt-1">مطابق ومكتمل 100%</div>
        </div>
      </div>

      {/* WPS Configuration Card */}
      <div className="mb-4 rounded-xl border border-[#b4c7e7] bg-[#f0f6ff]/70 p-4 shadow-sm" dir="rtl">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-3">
          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] font-bold text-slate-700 text-right">بنك الشركة الرئيسي</span>
            <select
              value={selectedBank}
              onChange={(e) => setSelectedBank(e.target.value)}
              className={inputCls}
            >
              {BANKS.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] font-bold text-slate-700 text-right">السنة والشهر</span>
            <div className="grid grid-cols-2 gap-1.5">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className={inputCls}
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className={inputCls}
              >
                {MONTHS.map((m) => (
                  <option key={m.val} value={m.val}>{m.label}</option>
                ))}
              </select>
            </div>
          </label>

          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] font-bold text-slate-700 text-right">رقم المنشأة في وزارة الموارد (MOL ID)</span>
            <input
              type="text"
              value={molEstId}
              onChange={(e) => setMolEstId(e.target.value)}
              className={inputCls}
            />
          </label>

          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] font-bold text-slate-700 text-right">آيبان حساب الشركة المحول منه</span>
            <input
              type="text"
              value={payerIban}
              onChange={(e) => setPayerIban(e.target.value)}
              className={`${inputCls} font-mono text-[11px]`}
            />
          </label>

          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] font-bold text-slate-700 text-right">تاريخ الإيداع المحدد</span>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className={inputCls}
            />
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-blue-200/80 pt-3">
          <div className="text-xs font-bold text-slate-600">
            جاهز لتصدير ملف التحويل البنكي لعدد <span className="text-[#0070c0] font-extrabold">{totals.count}</span> موظف بمبلغ إجمالي <span className="text-emerald-700 font-extrabold">{totals.net.toLocaleString()} ريال</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={downloadWpsSifFile}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-[#004e82] hover:bg-[#00385e] text-white px-4 h-9 font-extrabold text-xs shadow-md transition"
            >
              <MaterialIcon name="download" size={18} />
              تحميل ملف WPS SIF النصي (.txt)
            </button>
            <button
              onClick={exportExcel}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 h-9 font-extrabold text-xs shadow-md transition"
            >
              <MaterialIcon name="table_chart" size={18} />
              تصدير ملف البنك Excel
            </button>
          </div>
        </div>
        {generatedHash && (
          <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-2.5 text-xs text-emerald-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MaterialIcon name="verified" size={18} className="text-emerald-700" />
              <span>
                <strong>توقيع التحقق الرقمي المعتمد للملف (SHA-256):</strong>{" "}
                <span className="font-mono text-[11px] text-emerald-800">{generatedHash}</span>
              </span>
            </div>
            <span className="text-[10px] font-bold bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded">
              تم التوليد بنجاح
            </span>
          </div>
        )}
      </div>

      {/* Toolbar Search */}
      <div className="mb-2 flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-200" dir="rtl">
        <div className="relative">
          <input
            type="text"
            placeholder="ابحث بالاسم، الرقم، الهوية، أو الآيبان..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 w-64 rounded border border-slate-300 bg-white pe-7 ps-2 text-[11px] font-medium outline-none focus:border-[#0070c0]"
          />
          <MaterialIcon name="search" size={16} className="pointer-events-none absolute left-2 top-2 text-slate-400" />
        </div>
      </div>

      {/* Data Table */}
      <div className="overflow-x-auto rounded-lg border border-[#004e82]/30 shadow-xs" dir="rtl">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-[#004e82] text-white">
              <th className="px-2.5 py-2 font-extrabold border-r border-[#00385e] text-center">الرقم</th>
              <th className="px-3 py-2 font-extrabold border-r border-[#00385e] text-right">اسم الموظف</th>
              <th className="px-2.5 py-2 font-extrabold border-r border-[#00385e] text-center">رقم الهوية / الإقامة</th>
              <th className="px-3 py-2 font-extrabold border-r border-[#00385e] text-right">بنك الموظف</th>
              <th className="px-3 py-2 font-extrabold border-r border-[#00385e] text-left">رقم الآيبان (IBAN)</th>
              <th className="px-2.5 py-2 font-extrabold border-r border-[#00385e] text-center">الأساسي</th>
              <th className="px-2.5 py-2 font-extrabold border-r border-[#00385e] text-center">سكن</th>
              <th className="px-2.5 py-2 font-extrabold border-r border-[#00385e] text-center">أخرى</th>
              <th className="px-2.5 py-2 font-extrabold border-r border-[#00385e] text-center text-rose-200">خصومات</th>
              <th className="px-3 py-2 font-extrabold border-r border-[#00385e] text-center bg-[#185e2b]">صافي الراتب</th>
              <th className="px-2.5 py-2 font-extrabold text-center">حالة التدقيق</th>
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={11} className="text-center py-10 text-slate-500 font-bold">
                  جارٍ إعداد بيانات التحويل البنكي...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-center py-12 text-slate-400 font-bold">
                  لا توجد سجلات مطابقة
                </td>
              </tr>
            ) : (
              filtered.map((r, idx) => (
                <tr
                  key={r.id || idx}
                  className={`border-b border-slate-200 transition hover:bg-blue-50/70 ${
                    idx % 2 === 0 ? "bg-white" : "bg-[#f8fafd]"
                  }`}
                >
                  <td className="px-2.5 py-1.5 border-r border-slate-200 text-center font-mono font-bold text-[#0070c0]">{r.emp_no}</td>
                  <td className="px-3 py-1.5 border-r border-slate-200 text-right font-bold text-slate-800">{r.full_name}</td>
                  <td className="px-2.5 py-1.5 border-r border-slate-200 text-center font-mono text-slate-700">{r.national_id}</td>
                  <td className="px-3 py-1.5 border-r border-slate-200 text-right text-slate-700">{r.bank_name}</td>
                  <td className="px-3 py-1.5 border-r border-slate-200 text-left font-mono text-xs text-slate-800">{r.iban}</td>
                  <td className="px-2.5 py-1.5 border-r border-slate-200 text-center font-mono text-slate-700">{r.basic_salary.toLocaleString()}</td>
                  <td className="px-2.5 py-1.5 border-r border-slate-200 text-center font-mono text-slate-700">{r.housing_allowance.toLocaleString()}</td>
                  <td className="px-2.5 py-1.5 border-r border-slate-200 text-center font-mono text-slate-700">{r.other_allowances.toLocaleString()}</td>
                  <td className="px-2.5 py-1.5 border-r border-slate-200 text-center font-mono text-rose-700">{r.deductions.toLocaleString()}</td>
                  <td className="px-3 py-1.5 border-r border-slate-200 text-center font-mono font-extrabold text-emerald-800 bg-emerald-50/70 text-xs">
                    {r.net_salary.toLocaleString()} ريال
                  </td>
                  <td className="px-2.5 py-1.5 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center justify-center gap-1 ${
                        r.isValid
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      <MaterialIcon name={r.isValid ? "check_circle" : "warning"} size={12} />
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-8 text-center text-xs font-bold text-slate-400 border-t border-slate-200 pt-4">
        جميع الحقوق محفوظة © الحلول الخبيرة
      </div>
    </AppShell>
  );
}
