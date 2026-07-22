"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { MessageSquare, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { formatInr } from "@/lib/helpers/currency";
import { formatShortDate } from "@/lib/helpers/date";
import { appendPaymentBlockIfMissing } from "@/lib/defaulters/whatsapp-template";
import { buildWaMeLink, renderWhatsappTemplate } from "@/lib/whatsapp-templates/render";
import type { WhatsappTemplate } from "@/lib/whatsapp-templates/types";
import { schoolProfile } from "@/lib/config/school";
import { buildStudentFeeUpiPayment } from "@/lib/payments/upi";
import { logWhatsAppSendAttempts } from "@/app/protected/defaulters/actions";

export type BulkWhatsappRow = {
  studentId: string;
  admissionNo: string;
  fullName: string;
  fatherName: string | null;
  fatherPhone: string | null;
  classLabel: string;
  totalPending: number;
  oldestDueDate: string | null;
};

type BulkContextValue = {
  isSelected: (studentId: string) => boolean;
  toggle: (studentId: string) => void;
};

const BulkContext = createContext<BulkContextValue | null>(null);

export function useBulkWhatsapp(): BulkContextValue {
  const value = useContext(BulkContext);
  if (!value) throw new Error("BulkWhatsappRowCheckbox must be inside BulkWhatsappProvider");
  return value;
}

type ProviderProps = {
  rows: BulkWhatsappRow[];
  templates: WhatsappTemplate[];
  children: ReactNode;
  /** Session label used to auto-log a contact attempt per recipient. */
  sessionLabel?: string;
};

export function BulkWhatsappProvider({ rows, templates, children, sessionLabel }: ProviderProps) {
  const t = useTranslations("Defaulters");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(
    templates[0]?.id ?? null,
  );

  const toggle = useCallback((studentId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }, []);

  const isSelected = useCallback(
    (studentId: string) => selectedIds.has(studentId),
    [selectedIds],
  );

  const contextValue = useMemo(() => ({ isSelected, toggle }), [isSelected, toggle]);

  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.has(row.studentId)),
    [rows, selectedIds],
  );

  const activeTemplate = useMemo(
    () => templates.find((template) => template.id === activeTemplateId) ?? null,
    [templates, activeTemplateId],
  );

  const previewVars = useMemo(() => {
    const sample = selectedRows[0] ?? rows[0];
    if (!sample) return {} as Record<string, string>;
    const payment = buildStudentFeeUpiPayment({
      admissionNo: sample.admissionNo,
      amount: sample.totalPending,
    });
    return {
      studentName: sample.fullName,
      fatherName: sample.fatherName ?? "Parent",
      className: sample.classLabel,
      pending: formatInr(sample.totalPending),
      dueDate: sample.oldestDueDate ? formatShortDate(sample.oldestDueDate) : "—",
      schoolName: schoolProfile.shortName,
      paymentLink: payment.uri,
      paymentReference: payment.displayReference,
    } as Record<string, string>;
  }, [selectedRows, rows]);

  const preview = useMemo(() => {
    if (!activeTemplate) return "";
    return appendPaymentBlockIfMissing(renderWhatsappTemplate(activeTemplate.body, previewVars), {
      paymentLink: previewVars.paymentLink,
      paymentReference: previewVars.paymentReference,
    });
  }, [activeTemplate, previewVars]);

  const rowsWithoutPhone = selectedRows.filter((row) => !row.fatherPhone);
  const sendableRows = selectedRows.filter((row) => row.fatherPhone);

  const handleOpenAll = useCallback(() => {
    if (!activeTemplate) return;
    const sentIds: string[] = [];
    for (const row of sendableRows) {
      if (!row.fatherPhone) continue;
      const payment = buildStudentFeeUpiPayment({
        admissionNo: row.admissionNo,
        amount: row.totalPending,
      });
      const text = appendPaymentBlockIfMissing(renderWhatsappTemplate(activeTemplate.body, {
        studentName: row.fullName,
        fatherName: row.fatherName ?? "Parent",
        className: row.classLabel,
        pending: formatInr(row.totalPending),
        dueDate: row.oldestDueDate ? formatShortDate(row.oldestDueDate) : "—",
        schoolName: schoolProfile.shortName,
        paymentLink: payment.uri,
        paymentReference: payment.displayReference,
      }), {
        paymentLink: payment.uri,
        paymentReference: payment.displayReference,
      });
      window.open(buildWaMeLink(row.fatherPhone, text), "_blank", "noopener");
      sentIds.push(row.studentId);
    }
    setSheetOpen(false);
    setSelectedIds(new Set());

    if (sessionLabel && sentIds.length > 0) {
      startTransition(async () => {
        await logWhatsAppSendAttempts({
          sessionLabel,
          studentIds: sentIds,
          templateName: activeTemplate.name,
        });
        router.refresh();
      });
    }
  }, [activeTemplate, sendableRows, sessionLabel, router]);

  const handleClear = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return (
    <BulkContext.Provider value={contextValue}>
      {children}

      {selectedIds.size > 0 ? (
        // Sits ABOVE the fixed mobile nav (z-40): at bottom-0/z-30 the
        // "Send to N" button was hidden behind it on phones.
        <div className="fixed inset-x-0 bottom-[var(--mobile-bottom-nav-offset,0px)] z-40 border-t border-border bg-card/95 backdrop-blur-sm shadow-[0_-4px_16px_rgba(0,0,0,0.06)] mobile-safe-bottom-padding md:bottom-0 print:hidden">
          <div className="mx-auto flex max-w-screen-xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleClear}
                className="grid size-9 place-items-center rounded-full border border-border text-muted-foreground hover:bg-surface-2"
                aria-label={t("bulkClearSelection")}
              >
                <X className="size-4" />
              </button>
              <p className="text-sm font-medium text-foreground">
                {t("bulkSelected", { count: selectedIds.size })}
              </p>
            </div>
            <Button
              type="button"
              variant="accent"
              onClick={() => setSheetOpen(true)}
              disabled={templates.length === 0}
              className="gap-2"
            >
              <MessageSquare className="size-4" aria-hidden="true" />
              {t("bulkSendButton", { count: selectedIds.size })}
            </Button>
          </div>
        </div>
      ) : null}

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={t("bulkSheetTitle", { count: selectedIds.size })}
        description={t("bulkSheetDescription")}
        size="full"
      >
        <div className="space-y-4">
          {templates.length === 0 ? (
            <p className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-3 text-sm text-warning-soft-foreground">
              {t("bulkNoTemplates")}
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <label htmlFor="bulk-template" className="text-sm font-medium text-foreground">
                  {t("bulkTemplateLabel")}
                </label>
                <select
                  id="bulk-template"
                  value={activeTemplateId ?? ""}
                  onChange={(event) => setActiveTemplateId(event.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {t("bulkPreviewHeading", {
                    name: selectedRows[0]?.fullName ?? rows[0]?.fullName ?? t("bulkFirstRow"),
                  })}
                </p>
                <pre className="whitespace-pre-wrap rounded-lg border border-border bg-surface-2 p-3 font-sans text-sm text-foreground">
                  {preview}
                </pre>
              </div>

              {rowsWithoutPhone.length > 0 ? (
                <div className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning-soft-foreground">
                  {t("bulkNoPhoneMessage", { count: rowsWithoutPhone.length })}
                  <ul className="mt-1 list-disc pl-5">
                    {rowsWithoutPhone.map((row) => (
                      <li key={row.studentId}>{row.fullName}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <p className="text-xs text-muted-foreground">
                {t("bulkOpenInfo", { count: sendableRows.length })}
              </p>

              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSheetOpen(false)}
                  className="flex-1"
                >
                  {t("bulkCancel")}
                </Button>
                <Button
                  type="button"
                  variant="accent"
                  onClick={handleOpenAll}
                  disabled={sendableRows.length === 0 || activeTemplate === null}
                  className="flex-1"
                >
                  {t("bulkOpenButton", { count: sendableRows.length })}
                </Button>
              </div>
            </>
          )}
        </div>
      </Sheet>
    </BulkContext.Provider>
  );
}

export function BulkRowCheckbox({
  studentId,
  ariaLabel,
}: {
  studentId: string;
  ariaLabel: string;
}) {
  const { isSelected, toggle } = useBulkWhatsapp();
  return (
    <input
      type="checkbox"
      checked={isSelected(studentId)}
      onChange={() => toggle(studentId)}
      aria-label={ariaLabel}
      className="size-4 cursor-pointer accent-accent"
    />
  );
}
