"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ValueStateTone =
  | "editable"
  | "calculated"
  | "locked"
  | "policy"
  | "review";

const toneClasses: Record<ValueStateTone, string> = {
  editable: "border-emerald-200 bg-emerald-50 text-emerald-700",
  calculated: "border-slate-200 bg-slate-100 text-slate-700",
  locked: "border-amber-200 bg-amber-50 text-amber-800",
  policy: "border-blue-200 bg-blue-50 text-blue-700",
  review: "border-rose-200 bg-rose-50 text-rose-700",
};

type OfficeTone = "neutral" | "success" | "warning" | "danger" | "info";

const officeToneClasses: Record<OfficeTone, string> = {
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-rose-200 bg-rose-50 text-rose-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
};

export function ValueStatePill({
  tone,
  children,
  className,
}: {
  tone: ValueStateTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function WorkflowGuard({
  title,
  detail,
  actionLabel,
  actionHref,
}: {
  title: string;
  detail: string;
  actionLabel: string | null;
  actionHref: string | null;
}) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
      <p className="font-semibold">{title}</p>
      <p className="mt-2 leading-6">{detail}</p>
      {actionLabel && actionHref ? (
        <div className="mt-3">
          <Button asChild size="sm" variant="outline">
            <Link href={actionHref}>{actionLabel}</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function OfficeNotice({
  title,
  children,
  tone = "neutral",
  action,
  className,
}: {
  title?: string;
  children: ReactNode;
  tone?: OfficeTone;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3 text-sm",
        officeToneClasses[tone],
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {title ? <p className="font-semibold">{title}</p> : null}
          <div className={cn(title ? "mt-1.5" : "", "leading-6")}>{children}</div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}

export function OfficeEmptyState({
  title,
  detail,
  action,
  className,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center",
        className,
      )}
    >
      <p className="font-semibold text-slate-950">{title}</p>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">{detail}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function OfficeActionBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function OfficeFilterBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-slate-200 bg-slate-50 p-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function OfficeTableShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border border-slate-200 bg-white", className)}>
      {children}
    </div>
  );
}

export function OfficeNextActions({
  actions,
  className,
}: {
  actions: Array<{
    href: string;
    label: string;
    detail?: string;
  }>;
  className?: string;
}) {
  if (actions.length === 0) {
    return null;
  }

  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-3", className)}>
      {actions.map((action) => (
        <Link
          key={`${action.href}-${action.label}`}
          href={action.href}
          className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          <span className="font-semibold text-slate-950">{action.label}</span>
          {action.detail ? (
            <span className="mt-1 block leading-5 text-slate-600">{action.detail}</span>
          ) : null}
        </Link>
      ))}
    </div>
  );
}

export function ClassTabs({
  basePath,
  classOptions,
  activeClassId,
  query = {},
  allLabel = "All classes",
}: {
  basePath: string;
  classOptions: Array<{ id: string; label: string }>;
  activeClassId: string;
  query?: Record<string, string | null | undefined>;
  allLabel?: string;
}) {
  const buildHref = (classId: string) => {
    const params = new URLSearchParams();

    Object.entries(query).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    });

    if (classId) {
      params.set("classId", classId);
    } else {
      params.delete("classId");
    }

    const queryString = params.toString();
    return queryString ? `${basePath}?${queryString}` : basePath;
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href={buildHref("")}
        className={cn(
          "inline-flex items-center rounded-full border px-3 py-2 text-sm transition-colors",
          activeClassId
            ? "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
            : "border-slate-900 bg-slate-900 text-white",
        )}
      >
        {allLabel}
      </Link>
      {classOptions.map((item) => (
        <Link
          key={item.id}
          href={buildHref(item.id)}
          className={cn(
            "inline-flex items-center rounded-full border px-3 py-2 text-sm transition-colors",
            item.id === activeClassId
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
          )}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}

type RecentStudentContext = {
  id: string;
  fullName: string;
  admissionNo: string;
};

type RecentReceiptContext = {
  id: string;
  receiptNumber: string;
  studentId: string;
};

const LAST_STUDENT_KEY = "office:last-student";
const LAST_RECEIPT_KEY = "office:last-receipt";

export function OfficeRecentTracker({
  student,
  receipt,
}: {
  student?: RecentStudentContext | null;
  receipt?: RecentReceiptContext | null;
}) {
  useEffect(() => {
    if (student) {
      localStorage.setItem(LAST_STUDENT_KEY, JSON.stringify(student));
    }
  }, [student]);

  useEffect(() => {
    if (receipt) {
      localStorage.setItem(LAST_RECEIPT_KEY, JSON.stringify(receipt));
    }
  }, [receipt]);

  return null;
}

export function OfficeRecentActions() {
  const [student, setStudent] = useState<RecentStudentContext | null>(null);
  const [receipt, setReceipt] = useState<RecentReceiptContext | null>(null);

  useEffect(() => {
    const rawStudent = localStorage.getItem(LAST_STUDENT_KEY);
    const rawReceipt = localStorage.getItem(LAST_RECEIPT_KEY);

    if (rawStudent) {
      try {
        setStudent(JSON.parse(rawStudent) as RecentStudentContext);
      } catch {
        localStorage.removeItem(LAST_STUDENT_KEY);
      }
    }

    if (rawReceipt) {
      try {
        setReceipt(JSON.parse(rawReceipt) as RecentReceiptContext);
      } catch {
        localStorage.removeItem(LAST_RECEIPT_KEY);
      }
    }
  }, []);

  const cards = useMemo(() => {
    const items: Array<{
      title: string;
      detail: string;
      href: string;
      action: string;
    }> = [];

    if (student) {
      items.push({
        title: "Continue student work",
        detail: `${student.fullName} (${student.admissionNo})`,
        href: `/protected/students/${student.id}`,
        action: "Open student workspace",
      });
    }

    if (receipt) {
      items.push({
        title: "Print last receipt",
        detail: receipt.receiptNumber,
        href: `/protected/receipts/${receipt.id}`,
        action: "Open receipt",
      });
    }

    return items;
  }, [receipt, student]);

  if (cards.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {cards.map((card) => (
        <div key={card.title} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
          <p className="text-sm font-semibold text-slate-950">{card.title}</p>
          <p className="mt-1 text-sm text-slate-600">{card.detail}</p>
          <div className="mt-3">
            <Button asChild size="sm" variant="outline">
              <Link href={card.href}>{card.action}</Link>
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
