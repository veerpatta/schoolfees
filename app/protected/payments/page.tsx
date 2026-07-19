import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";
import { OfficeNotice, WorkflowGuard } from "@/components/office/office-ui";
import { StatusBadge } from "@/components/admin/status-badge";
import { PaymentEntryClient } from "@/components/payments/payment-entry-client";
import { PaymentDeskSkeleton } from "@/components/payments/payment-desk-skeleton";
import {
  getPaymentDeskClassOptions,
  getPaymentDeskReadiness,
  getPaymentEntryPageData,
} from "@/lib/payments/data";
import { translateBlockingReason } from "@/lib/payments/blocking-reason-i18n";
import { INITIAL_PAYMENT_ENTRY_ACTION_STATE } from "@/lib/payments/types";
import { getViewSessionCookie } from "@/lib/session/cookie";
import { resolveViewSession } from "@/lib/session/resolver";
import { hasStaffPermission, requireStaffPermission } from "@/lib/supabase/session";

import {
  repairPaymentDeskStudentDuesAction,
  submitPaymentEntryAction,
  undoRecentPaymentAction,
} from "./actions";

type PaymentsPageProps = {
  searchParams?: Promise<{
    studentId?: string;
    classId?: string;
    session?: string;
    repairNotice?: string;
    mode?: string;
  }>;
};

function normalizeStudentId(rawValue: string | undefined) {
  const value = (rawValue ?? "").trim();
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return uuidPattern.test(value) ? value : null;
}

export default async function PaymentsPage({ searchParams }: PaymentsPageProps) {
  const t = await getTranslations("Payments");
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const studentId = normalizeStudentId(resolvedSearchParams?.studentId);
  const classId = normalizeStudentId(resolvedSearchParams?.classId);
  const repairNotice = (resolvedSearchParams?.repairNotice ?? "").trim();
  // Recovery mode is reachable only via an explicit ?mode=recovery link with a
  // preselected student (from the Admin Tools recovery queue).
  const recovery = (resolvedSearchParams?.mode ?? "").trim() === "recovery" && Boolean(studentId);
  const viewSession = await resolveViewSession({
    searchParamSession: resolvedSearchParams?.session,
    cookieSession: await getViewSessionCookie(),
  });

  const [staff, classOptions] = await Promise.all([
    requireStaffPermission("payments:view", { onDenied: "redirect" }),
    getPaymentDeskClassOptions(viewSession.sessionLabel),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
        actions={
          hasStaffPermission(staff, "payments:bulk") ? (
            <Link
              href={`/protected/payments/bulk?session=${encodeURIComponent(viewSession.sessionLabel)}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-surface-3"
            >
              Bulk upload
            </Link>
          ) : undefined
        }
      />

      {repairNotice ? (
        <OfficeNotice tone="warning">{repairNotice}</OfficeNotice>
      ) : null}

      <Suspense fallback={<PaymentDeskSkeleton />}>
        <PaymentDeskDataLoader
          staff={staff}
          classOptions={classOptions}
          studentId={studentId}
          classId={classId}
          sessionLabel={viewSession.sessionLabel}
          recovery={recovery}
        />
      </Suspense>
    </div>
  );
}

async function PaymentDeskDataLoader({
  staff,
  classOptions,
  studentId,
  classId,
  sessionLabel,
  recovery,
}: {
  staff: Awaited<ReturnType<typeof requireStaffPermission>>;
  classOptions: Array<{ id: string; label: string }>;
  studentId: string | null;
  classId: string | null;
  sessionLabel: string;
  recovery: boolean;
}) {
  const t = await getTranslations("Payments");
  const canWritePayments = hasStaffPermission(staff, "payments:write");
  const readinessPromise = getPaymentDeskReadiness({
    sessionLabel,
    staffAppRole: staff.appRole,
    canWritePayments,
  });
  if (!studentId) {
    // Readiness and page data use independent reads, so start them together for normal desk opens.
    const [readiness, data] = await Promise.all([
      readinessPromise,
      getPaymentEntryPageData({
        searchQuery: "",
        studentId,
        classId: classId ?? undefined,
        sessionLabel,
        autoPrepareMissingDues: false,
        initialSelectedSummary: null,
      }),
    ]);
    const { canPostPayments } = readiness;
    const blockingReason = translateBlockingReason(readiness.blockingReason, t);
    const translatedData = {
      ...data,
      initialStudentIssue: translateBlockingReason(data.initialStudentIssue, t),
    };

    return (
      <>
        <div className="flex justify-end">
          <StatusBadge
            label={canPostPayments ? t("postingEnabled") : t("readOnlyAccess")}
            tone={canPostPayments ? "good" : "warning"}
          />
        </div>

        {blockingReason ? (
          <WorkflowGuard
            title={blockingReason.title}
            detail={blockingReason.detail}
            actionLabel={blockingReason.actionLabel}
            actionHref={blockingReason.actionHref}
          />
        ) : null}

        <PaymentEntryClient
          data={translatedData}
          canPost={canPostPayments}
          canViewDiagnostics={staff.appRole === "admin"}
          canWaiveLateFee={hasStaffPermission(staff, "payments:waive_late_fee")}
          canOverrideNearDuplicate={hasStaffPermission(staff, "payments:adjust")}
          canUndoPayment={hasStaffPermission(staff, "payments:adjust")}
          undoRecentPaymentAction={undoRecentPaymentAction}
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

  // Start readiness and all page data (including selected-student summary) in one parallel phase
  // so the student index, recent receipts, and today collection load alongside the summary.
  const [readiness, data] = await Promise.all([
    readinessPromise,
    getPaymentEntryPageData({
      searchQuery: "",
      studentId,
      classId: classId ?? undefined,
      sessionLabel,
      autoPrepareMissingDues: false,
    }),
  ]);
  const { canPostPayments } = readiness;
  const blockingReason = translateBlockingReason(readiness.blockingReason, t);
  const translatedData = {
    ...data,
    initialStudentIssue: translateBlockingReason(data.initialStudentIssue, t),
    collectionContext: recovery ? ("left_student_recovery" as const) : undefined,
  };

  return (
    <>
      {recovery ? (
        <OfficeNotice title="Recovery mode — left student" tone="warning">
          You are collecting against this student&apos;s <strong>existing pending dues</strong>.
          Posting will not re-enrol the student or create new dues.
        </OfficeNotice>
      ) : null}
      <div className="flex justify-end">
        <StatusBadge
          label={canPostPayments ? t("postingEnabled") : t("readOnlyAccess")}
          tone={canPostPayments ? "good" : "warning"}
        />
      </div>

      {blockingReason ? (
        <WorkflowGuard
          title={blockingReason.title}
          detail={blockingReason.detail}
          actionLabel={blockingReason.actionLabel}
          actionHref={blockingReason.actionHref}
        />
      ) : null}

      <PaymentEntryClient
        data={translatedData}
        canPost={canPostPayments}
        canViewDiagnostics={staff.appRole === "admin"}
        canWaiveLateFee={hasStaffPermission(staff, "payments:waive_late_fee")}
        canOverrideNearDuplicate={hasStaffPermission(staff, "payments:adjust")}
        canUndoPayment={hasStaffPermission(staff, "payments:adjust")}
        undoRecentPaymentAction={undoRecentPaymentAction}
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
