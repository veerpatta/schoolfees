import Link from "next/link";

import { Button } from "@/components/ui/button";

type MissingDuesBannerProps = {
  /** How many students are missing dues (defaulters surface) — or null. */
  missingCount?: number | null;
  /** When the import flow is the source, the raw ledger-sync error message. */
  ledgerSyncError?: string | null;
  /** Optional CTA href (e.g. /protected/fee-setup or a repair workflow). */
  repairHref?: string;
  /** Optional CTA label override. */
  repairLabel?: string;
};

/**
 * Audit 1.13 + 1.14 — Shared red banner for surfaces where the app detects
 * students that have no dues prepared. Used by:
 *   * Defaulters page (active students missing from the dues universe)
 *   * Imports page (committed batches that produced a ledger-sync error)
 *
 * Centralising the affordance keeps the wording consistent and prevents the
 * signal from being silently dropped per the audit.
 */
export function MissingDuesBanner({
  missingCount,
  ledgerSyncError,
  repairHref = "/protected/fee-setup",
  repairLabel = "Open Fee Setup",
}: MissingDuesBannerProps) {
  const showMissingCount =
    typeof missingCount === "number" && missingCount > 0 && !ledgerSyncError;
  const showLedgerError = Boolean(ledgerSyncError);

  if (!showMissingCount && !showLedgerError) {
    return null;
  }

  const headline = showLedgerError
    ? "Dues sync needs attention"
    : `${missingCount} active student${missingCount === 1 ? "" : "s"} have no dues prepared`;

  const detail = showLedgerError
    ? ledgerSyncError
    : "Open Fee Setup and republish so these students appear in the dues universe.";

  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-soft-foreground sm:flex-row sm:items-center sm:justify-between"
      data-component="missing-dues-banner"
    >
      <div>
        <p className="font-semibold">{headline}</p>
        <p className="mt-1 text-xs opacity-90">{detail}</p>
      </div>
      <Button asChild size="sm" variant="outline">
        <Link href={repairHref}>{repairLabel}</Link>
      </Button>
    </div>
  );
}
