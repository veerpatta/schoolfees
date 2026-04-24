"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]",
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
