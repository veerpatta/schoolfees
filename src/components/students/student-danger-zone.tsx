"use client";

import { useActionState, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

import { Button } from "@/ui/primitives/button";
import { CloseDueAsDiscountSheet } from "@/components/students/close-due-as-discount-sheet";
import { formatInr } from "@/platform/helpers/currency";
import { useActionFeedback } from "@/ui/hooks/use-action-feedback";
import type { StudentDeletionSafety } from "@/lib/students/types";

import {
  archiveStudentAction,
  hardDeleteStudentAction,
} from "@/app/protected/students/actions";
import { INITIAL_STUDENT_DANGER_ACTION_STATE } from "@/app/protected/students/danger-action-state";

type StudentDangerZoneProps = {
  studentId: string;
  deletionSafety: StudentDeletionSafety;
  /**
   * Writing a balance off is an admin-only, money-moving act, so it belongs
   * behind the same gate as withdrawing and deleting rather than in the middle
   * of the Transactions table where it used to sit.
   */
  closeBalance?: {
    studentLabel: string;
    studentAdmissionNo: string;
    classLabel: string;
    sessionLabel: string;
    /** This session's outstanding, late fee included. */
    pendingAmount: number;
    /** Unpaid carry-forward balance from a previous session, if any. */
    oldBalanceAmount: number;
  };
};

export function StudentDangerZone({
  studentId,
  deletionSafety,
  closeBalance,
}: StudentDangerZoneProps) {
  const t = useTranslations("MobileApp");
  const router = useRouter();
  const [closeSheet, setCloseSheet] = useState<"current" | "oldBalance" | null>(null);
  // The student page renders this block twice (phone branch + desktop branch,
  // one hidden by CSS but still in the DOM). A hardcoded id made both inputs
  // share it, so the desktop <label> focused the hidden phone input.
  const confirmFieldId = useId();
  const [panelOpen, setPanelOpen] = useState(false);

  const [archiveState, archiveFormAction, archivePending] = useActionState(
    archiveStudentAction,
    INITIAL_STUDENT_DANGER_ACTION_STATE,
  );
  const [deleteState, deleteFormAction, deletePending] = useActionState(
    hardDeleteStudentAction,
    INITIAL_STUDENT_DANGER_ACTION_STATE,
  );

  // Withdrawing keeps you on the page, so the hook's refresh is what stops the
  // record still reading as active. Using the shared hook rather than a bespoke
  // effect also brings its identity guard: the hand-rolled version re-fired
  // whenever the component re-rendered with an equal state object, so a single
  // withdrawal could announce itself twice.
  useActionFeedback(archiveState, {
    successTitle: t("dangerWithdrawDone"),
    errorTitle: t("dangerActionFailed"),
  });

  useActionFeedback(deleteState, {
    successTitle: t("dangerDeleteDone"),
    errorTitle: t("dangerActionFailed"),
    // The record is gone; refreshing this page would render a 404. Navigate
    // instead, carrying the confirmation in the URL — a toast fired while the
    // page is navigating away is easy to miss, which is what made a successful
    // delete look like nothing had happened.
    refreshOnSuccess: false,
    onSuccess: (state) => {
      if (!(state as typeof deleteState).deleted) {
        return;
      }

      const removed = `${deletionSafety.fullName} (SR ${deletionSafety.admissionNo})`;
      router.replace(`/protected/students?removed=${encodeURIComponent(removed)}`);
    },
  });

  const deleteExplanation = deletionSafety.hardDeleteAllowed
    ? deletionSafety.generatedDuesDeleteAllowed
      ? t("dangerDeleteWithDues")
      : t("dangerDeleteClean")
    : t("dangerDeleteBlocked");

  const pending = archivePending || deletePending;
  const errorMessage =
    deleteState.status === "error"
      ? deleteState.message
      : archiveState.status === "error"
        ? archiveState.message
        : null;
  // Successes were announced only as a toast, which lasts five seconds and is
  // easy to miss on a page that is refreshing underneath it. The outcome now
  // also stays on the panel until the next action.
  const successMessage =
    archiveState.status === "success"
      ? archiveState.message
      : deleteState.status === "success"
        ? deleteState.message
        : null;

  return (
    <details
      // Uncontrolled, this panel snapped shut on the router.refresh() that
      // follows a withdrawal — taking the result message with it. Forcing it
      // open whenever there is something to report keeps the outcome visible.
      open={panelOpen || Boolean(successMessage) || Boolean(errorMessage)}
      onToggle={(event) => setPanelOpen((event.target as HTMLDetailsElement).open)}
      className="overflow-hidden rounded-lg border border-border bg-card"
    >
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-destructive">
        {t("dangerSummary")}
      </summary>
      <div className="grid gap-4 border-t border-border p-4 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-foreground">
          <p>
            {t("dangerCounts", {
              receipts: deletionSafety.receiptCount,
              payments: deletionSafety.paymentCount,
              dues: deletionSafety.installmentCount,
              adjustments: deletionSafety.adjustmentCount,
              refunds: deletionSafety.refundRequestCount,
            })}
          </p>
          {deletionSafety.blockedInstallmentCount > 0 ||
          deletionSafety.ledgerRegenerationRowCount > 0 ? (
            <p className="mt-2 text-warning-soft-foreground">{t("dangerFeeReviewLinked")}</p>
          ) : null}
          {deletionSafety.hardDeleteBlockers.length > 0 ? (
            <p className="mt-2 text-warning-soft-foreground">
              {t("dangerBlockers", { blockers: deletionSafety.hardDeleteBlockers.join(", ") })}
            </p>
          ) : null}
          <p className="mt-2">{deleteExplanation}</p>
          {errorMessage ? (
            <p role="alert" className="mt-2 font-medium text-destructive">
              {errorMessage}
            </p>
          ) : null}
          {successMessage ? (
            <p
              role="status"
              className="mt-2 rounded-md bg-success-soft px-3 py-2 font-medium text-success-soft-foreground"
            >
              {successMessage}
            </p>
          ) : null}
        </div>
        {closeBalance &&
        (closeBalance.pendingAmount > 0 || closeBalance.oldBalanceAmount > 0) ? (
          <div className="lg:col-span-2 rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
            <p className="font-semibold text-foreground">Close a balance as discount</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Writes the amount off with an auditable discount receipt. No cash is recorded
              and it never counts towards collection.
            </p>
            {/*
              Full-width, 44px-tall stacked buttons on a phone — the same shape
              every other destructive action on the mobile screens uses, and big
              enough to hit with a thumb. They collapse back to inline auto-width
              from sm up, where the labels sit comfortably side by side.
            */}
            <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {closeBalance.pendingAmount > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => setCloseSheet("current")}
                  className="h-11 w-full justify-center rounded-xl text-[12.5px] font-extrabold sm:h-9 sm:w-auto sm:rounded-md sm:text-sm sm:font-medium"
                >
                  Close this year&rsquo;s balance ({formatInr(closeBalance.pendingAmount)})
                </Button>
              ) : null}
              {closeBalance.oldBalanceAmount > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => setCloseSheet("oldBalance")}
                  className="h-11 w-full justify-center rounded-xl text-[12.5px] font-extrabold sm:h-9 sm:w-auto sm:rounded-md sm:text-sm sm:font-medium"
                >
                  Close old balance ({formatInr(closeBalance.oldBalanceAmount)})
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <form action={archiveFormAction}>
            <input type="hidden" name="studentId" value={studentId} />
            <Button type="submit" variant="outline" disabled={pending}>
              {archivePending ? (
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {t("dangerWithdrawCta")}
            </Button>
          </form>
          {deletionSafety.hardDeleteAllowed || deletionSafety.canForceDeleteTestRecord ? (
            <form action={deleteFormAction} className="flex max-w-xs flex-col gap-2">
              <input type="hidden" name="studentId" value={studentId} />
              {deletionSafety.canForceDeleteTestRecord && !deletionSafety.hardDeleteAllowed ? (
                <input type="hidden" name="forceTestRecord" value="yes" />
              ) : null}
              <label className="text-xs font-medium text-muted-foreground" htmlFor={confirmFieldId}>
                {t("dangerConfirmLabel", { sr: deletionSafety.admissionNo })}
              </label>
              <input
                id={confirmFieldId}
                name="confirmDelete"
                required
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                className="h-9 rounded-md border border-border-strong px-3 text-sm"
                placeholder={deletionSafety.admissionNo}
              />
              <Button type="submit" variant="destructive" disabled={pending}>
                {deletePending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                ) : null}
                {deletionSafety.generatedDuesDeleteAllowed
                  ? t("dangerDeleteWithDuesCta")
                  : t("dangerDeleteCta")}
              </Button>
            </form>
          ) : null}
        </div>
      </div>
      {closeBalance ? (
        <CloseDueAsDiscountSheet
          open={closeSheet !== null}
          onClose={() => setCloseSheet(null)}
          studentId={studentId}
          studentLabel={closeBalance.studentLabel}
          studentAdmissionNo={closeBalance.studentAdmissionNo}
          classLabel={closeBalance.classLabel}
          sessionLabel={closeBalance.sessionLabel}
          variant={closeSheet === "oldBalance" ? "oldBalance" : "current"}
          pendingAmount={
            closeSheet === "oldBalance"
              ? closeBalance.oldBalanceAmount
              : closeBalance.pendingAmount
          }
        />
      ) : null}
    </details>
  );
}
