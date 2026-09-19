import * as XLSX from "xlsx";
import { toast } from "sonner";

export interface ExportColumn {
  header: string;
  key: string;
  format?: ((value: any) => string | number) | undefined;
}

function sanitizeValue(val: any): any {
  if (val === null || val === undefined) return "—";
  if (typeof val === "string") {
    // CSV / Excel Formula Injection Protection (neutralize =, +, -, @, etc.)
    if (/^\s*[=+\-@\t\r\n]/.test(val)) {
      return `'${val}`;
    }
    return val;
  }
  return val;
}

/**
 * Export array of objects to Excel (.xlsx) file
 */
export function exportToExcel<T extends Record<string, any>>(
  filename: string,
  data: T[],
  columns?: ExportColumn[],
  sheetName: string = "بيانات التقرير"
) {
  try {
    if (!data || data.length === 0) {
      toast.error("لا توجد بيانات متاحة للتصدير");
      return;
    }

    let rows: Record<string, any>[];

    if (columns && columns.length > 0) {
      rows = data.map((item) => {
        const row: Record<string, any> = {};
        columns.forEach((col) => {
          const val = item[col.key];
          const formatted = col.format ? col.format(val) : val;
          row[col.header] = sanitizeValue(formatted);
        });
        return row;
      });
    } else {
      rows = data.map((item) => {
        const sanitizedItem: Record<string, any> = {};
        for (const [k, v] of Object.entries(item)) {
          sanitizedItem[k] = sanitizeValue(v);
        }
        return sanitizedItem;
      });
    }

    const worksheet = XLSX.utils.json_to_sheet(rows);

    // Set right-to-left flag for Arabic worksheets
    worksheet["!views"] = [{ rightToLeft: true }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    const safeFilename = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
    XLSX.writeFile(workbook, safeFilename);
    toast.success(`تم تصدير ملف Excel بنجاح: ${safeFilename}`);
  } catch (error) {
    console.error("Failed to export Excel:", error);
    toast.error("تعذر تصدير ملف Excel");
  }
}

/**
 * Export array of objects to CSV file
 */
export function exportToCsv<T extends Record<string, any>>(
  filename: string,
  data: T[],
  columns?: ExportColumn[]
) {
  try {
    if (!data || data.length === 0) {
      toast.error("لا توجد بيانات متاحة للتصدير");
      return;
    }

    let rows: Record<string, any>[];

    if (columns && columns.length > 0) {
      rows = data.map((item) => {
        const row: Record<string, any> = {};
        columns.forEach((col) => {
          const val = item[col.key];
          const formatted = col.format ? col.format(val) : val;
          row[col.header] = sanitizeValue(formatted);
        });
        return row;
      });
    } else {
      rows = data.map((item) => {
        const sanitizedItem: Record<string, any> = {};
        for (const [k, v] of Object.entries(item)) {
          sanitizedItem[k] = sanitizeValue(v);
        }
        return sanitizedItem;
      });
    }

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(worksheet);

    // Add BOM for proper UTF-8 Arabic rendering in Excel
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeFilename = filename.endsWith(".csv") ? filename : `${filename}.csv`;

    link.setAttribute("href", url);
    link.setAttribute("download", safeFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`تم تصدير ملف CSV بنجاح: ${safeFilename}`);
  } catch (error) {
    console.error("Failed to export CSV:", error);
    toast.error("تعذر تصدير ملف CSV");
  }
}
