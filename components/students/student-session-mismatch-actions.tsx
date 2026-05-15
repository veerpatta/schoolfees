"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { setViewSessionAction } from "@/app/protected/session/actions";
import { realignRecentImportsToActiveSessionAction } from "@/app/protected/students/actions";
import { Button } from "@/components/ui/button";

type StudentSessionMismatchActionsProps = {
  activePolicySessionLabel: string;
  canRealignRecentImports: boolean;
  recentImportStudentCount: number;
};

export function StudentSessionMismatchActions({
  activePolicySessionLabel,
  canRealignRecentImports,
  recentImportStudentCount,
}: StudentSessionMismatchActionsProps) {
  const router = useRouter();
  const [isSwitchPending, startSwitchTransition] = useTransition();
  const [isRealignPending, startRealignTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const canMoveRecentStudents = canRealignRecentImports && recentImportStudentCount > 0;

  function viewActiveSession() {
    startSwitchTransition(async () => {
      const result = await setViewSessionAction(activePolicySessionLabel);

      if (result.success) {
        router.replace(`/protected/students?session=${encodeURIComponent(result.sessionLabel)}`);
        router.refresh();
      }
    });
  }

  function realignRecentImports() {
    startRealignTransition(async () => {
      const result = await realignRecentImportsToActiveSessionAction();
      setMessage(
        result.movedCount > 0
          ? `Moved ${result.movedCount} student${result.movedCount === 1 ? "" : "s"} and refreshed dues for ${result.preparedCount}.`
          : "No recent import students needed moving.",
      );
      setDialogOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={isSwitchPending}
        onClick={viewActiveSession}
      >
        View students from active session
      </Button>
      {canRealignRecentImports ? (
        <>
          <Button
            type="button"
            variant="secondary"
            disabled={!canMoveRecentStudents || isRealignPending}
            onClick={() => setDialogOpen(true)}
          >
            Move recent import students to active session
          </Button>
          {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
          {dialogOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4">
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="recent-import-realign-title"
                className="w-full max-w-md rounded-md border border-border bg-card p-4 text-card-foreground shadow-lg"
              >
                <h2 id="recent-import-realign-title" className="text-base font-semibold">
                  Move recent import students?
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {recentImportStudentCount} student
                  {recentImportStudentCount === 1 ? "" : "s"} from imports in the last 7 days will
                  be moved to matching classes in {activePolicySessionLabel}. Posted payments and
                  receipts will not be changed.
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isRealignPending}
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={isRealignPending}
                    onClick={realignRecentImports}
                  >
                    Confirm move
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
