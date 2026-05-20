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

export function StudentDangerZone({ studentId, deletionSafety }: StudentDangerZoneProps) {
  return (
    <details className="overflow-hidden rounded-lg border border-border bg-card">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-destructive">
        Danger zone - withdraw or delete this record
      </summary>
      <div className="grid gap-4 border-t border-border p-4 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-foreground">
          <p>
            Receipts: {deletionSafety.receiptCount}, payments: {deletionSafety.paymentCount},
            prepared dues: {deletionSafety.installmentCount}, adjustments: {deletionSafety.adjustmentCount},
            refunds: {deletionSafety.refundRequestCount}.
          </p>
          {deletionSafety.blockedInstallmentCount > 0 ||
          deletionSafety.ledgerRegenerationRowCount > 0 ? (
            <p className="mt-2 text-warning-soft-foreground">
              Fee review records are linked to this student. Withdraw student instead of deleting.
            </p>
          ) : null}
          {deletionSafety.hardDeleteBlockers.length > 0 ? (
            <p className="mt-2 text-warning-soft-foreground">
              Delete blockers: {deletionSafety.hardDeleteBlockers.join(", ")}.
            </p>
          ) : null}
          <p className="mt-2">
            {deletionSafety.hardDeleteAllowed
              ? deletionSafety.generatedDuesDeleteAllowed
                ? "Only unpaid dues are linked. Admin can delete this wrong record and its unpaid dues."
                : "No finance records are linked, so admin can delete this wrong record."
              : "Receipts stay saved in history. Withdraw student instead of deleting."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <form action={archiveStudentAction}>
            <input type="hidden" name="studentId" value={studentId} />
            <Button type="submit" variant="outline">
              Withdraw student
            </Button>
          </form>
          {deletionSafety.hardDeleteAllowed || deletionSafety.canForceDeleteTestRecord ? (
            <form action={hardDeleteStudentAction} className="flex max-w-xs flex-col gap-2">
              <input type="hidden" name="studentId" value={studentId} />
              {deletionSafety.canForceDeleteTestRecord && !deletionSafety.hardDeleteAllowed ? (
                <input type="hidden" name="forceTestRecord" value="yes" />
              ) : null}
              <label className="text-xs font-medium text-muted-foreground" htmlFor="confirmDelete">
                Type SR {deletionSafety.admissionNo} to confirm Delete wrong student
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
                  ? "Delete wrong student and unpaid dues"
                  : "Delete wrong student"}
              </Button>
            </form>
          ) : null}
        </div>
      </div>
    </details>
  );
}
