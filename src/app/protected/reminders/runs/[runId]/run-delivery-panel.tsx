"use client";

import { useActionState } from "react";

import {
  IDLE_RUN_ACTION,
  importDeliveryReportAction,
  reconcileStuckSendsAction,
  retryFailedSendsAction,
} from "./actions";
import { useActionFeedback } from "@/ui/hooks/use-action-feedback";
import { PendingSubmitButton } from "@/ui/shell/pending-submit-button";
import { Input } from "@/ui/primitives/input";
import { Label } from "@/ui/primitives/label";
import { Notice } from "@/ui/primitives/notice";
import { SelectNative } from "@/ui/primitives/select-native";

/**
 * What an admin can do to a finished run: retry what failed, decide what
 * happened to what never answered, and import what the provider says.
 *
 * A client island because all three are forms with their own pending state, and
 * it renders nothing at all when there is nothing to do — a run where everything
 * went out cleanly shows none of this.
 *
 * Colocated with the route rather than in `modules/whatsapp/ui`, because it
 * imports this route's server actions. A module component reaching into
 * `src/app` is the `module-reaches-app` violation `quality:architecture`
 * counts, and that budget only ratchets down.
 *
 * **This is a SUB-PAGE**, so it is a mobile takeover: `/protected/reminders/` is
 * in `mobileTakeoverRoutes` and `MobileBottomNav` renders nothing here. Bottom
 * spacing is the safe area only — using `--mobile-bottom-nav-offset` would
 * reserve 68px for a bar that is not on screen. The index page follows the
 * opposite rule, and `tests/ui/whatsapp-reminders-screen.test.ts` pins both.
 */

type Props = {
  runId: string;
  failedCount: number;
  stuckCount: number;
  /** Null when no delivery report has ever been imported for this run. */
  deliveredCount: number | null;
  readCount: number | null;
};

export function RunDeliveryPanel({
  runId,
  failedCount,
  stuckCount,
  deliveredCount,
  readCount,
}: Props) {
  const [retryState, retryAction] = useActionState(retryFailedSendsAction, IDLE_RUN_ACTION);
  const [reconcileState, reconcileAction] = useActionState(
    reconcileStuckSendsAction,
    IDLE_RUN_ACTION,
  );
  const [importState, importAction] = useActionState(importDeliveryReportAction, IDLE_RUN_ACTION);

  // A change must tell the user what happened, and a toast reaches somebody
  // whose eyes are on the button rather than on the notice below it. The inline
  // Notice stays as well: it is the durable record of what the last import
  // matched, which a toast is not.
  useActionFeedback(retryState, {
    successTitle: "Retried",
    errorTitle: "Some retries failed",
  });
  useActionFeedback(reconcileState, {
    successTitle: "Recorded",
    errorTitle: "Nothing was recorded",
  });
  useActionFeedback(importState, {
    successTitle: "Delivery report imported",
    errorTitle: "Could not import that report",
  });

  const nothingToDo = failedCount === 0 && stuckCount === 0;

  return (
    // flex gap, never space-y: the retry and reconcile blocks are conditional,
    // and space-y leaves a margin around a hidden child.
    <div
      className="flex flex-col gap-4"
      style={{ paddingBottom: "calc(var(--mobile-safe-area-bottom, 0px) + 0.75rem)" }}
    >
      {/* ------------------------------------------------------------ delivery */}
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-bold text-foreground">Did the messages arrive?</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {deliveredCount === null ? (
                <>
                  Nothing imported yet. <strong>Sent</strong> means AiSensy accepted the message,
                  not that a phone lit up — the plan has no delivery webhooks, so the campaign
                  report is the only way to know.
                </>
              ) : (
                <>
                  <span className="tabular-nums font-semibold text-foreground">
                    {deliveredCount}
                  </span>{" "}
                  delivered,{" "}
                  <span className="tabular-nums font-semibold text-foreground">
                    {readCount ?? 0}
                  </span>{" "}
                  read. Counted per message, so a family of three siblings counts once.
                </>
              )}
            </p>
          </div>

          <form action={importAction} className="flex flex-col gap-2">
            <input type="hidden" name="runId" value={runId} />
            <div className="space-y-1.5">
              <Label htmlFor="report">AiSensy campaign report (CSV)</Label>
              <Input
                id="report"
                name="report"
                type="file"
                accept=".csv,text/csv"
                // h-11 so the file button is a comfortable tap target.
                className="h-11 py-2"
              />
            </div>
            <PendingSubmitButton
              className="h-11 w-full sm:w-auto"
              idleLabel="Import delivery report"
              pendingLabel="Reading…"
            />
            {importState.status !== "idle" && importState.message ? (
              <Notice tone={importState.status === "success" ? "success" : "danger"}>
                {importState.message}
              </Notice>
            ) : null}
          </form>
        </div>
      </section>

      {/* --------------------------------------------------------------- retry */}
      {failedCount > 0 ? (
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="text-sm font-bold text-foreground">
                <span className="tabular-nums">{failedCount}</span> failed
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Retrying updates the same rows rather than adding new ones, so a family is never
                recorded as messaged twice.
              </p>
            </div>
            <form action={retryAction}>
              <input type="hidden" name="runId" value={runId} />
              <PendingSubmitButton
                className="h-11 w-full sm:w-auto"
                idleLabel={`Retry ${failedCount} failed`}
                pendingLabel="Retrying…"
              />
            </form>
            {retryState.status !== "idle" && retryState.message ? (
              <Notice tone={retryState.status === "success" ? "success" : "danger"}>
                {retryState.message}
              </Notice>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ----------------------------------------------------------- reconcile */}
      {stuckCount > 0 ? (
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="text-sm font-bold text-foreground">
                <span className="tabular-nums">{stuckCount}</span> still pending
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                The request died between claiming the row and hearing back, so these may or may not
                have gone out. Check the AiSensy dashboard and record what you find — the day is
                already claimed either way.
              </p>
            </div>
            <form action={reconcileAction} className="flex flex-col gap-2">
              <input type="hidden" name="runId" value={runId} />
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="outcome">These actually</Label>
                  <SelectNative id="outcome" name="outcome" defaultValue="failed" className="w-44">
                    <option value="failed">did not go out</option>
                    <option value="sent">did go out</option>
                  </SelectNative>
                </div>
                <div className="min-w-[12rem] flex-1 space-y-1.5">
                  <Label htmlFor="reason">Because</Label>
                  <Input
                    id="reason"
                    name="reason"
                    placeholder="AiSensy dashboard shows them delivered"
                  />
                </div>
              </div>
              <PendingSubmitButton
                className="h-11 w-full sm:w-auto"
                idleLabel="Record what happened"
                pendingLabel="Recording…"
              />
              {reconcileState.status !== "idle" && reconcileState.message ? (
                <Notice tone={reconcileState.status === "success" ? "success" : "danger"}>
                  {reconcileState.message}
                </Notice>
              ) : null}
            </form>
          </div>
        </section>
      ) : null}

      {nothingToDo && deliveredCount !== null ? (
        <p className="text-xs text-muted-foreground">
          Nothing failed and nothing is stuck on this run.
        </p>
      ) : null}
    </div>
  );
}
