"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import type { StudentDeletionSafety } from "@/lib/students/types";

import {
  archiveStudentAction,
  hardDeleteStudentAction,
} from "@/app/protected/students/actions";
import { INITIAL_STUDENT_DANGER_ACTION_STATE } from "@/app/protected/students/danger-action-state";

type StudentDangerZoneProps = {
  studentId: string;
  deletionSafety: StudentDeletionSafety;
};

export function StudentDangerZone({ studentId, deletionSafety }: StudentDangerZoneProps) {
  const t = useTranslations("MobileApp");
  const router = useRouter();
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

  useEffect(() => {
    if (archiveState.status === "idle" || !archiveState.message) {
      return;
    }

    toast({
      title:
        archiveState.status === "success" ? t("dangerWithdrawDone") : t("dangerActionFailed"),
      description: archiveState.message,
    });

    // Withdrawing keeps you on the page, so without this the record still reads
    // as active and the change looks like it did not happen.
    if (archiveState.status === "success") {
      router.refresh();
    }
  }, [archiveState, router, t]);

  useEffect(() => {
    if (deleteState.status === "idle" || !deleteState.message) {
      return;
    }

    toast({
      title: deleteState.status === "success" ? t("dangerDeleteDone") : t("dangerActionFailed"),
      description: deleteState.message,
    });

    // The record this page is about no longer exists — staying here would
    // render a 404 on the next refresh. The confirmation travels in the URL
    // rather than as a toast: a toast fired while the page is navigating and
    // re-rendering is easy to miss entirely, which is what made a successful
    // delete look like nothing had happened.
    if (deleteState.deleted) {
      const removed = `${deletionSafety.fullName} (SR ${deletionSafety.admissionNo})`;
      router.replace(`/protected/students?removed=${encodeURIComponent(removed)}`);
    }
  }, [deleteState, router, t, deletionSafety.fullName, deletionSafety.admissionNo]);

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
    </details>
  );
}
