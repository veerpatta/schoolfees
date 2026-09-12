"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { MessageSquare, X } from "lucide-react";

import { Button } from "@/ui/primitives/button";

/**
 * Tick students on a list, then send them all one reminder.
 *
 * This used to build a `wa.me` link per recipient and **open one browser tab
 * each**, uncapped, on whatever WhatsApp account the staff member happened to
 * be signed into. It rendered its own message from a row in
 * `whatsapp_templates` — a template nobody had approved — so nothing about the
 * send was a school message: not the number it came from, not the wording, and
 * not the record, because there was no record.
 *
 * What is left here is the part that was always good: the selection. Ticking
 * rows now hands the chosen students to `/protected/reminders`, which is the
 * one send path in this app and carries everything that makes a send safe — the
 * approved template, the quiet-hours and budget guards, per-family grouping so
 * siblings get one message, the no-call flag, the claim-before-send that stops
 * a family being messaged twice, the run record and the contact log.
 *
 * The hand-off is deliberate rather than a shortcut. A reminder run needs a
 * situation and a date the office chooses per run; the students list can send
 * immediately because its sheet asks for exactly those two things. Duplicating
 * that sheet here would mean `defaulters/ui` importing `students/ui`, which
 * `quality:architecture` counts as `reaches-another-modules-ui` and only lets
 * fall.
 */

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
  if (!value) throw new Error("BulkRowCheckbox must be inside BulkWhatsappProvider");
  return value;
}

type ProviderProps = {
  rows: BulkWhatsappRow[];
  children: ReactNode;
  /** Carried onto the reminders screen so it opens on the same year. */
  sessionLabel?: string;
};

export function BulkWhatsappProvider({ rows, children, sessionLabel }: ProviderProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  // Counted and named so the bar can say what will actually happen. A family
  // with no number on file is not a failure to report later; it is a fact the
  // office can see before pressing anything.
  const withoutPhone = selectedRows.filter((row) => !row.fatherPhone).length;

  const remindersHref = (() => {
    const params = new URLSearchParams();
    // `include` is what puts a named student on the audience whatever their
    // cadence or snooze says — which is exactly what ticking a row means.
    params.set("include", selectedRows.map((row) => row.studentId).join(","));
    if (sessionLabel) params.set("session", sessionLabel);
    return `/protected/reminders?${params.toString()}`;
  })();

  return (
    <BulkContext.Provider value={contextValue}>
      {children}

      {selectedRows.length > 0 ? (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-4 py-3 backdrop-blur print:hidden"
          style={{ paddingBottom: "calc(var(--mobile-safe-area-bottom, 0px) + 0.75rem)" }}
        >
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {selectedRows.length} selected
              </p>
              {withoutPhone > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {withoutPhone} of them have no phone number on file and cannot be messaged.
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setSelectedIds(new Set())}
              >
                <X className="size-4" aria-hidden="true" />
                Clear
              </Button>
              <Button asChild size="sm">
                <Link href={remindersHref}>
                  <MessageSquare className="size-4" aria-hidden="true" />
                  Send reminder
                </Link>
              </Button>
            </div>
          </div>
        </div>
      ) : null}
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
