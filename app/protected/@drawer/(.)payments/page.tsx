import { Suspense } from "react";

import { PaymentEntryClient } from "@/components/payments/payment-entry-client";
import { PaymentDeskSkeleton } from "@/components/payments/payment-desk-skeleton";
import { PaymentDrawerShell } from "@/components/payments/collect/payment-drawer-shell";
import {
  getPaymentDeskClassOptions,
  getPaymentDeskReadiness,
  getPaymentEntryPageData,
} from "@/lib/payments/data";
import { INITIAL_PAYMENT_ENTRY_ACTION_STATE } from "@/lib/payments/types";
import { getViewSessionCookie } from "@/lib/session/cookie";
import { resolveViewSession } from "@/lib/session/resolver";
import { hasStaffPermission, requireStaffPermission } from "@/lib/supabase/session";
import { WorkflowGuard } from "@/components/office/office-ui";

import {
  repairPaymentDeskStudentDuesAction,
  submitPaymentEntryAction,
} from "@/app/protected/payments/actions";

type DrawerPaymentsPageProps = {
  searchParams?: Promise<{
    studentId?: string;
    classId?: string;
    session?: string;
    returnTo?: string;
  }>;
};

function normalizeUuid(raw: string | undefined): string | null {
  const value = (raw ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
    ? value
    : null;
}

export default async function DrawerPaymentsPage({
  searchParams,
}: DrawerPaymentsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const studentId = normalizeUuid(resolvedSearchParams?.studentId);
  const classId = normalizeUuid(resolvedSearchParams?.classId);
  const returnTo = (resolvedSearchParams?.returnTo ?? "").trim() || undefined;
  const viewSession = await resolveViewSession({
    searchParamSession: resolvedSearchParams?.session,
    cookieSession: await getViewSessionCookie(),
  });

  const [staff, classOptions] = await Promise.all([
    requireStaffPermission("payments:view", { onDenied: "redirect" }),
    getPaymentDeskClassOptions(viewSession.sessionLabel),
  ]);

  return (
    <PaymentDrawerShell returnTo={returnTo}>
      <Suspense fallback={<PaymentDeskSkeleton />}>
        <DrawerPaymentDeskContent
          staff={staff}
          classOptions={classOptions}
          studentId={studentId}
          classId={classId}
          sessionLabel={viewSession.sessionLabel}
        />
      </Suspense>
    </PaymentDrawerShell>
  );
}

async function DrawerPaymentDeskContent({
  staff,
  classOptions,
  studentId,
  classId,
  sessionLabel,
}: {
  staff: Awaited<ReturnType<typeof requireStaffPermission>>;
  classOptions: Array<{ id: string; label: string }>;
  studentId: string | null;
  classId: string | null;
  sessionLabel: string;
}) {
  const canWritePayments = hasStaffPermission(staff, "payments:write");

  const [readiness, data] = await Promise.all([
    getPaymentDeskReadiness({
      sessionLabel,
      staffAppRole: staff.appRole,
      canWritePayments,
    }),
    getPaymentEntryPageData({
      searchQuery: "",
      studentId,
      classId: classId ?? undefined,
      sessionLabel,
      autoPrepareMissingDues: false,
      initialSelectedSummary: studentId ? undefined : null,
    }),
  ]);

  const { canPostPayments, blockingReason } = readiness;

  return (
    <>
      {blockingReason ? (
        <WorkflowGuard
          title={blockingReason.title}
          detail={blockingReason.detail}
          actionLabel={blockingReason.actionLabel}
          actionHref={blockingReason.actionHref}
        />
      ) : null}

      <PaymentEntryClient
        data={data}
        canPost={canPostPayments}
        canViewDiagnostics={staff.appRole === "admin"}
        classOptions={classOptions}
        workflowGuard={blockingReason}
        initialState={INITIAL_PAYMENT_ENTRY_ACTION_STATE}
        defaultReceivedBy={staff.email ?? "Office desk"}
        submitPaymentEntryAction={submitPaymentEntryAction}
        repairPaymentDeskStudentDuesAction={repairPaymentDeskStudentDuesAction}
      />
    </>
  );
}
