import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { PaymentEntryClient } from "@/components/payments/payment-entry-client";
import {
  getPaymentEntryPageData,
  PAYMENT_MODE_OPTIONS,
} from "@/lib/payments/data";
import { INITIAL_PAYMENT_ENTRY_ACTION_STATE } from "@/lib/payments/types";
import { hasStaffPermission, requireStaffPermission } from "@/lib/supabase/session";

import { submitPaymentEntryAction } from "./actions";

type PaymentsPageProps = {
  searchParams?: Promise<{
    query?: string;
    studentId?: string;
  }>;
};

function normalizeStudentId(rawValue: string | undefined) {
  const value = (rawValue ?? "").trim();
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return uuidPattern.test(value) ? value : null;
}

export default async function PaymentsPage({ searchParams }: PaymentsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const searchQuery = (resolvedSearchParams?.query ?? "").trim();
  const studentId = normalizeStudentId(resolvedSearchParams?.studentId);

  const [staff, data] = await Promise.all([
    requireStaffPermission("payments:view", { onDenied: "redirect" }),
    getPaymentEntryPageData({ searchQuery, studentId }),
  ]);

  const canPostPayments = hasStaffPermission(staff, "payments:write");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Payments"
        title="Payment entry desk"
        description="Search student, review dues, post append-only payment entries, and generate receipts in one office-friendly workflow."
        actions={<StatusBadge label={`Signed in: ${staff.appRole}`} tone="good" />}
      />

      <PaymentEntryClient
        data={data}
        canPost={canPostPayments}
        modeOptions={PAYMENT_MODE_OPTIONS}
        initialState={INITIAL_PAYMENT_ENTRY_ACTION_STATE}
        defaultReceivedBy={staff.email ?? "Office desk"}
        submitPaymentEntryAction={submitPaymentEntryAction}
      />
    </div>
  );
}
