import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { MaterialIcon } from "@/components/MaterialIcon";
import { Btn, Chip } from "@/components/hr/ui";
import {
  Table as ShadcnTable,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Input as ShadcnInput } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  useDeleteRow,
  useRows,
  useSaveRow,
  type HrTable,
  type Row,
  type RowFilters,
} from "@/lib/hr-db";

export type FieldDef = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "select" | "checkbox" | "textarea";
  options?: string[];
  required?: boolean;
  /** hide from the table, keep in the form */
  formOnly?: boolean;
  /** hide from the form, keep in the table */
  tableOnly?: boolean;
  render?: (row: Row) => ReactNode;
};

const control =
  "h-10 w-full rounded-xl border border-input bg-background px-3 text-[13px] font-semibold outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/25";

const statusTone = (v: string): "green" | "amber" | "teal" | "muted" | "blue" => {
  if (["نشط", "معتمدة", "معتمد", "مسددة", "مقفل", "حاضر"].includes(v)) return "green";
  if (["بانتظار الموافقة", "جديد", "مسودة", "متأخر"].includes(v)) return "amber";
  if (["قيد المعالجة", "قيد السداد"].includes(v)) return "blue";
  if (["مرفوضة", "مرفوض", "موقوف", "غائب", "منتهي الخدمة"].includes(v)) return "muted";
  return "teal";
};

export function CrudTable({
  table,
  title,
  fields,
  addLabel = "إضافة سجل",
  searchKeys,
  orderBy,
  ascending,
  filters,
  toolbarExtra,
}: {
  table: HrTable;
  title: string;
  fields: FieldDef[];
  addLabel?: string;
  searchKeys?: string[];
  orderBy?: string;
  ascending?: boolean;
  /** fixed column values: used to scope the list and stamped on new rows */
  filters?: RowFilters;
  toolbarExtra?: ReactNode;
}) {
  const {
    data: rows = [],
    isLoading,
    error,
  } = useRows(table, {
    ...(orderBy ? { orderBy } : {}),
    ...(ascending === undefined ? {} : { ascending }),
    ...(filters ? { filters } : {}),
  });
  const save = useSaveRow(table);
  const del = useDeleteRow(table);
  const [draft, setDraft] = useState<Row | null>(null);
  const [term, setTerm] = useState("");

  const tableFields = fields.filter((f) => !f.formOnly);
  const formFields = fields.filter((f) => !f.tableOnly);
  const keys = searchKeys ?? fields.map((f) => f.key);

  const filtered = useMemo(() => {
    const t = term.trim();
    if (!t) return rows;
    return rows.filter((r) => keys.some((k) => String(r[k] ?? "").includes(t)));
  }, [rows, term, keys]);

  const openNew = () => {
    const blank: Row = {};
    for (const f of formFields)
      blank[f.key] = f.type === "checkbox" ? false : f.type === "number" ? 0 : "";
    setDraft({ ...blank, ...(filters ?? {}) });
  };

  const submit = async () => {
    const missing = formFields.find((f) => f.required && !String(draft?.[f.key] ?? "").trim());
    if (missing) return;
    await save.mutateAsync(draft as Row);
    setDraft(null);
  };

  return (
    <>
      <div
        className="mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-xs"
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-5 py-3.5">
          <h2 className="me-auto flex items-center gap-2 text-sm font-bold text-foreground">
            <span className="grid size-7 place-items-center rounded-xl bg-primary/10 text-primary">
              <MaterialIcon name="table_rows" size={17} filled />
            </span>
            {title}
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-mono font-bold text-muted-foreground border border-border">
              {rows.length}
            </span>
          </h2>
          {toolbarExtra}
          <div className="relative">
            <ShadcnInput
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="ابحث..."
              className="h-9 w-48 pe-9 rounded-xl text-xs bg-background border-input"
            />
            <MaterialIcon
              name="search"
              size={17}
              className="pointer-events-none absolute inset-y-0 left-3 my-auto h-fit text-muted-foreground"
            />
          </div>
          <Btn icon="add" onClick={openNew}>
            {addLabel}
          </Btn>
        </div>

        <div className="overflow-x-auto">
          <ShadcnTable className="w-full min-w-max border-collapse text-right text-[12px]">
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50 border-b border-border">
                {tableFields.map((f) => (
                  <TableHead
                    key={f.key}
                    className="whitespace-nowrap px-4 py-3 font-extrabold text-foreground text-right"
                  >
                    {f.label}
                  </TableHead>
                ))}
                <TableHead className="whitespace-nowrap px-4 py-3 font-extrabold text-foreground text-center w-24">
                  إجراءات
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(isLoading || error || filtered.length === 0) && (
                <TableRow>
                  <TableCell
                    colSpan={tableFields.length + 1}
                    className="px-4 py-14 text-center text-sm font-semibold text-muted-foreground"
                  >
                    {isLoading
                      ? "جارٍ تحميل البيانات..."
                      : error
                        ? "تعذر تحميل البيانات"
                        : "لا توجد بيانات"}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((r) => (
                <TableRow
                  key={String(r["id"])}
                  className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
                >
                  {tableFields.map((f) => (
                    <TableCell
                      key={f.key}
                      className="whitespace-nowrap px-4 py-3 text-[13px] font-medium text-foreground"
                    >
                      {f.render ? (
                        f.render(r)
                      ) : f.type === "checkbox" ? (
                        r[f.key] ? (
                          <MaterialIcon
                            name="check_circle"
                            size={18}
                            className="text-emerald-600 dark:text-emerald-400"
                            filled
                          />
                        ) : (
                          <span className="inline-block size-3.5 rounded border border-border bg-secondary" />
                        )
                      ) : f.key === "status" ? (
                        <Chip label={String(r[f.key] ?? "")} tone={statusTone(String(r[f.key]))} />
                      ) : f.type === "number" ? (
                        <span className="font-mono">{new Intl.NumberFormat("en-US").format(Number(r[f.key] ?? 0))}</span>
                      ) : (
                        String(r[f.key] ?? "—")
                      )}
                    </TableCell>
                  ))}
                  <TableCell className="whitespace-nowrap px-4 py-3 text-center">
                    <span className="flex items-center justify-center gap-1">
                      <button
                        title="تعديل"
                        type="button"
                        onClick={() => setDraft({ ...r })}
                        className="grid size-8 place-items-center rounded-lg bg-secondary text-primary transition-colors hover:bg-primary/15 cursor-pointer"
                      >
                        <MaterialIcon name="edit" size={16} />
                      </button>
                      <button
                        title="حذف"
                        type="button"
                        onClick={() => {
                          if (confirm("هل تريد حذف هذا السجل نهائياً؟"))
                            del.mutate(String(r["id"]));
                        }}
                        className="grid size-8 place-items-center rounded-lg bg-secondary text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive cursor-pointer"
                      >
                        <MaterialIcon name="delete" size={16} />
                      </button>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </ShadcnTable>
        </div>
      </div>

      <Dialog open={Boolean(draft)} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-w-3xl rounded-2xl p-6 bg-card border-border shadow-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-base font-black text-foreground">
              <span className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary">
                <MaterialIcon
                  name={draft?.["id"] ? "edit" : "add_circle"}
                  size={18}
                  filled
                />
              </span>
              <span>{draft?.["id"] ? "تعديل سجل" : addLabel}</span>
            </DialogTitle>
          </DialogHeader>

          {draft && (
            <div className="grid gap-4 py-4 sm:grid-cols-2 xl:grid-cols-3">
              {formFields.map((f) => (
                <label
                  key={f.key}
                  className={f.type === "textarea" ? "sm:col-span-2 xl:col-span-3 space-y-1.5" : "block space-y-1.5"}
                >
                  <span className="flex items-center gap-1 text-[12px] font-bold text-foreground">
                    {f.label}
                    {f.required && <span className="text-destructive font-black">*</span>}
                  </span>
                  {f.type === "select" ? (
                    <div className="relative">
                      <select
                        className="h-10 w-full rounded-xl border border-input bg-background pe-9 ps-3.5 text-[13px] font-medium text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
                        value={String(draft[f.key] ?? "")}
                        onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                      >
                        <option value="">اختر ....</option>
                        {(f.options ?? []).map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                      <MaterialIcon
                        name="arrow_drop_down"
                        size={20}
                        className="pointer-events-none absolute inset-y-0 left-2.5 my-auto h-fit text-muted-foreground"
                      />
                    </div>
                  ) : f.type === "checkbox" ? (
                    <span className="flex h-10 items-center gap-2 rounded-xl border border-input bg-background px-3 cursor-pointer">
                      <Checkbox
                        id={`chk-${f.key}`}
                        className="size-4"
                        checked={Boolean(draft[f.key])}
                        onCheckedChange={(c) => setDraft({ ...draft, [f.key]: c === true })}
                      />
                      <label htmlFor={`chk-${f.key}`} className="text-[12px] font-semibold text-muted-foreground cursor-pointer">
                        مفعّل
                      </label>
                    </span>
                  ) : f.type === "textarea" ? (
                    <Textarea
                      rows={3}
                      className="rounded-xl border-input bg-background text-[13px] font-medium text-foreground"
                      value={String(draft[f.key] ?? "")}
                      onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                    />
                  ) : (
                    <ShadcnInput
                      type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                      className={cn(
                        "h-10 rounded-xl border-input bg-background text-[13px] font-medium text-foreground",
                        (f.type === "number" || f.type === "date") && "font-mono"
                      )}
                      value={String(draft[f.key] ?? "")}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value,
                        })
                      }
                    />
                  )}
                </label>
              ))}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 pt-3 border-t border-border">
            <Btn icon="save" onClick={submit} disabled={save.isPending}>
              {save.isPending ? "جارٍ الحفظ..." : "حفظ التغييرات"}
            </Btn>
            <Btn icon="close" variant="ghost" onClick={() => setDraft(null)}>
              إلغاء
            </Btn>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
