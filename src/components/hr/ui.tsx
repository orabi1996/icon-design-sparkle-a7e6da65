import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { MaterialIcon } from "@/components/MaterialIcon";
import { Button } from "@/components/ui/button";
import {
  Card as ShadcnCard,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Input as ShadcnInput } from "@/components/ui/input";
import { Badge as ShadcnBadge } from "@/components/ui/badge";
import {
  Table as ShadcnTable,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Checkbox as ShadcnCheckbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function Breadcrumbs({ trail }: { trail: string[] }) {
  return (
    <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[12px] font-medium text-muted-foreground mb-3">
      <Link
        to="/"
        className="flex items-center gap-1 rounded-full px-2 py-0.5 text-muted-foreground hover:bg-secondary hover:text-primary transition-colors"
      >
        <MaterialIcon name="home" size={16} />
        <span>الرئيسية</span>
      </Link>
      {trail.map((t, i) => (
        <span key={t} className="flex items-center gap-1.5">
          <MaterialIcon name="chevron_left" size={16} className="text-muted-foreground/60 rtl:rotate-0" />
          <span
            className={cn(
              "rounded-lg px-2 py-0.5 transition-colors",
              i === trail.length - 1
                ? "bg-primary/10 font-bold text-primary dark:bg-primary/20"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t}
          </span>
        </span>
      ))}
    </nav>
  );
}

export function PageBanner({
  title,
  subtitle,
  icon,
  actions,
}: {
  title: string;
  subtitle?: string;
  icon: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-4 rounded-2xl bg-gradient-to-l from-[#0b57d0] via-[#004e82] to-[#0842a0] p-5 text-white shadow-[0_4px_20px_0_rgba(11,87,208,0.22)] border border-white/10">
      <span className="grid size-12 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur-md shrink-0 shadow-xs">
        <MaterialIcon name={icon} size={26} filled />
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="text-lg font-black tracking-tight md:text-xl text-white">{title}</h1>
        {subtitle && <p className="text-[12px] font-medium text-white/80 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="ms-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  icon,
  actions,
  children,
  padded = true,
  className,
}: {
  title?: string;
  icon?: string;
  actions?: ReactNode;
  children: ReactNode;
  padded?: boolean;
  className?: string;
}) {
  return (
    <ShadcnCard className={cn("overflow-hidden rounded-2xl border-border bg-card shadow-xs transition-shadow hover:shadow-md", className)}>
      {title && (
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border/80 bg-muted/30 px-6 py-4">
          <CardTitle className="flex items-center gap-2.5 text-sm font-bold text-card-foreground">
            {icon && (
              <span className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary dark:bg-primary/20">
                <MaterialIcon name={icon} size={18} filled />
              </span>
            )}
            <span>{title}</span>
          </CardTitle>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </CardHeader>
      )}
      <CardContent className={cn(padded ? "p-6" : "p-0")}>{children}</CardContent>
    </ShadcnCard>
  );
}

export function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children?: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center gap-1 text-[12px] font-bold text-foreground">
        {label}
        {required && <span className="text-destructive font-black">*</span>}
      </span>
      {children ?? <Input />}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <ShadcnInput
      {...props}
      className={cn(
        "h-10 rounded-xl border-input bg-background px-3.5 text-[13px] font-medium text-foreground transition-all focus-visible:ring-2 focus-visible:ring-primary/20",
        props.className
      )}
    />
  );
}

export function Select({
  options = ["اختر ...."],
  value,
  onChange,
  className,
}: {
  options?: string[];
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  className?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className={cn(
          "h-10 w-full rounded-xl border border-input bg-background pe-9 ps-3.5 text-[13px] font-medium text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        defaultValue={value ? undefined : options[0]}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <MaterialIcon
        name="arrow_drop_down"
        size={22}
        className="pointer-events-none absolute inset-y-0 left-2.5 my-auto h-fit text-muted-foreground"
      />
    </div>
  );
}

export function DateInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <ShadcnInput
      type="date"
      {...props}
      className={cn(
        "h-10 rounded-xl border-input bg-background px-3.5 text-[13px] font-medium font-mono text-foreground transition-all focus-visible:ring-2 focus-visible:ring-primary/20",
        props.className
      )}
    />
  );
}

export function Btn({
  children,
  icon,
  variant = "primary",
  onClick,
  type = "button",
  className,
  disabled,
}: {
  children?: ReactNode;
  icon?: string;
  variant?: "primary" | "ghost" | "soft" | "teal" | "onDark" | "destructive";
  onClick?: () => void;
  type?: "button" | "submit";
  className?: string;
  disabled?: boolean;
}) {
  const customVariantStyles: Record<string, string> = {
    primary: "bg-[#0b57d0] text-white hover:bg-[#0842a0] shadow-xs active:scale-[0.99]",
    teal: "bg-[#d3e3fd] text-[#041e49] hover:bg-[#c2e7ff] dark:bg-blue-950 dark:text-blue-300",
    soft: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    ghost: "border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
    onDark: "bg-white/20 text-white ring-1 ring-white/30 hover:bg-white/30 backdrop-blur-xs",
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-xs",
  };

  return (
    <Button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-9.5 px-4 rounded-xl text-xs font-black transition-all gap-1.5 cursor-pointer",
        customVariantStyles[variant] || customVariantStyles["primary"],
        className
      )}
    >
      {icon && <MaterialIcon name={icon} size={17} />}
      {children}
    </Button>
  );
}

export function TableToolbar({ title }: { title: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/20 px-5 py-3.5">
      <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
        <span className="grid size-7 place-items-center rounded-xl bg-primary/10 text-primary">
          <MaterialIcon name="table_rows" size={16} filled />
        </span>
        {title}
      </h2>
      <div className="flex items-center gap-2">
        <div className="relative">
          <ShadcnInput
            placeholder="ابحث..."
            className="h-8.5 w-52 rounded-xl pe-9 ps-3 text-xs bg-background border-input"
          />
          <MaterialIcon
            name="search"
            size={16}
            className="pointer-events-none absolute inset-y-0 left-3 my-auto h-fit text-muted-foreground"
          />
        </div>
        {[
          { icon: "picture_as_pdf", label: "PDF" },
          { icon: "table_view", label: "Excel" },
          { icon: "print", label: "طباعة" },
        ].map((b) => (
          <button
            key={b.label}
            title={b.label}
            type="button"
            className="grid size-8.5 place-items-center rounded-xl border border-input bg-background text-muted-foreground shadow-2xs hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
          >
            <MaterialIcon name={b.icon} size={17} />
          </button>
        ))}
      </div>
    </div>
  );
}

export function DataTable({
  columns,
  rows,
  render,
  empty = "لا توجد بيانات",
}: {
  columns: string[];
  rows: Record<string, ReactNode>[];
  render?: (row: Record<string, ReactNode>, col: string) => ReactNode;
  empty?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <ShadcnTable className="w-full min-w-max border-collapse text-right text-[12px]">
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50 border-b border-border">
            {columns.map((c) => (
              <TableHead
                key={c}
                className="whitespace-nowrap px-4 py-3 font-extrabold text-foreground text-right"
              >
                <span className="flex items-center gap-1.5">
                  {c}
                  <MaterialIcon name="unfold_more" size={14} className="text-muted-foreground/60" />
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="px-4 py-14 text-center text-sm font-medium text-muted-foreground"
              >
                <div className="flex flex-col items-center justify-center gap-2">
                  <span className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
                    <MaterialIcon name="folder_open" size={24} />
                  </span>
                  <span>{empty}</span>
                </div>
              </TableCell>
            </TableRow>
          )}
          {rows.map((r, i) => (
            <TableRow
              key={i}
              className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
            >
              {columns.map((c) => (
                <TableCell key={c} className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                  {render ? render(r, c) : r[c]}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </ShadcnTable>
    </div>
  );
}

export function Pager({
  page = 1,
  pages = 1,
  total = 0,
}: {
  page?: number;
  pages?: number;
  total?: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/20 px-6 py-3.5 text-[12px] font-bold">
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground me-2">الصفوف لكل صفحة:</span>
        {[5, 10, 20].map((n) => (
          <button
            key={n}
            type="button"
            className={cn(
              "grid size-8 place-items-center rounded-lg text-xs font-mono font-bold transition-all cursor-pointer",
              n === 10
                ? "bg-[#0b57d0] text-white shadow-2xs"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="me-2 text-muted-foreground font-mono">
          صفحة {page} من {pages} ({total} عنصر)
        </span>
        <button
          type="button"
          className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
        >
          <MaterialIcon name="chevron_right" size={18} />
        </button>
        {Array.from({ length: Math.min(pages, 4) }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            className={cn(
              "grid size-8 place-items-center rounded-lg text-xs font-mono font-bold transition-all cursor-pointer",
              n === page
                ? "bg-primary/15 text-primary border border-primary/30"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
        >
          <MaterialIcon name="chevron_left" size={18} />
        </button>
      </div>
    </div>
  );
}

export function Chip({
  label,
  tone = "blue",
  className,
}: {
  label: string;
  tone?: "blue" | "green" | "amber" | "teal" | "muted" | "red";
  className?: string;
}) {
  const tones: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
    amber: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800",
    teal: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800",
    muted: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    red: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800",
  };
  return (
    <ShadcnBadge
      variant="outline"
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-[11px] font-bold border transition-colors",
        tones[tone] || tones["blue"],
        className
      )}
    >
      {label}
    </ShadcnBadge>
  );
}

export function Check({
  label,
  hint,
  defaultChecked,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  const checkboxProps: Record<string, any> = {};
  if (defaultChecked !== undefined) checkboxProps["defaultChecked"] = defaultChecked;
  if (checked !== undefined) checkboxProps["checked"] = checked;
  if (onChange) {
    checkboxProps["onCheckedChange"] = (c: boolean | "indeterminate") => onChange(c === true);
  }

  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-card p-4 transition-all hover:border-primary hover:shadow-xs">
      <ShadcnCheckbox
        {...checkboxProps}
        className="mt-0.5"
      />
      <span>
        <span className="block text-[13px] font-bold text-foreground">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] font-medium text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

export function Fieldset({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card/60 p-6 shadow-xs">
      <h3 className="mb-4 flex items-center gap-2 text-[13px] font-extrabold text-foreground">
        <span className="grid size-6 place-items-center rounded-full bg-primary text-[11px] font-mono font-bold text-primary-foreground">
          {index}
        </span>
        {title}
      </h3>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
    </section>
  );
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn("rounded-2xl p-6 bg-card border-border", wide ? "max-w-3xl" : "max-w-xl")}>
        <DialogHeader>
          <DialogTitle className="text-base font-black text-foreground">{title}</DialogTitle>
        </DialogHeader>
        <div className="py-2">{children}</div>
        {footer && <DialogFooter className="gap-2 sm:gap-0">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}