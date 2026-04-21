import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { LedgerClient } from "@/components/ledger/ledger-client";
import { getLedgerPageData } from "@/lib/ledger/data";
import { requireAuthenticatedStaff } from "@/lib/supabase/session";

import { submitLedgerAdjustmentAction } from "./actions";

type LedgerPageProps = {
  searchParams?: Promise<{
    query?: string;
    studentId?: string;
    entryQuery?: string;
    entryFilter?: string;
  }>;
};

function normalizeStudentId(rawValue: string | undefined) {
  const value = (rawValue ?? "").trim();
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return uuidPattern.test(value) ? value : null;
}

export default async function LedgerPage({ searchParams }: LedgerPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const searchQuery = (resolvedSearchParams?.query ?? "").trim();
  const entryQuery = (resolvedSearchParams?.entryQuery ?? "").trim();
  const studentId = normalizeStudentId(resolvedSearchParams?.studentId);

  const [staff, data] = await Promise.all([
    requireAuthenticatedStaff(),
    getLedgerPageData({
      searchQuery,
      studentId,
      entryQuery,
      entryFilter: resolvedSearchParams?.entryFilter,
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ledger"
        title="Student ledger and adjustments"
        description="Review chronological payment history per student, keep newest entries visible first, and post linked adjustments without editing original payment rows."
        actions={<StatusBadge label={`Signed in: ${staff.appRole}`} tone="good" />}
      />

      <LedgerClient
        data={data}
        submitLedgerAdjustmentAction={submitLedgerAdjustmentAction}
      />
    </div>
  );
}
