"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/utils";

type ValueStateTone =
  | "editable"
  | "calculated"
  | "locked"
  | "policy"
  | "review";

const valueStateClasses: Record<ValueStateTone, string> = {
  editable: "bg-success-soft text-success-soft-foreground",
  calculated: "bg-surface-2 text-foreground",
  locked: "bg-warning-soft text-warning-soft-foreground",
  policy: "bg-info-soft text-info-soft-foreground",
  review: "bg-destructive-soft text-destructive-soft-foreground",
};

type OfficeTone = "neutral" | "success" | "warning" | "danger" | "info";

const officeNoticeToneMap: Record<OfficeTone, React.ComponentProps<typeof Notice>["tone"]> = {
  neutral: "neutral",
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "info",
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
        "inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]",
        valueStateClasses[tone],
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
    <Notice
      tone="warning"
      title={title}
      action={
        actionLabel && actionHref ? (
          <Button asChild size="sm" variant="outline">
            <Link href={actionHref}>{actionLabel}</Link>
          </Button>
        ) : null
      }
    >
      {detail}
    </Notice>
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
    <Notice
      tone={officeNoticeToneMap[tone]}
      title={title}
      action={action}
      className={className}
    >
      {children}
    </Notice>
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
        "rounded-md border border-dashed border-border bg-surface-2/50 px-4 py-8 text-center",
        className,
      )}
    >
      <p className="font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-1.5 max-w-xl text-sm leading-6 text-muted-foreground">
        {detail}
      </p>
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
        "flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2.5 shadow-xs",
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
        "rounded-md border border-border bg-surface-2 p-3",
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
    <div
      className={cn(
        "overflow-x-auto rounded-md border border-border bg-card",
        className,
      )}
    >
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
          className="group flex items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3 text-sm transition-colors duration-150 hover:border-border-strong hover:bg-surface-2"
        >
          <span className="min-w-0">
            <span className="block font-semibold text-foreground">{action.label}</span>
            {action.detail ? (
              <span className="mt-0.5 block leading-5 text-muted-foreground">
                {action.detail}
              </span>
            ) : null}
          </span>
          <ArrowRight
            className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground"
            aria-hidden="true"
          />
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
      if (value) params.set(key, value);
    });
    if (classId) {
      params.set("classId", classId);
    } else {
      params.delete("classId");
    }
    const queryString = params.toString();
    return queryString ? `${basePath}?${queryString}` : basePath;
  };

  const tabClass = (active: boolean) =>
    cn(
      "inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
      active
        ? "border-foreground bg-foreground text-background"
        : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground",
    );

  return (
    <div className="flex flex-wrap gap-1.5 rounded-md bg-surface-2 p-1">
      <Link href={buildHref("")} className={tabClass(!activeClassId)}>
        {allLabel}
      </Link>
      {classOptions.map((item) => (
        <Link
          key={item.id}
          href={buildHref(item.id)}
          className={tabClass(item.id === activeClassId)}
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
        <div
          key={card.title}
          className="rounded-md border border-border bg-surface-2/60 px-4 py-3.5"
        >
          <p className="text-sm font-semibold text-foreground">{card.title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{card.detail}</p>
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
