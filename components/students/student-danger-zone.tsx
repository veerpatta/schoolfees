import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import type { StudentDeletionSafety } from "@/lib/students/types";

import {
  archiveStudentAction,
  hardDeleteStudentAction,
} from "@/app/protected/students/actions";

type StudentDangerZoneProps = {
  studentId: string;
  deletionSafety: StudentDeletionSafety;
};

export async function StudentDangerZone({ studentId, deletionSafety }: StudentDangerZoneProps) {
  const t = await getTranslations("MobileApp");

  const deleteExplanation = deletionSafety.hardDeleteAllowed
    ? deletionSafety.generatedDuesDeleteAllowed
      ? t("dangerDeleteWithDues")
      : t("dangerDeleteClean")
    : t("dangerDeleteBlocked");

  return (
    <details className="overflow-hidden rounded-lg border border-border bg-card">
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
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <form action={archiveStudentAction}>
            <input type="hidden" name="studentId" value={studentId} />
            <Button type="submit" variant="outline">
              {t("dangerWithdrawCta")}
            </Button>
          </form>
          {deletionSafety.hardDeleteAllowed || deletionSafety.canForceDeleteTestRecord ? (
            <form action={hardDeleteStudentAction} className="flex max-w-xs flex-col gap-2">
              <input type="hidden" name="studentId" value={studentId} />
              {deletionSafety.canForceDeleteTestRecord && !deletionSafety.hardDeleteAllowed ? (
                <input type="hidden" name="forceTestRecord" value="yes" />
              ) : null}
              <label className="text-xs font-medium text-muted-foreground" htmlFor="confirmDelete">
                {t("dangerConfirmLabel", { sr: deletionSafety.admissionNo })}
              </label>
              <input
                id="confirmDelete"
                name="confirmDelete"
                required
                className="h-9 rounded-md border border-border-strong px-3 text-sm"
                placeholder={deletionSafety.admissionNo}
              />
              <Button type="submit" variant="destructive">
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
