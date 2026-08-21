import type { getTranslations } from "next-intl/server";

import type { PaymentDeskBlockingReasonKey } from "@/lib/payments/data";

type Translator = Awaited<ReturnType<typeof getTranslations<"Payments">>>;

type IssueLike = {
  key?: string;
  keyValues?: Record<string, string | number>;
  title: string;
  detail: string;
  actionLabel: string | null;
  actionHref?: string | null;
  repairStudentId?: string | null;
};

type TranslatedIssue = {
  title: string;
  detail: string;
  actionLabel: string | null;
  actionHref: string | null;
  repairStudentId?: string | null;
};

const TITLE_KEYS: Record<PaymentDeskBlockingReasonKey, string> = {
  read_only: "blockingReasonReadOnlyTitle",
  no_policy: "blockingReasonNoPolicyTitle",
  no_active_class: "blockingReasonNoClassTitle",
  selected_student_missing: "blockingReasonNoStudentTitle",
  selected_student_inactive: "blockingReasonInactiveStudentTitle",
  selected_student_session_mismatch: "blockingReasonSessionMismatchTitle",
  selected_student_review_needed: "blockingReasonReviewNeededTitle",
  dues_prepare_failed: "blockingReasonPrepareFailedTitle",
  dues_load_failed: "blockingReasonLoadFailedTitle",
  dues_not_prepared: "blockingReasonNotPreparedTitle",
};

const DETAIL_KEYS: Partial<Record<PaymentDeskBlockingReasonKey, string>> = {
  read_only: "blockingReasonReadOnlyDetail",
  no_policy: "blockingReasonNoPolicyDetail",
  no_active_class: "blockingReasonNoClassDetail",
  selected_student_missing: "blockingReasonNoStudentDetail",
  selected_student_inactive: "blockingReasonInactiveStudentDetail",
  selected_student_session_mismatch: "blockingReasonSessionMismatchDetail",
  selected_student_review_needed: "blockingReasonReviewNeededDetail",
  dues_prepare_failed: "blockingReasonPrepareFailedDetailFallback",
};

const ACTION_KEYS: Partial<Record<PaymentDeskBlockingReasonKey, string>> = {
  no_policy: "blockingReasonNoPolicyAction",
  no_active_class: "blockingReasonNoClassAction",
  selected_student_missing: "blockingReasonNoStudentAction",
  selected_student_inactive: "blockingReasonInactiveStudentAction",
  selected_student_session_mismatch: "blockingReasonSessionMismatchAction",
  selected_student_review_needed: "blockingReasonReviewNeededAction",
  dues_prepare_failed: "blockingReasonPrepareFailedAction",
  dues_load_failed: "blockingReasonLoadFailedAction",
};

/**
 * Translate a Payment Desk blocking reason / student issue by its stable key.
 * Falls back to the English string shipped from the server data layer when
 * the key is missing or when only a dynamic detail is available.
 */
export function translateBlockingReason<T extends IssueLike | null>(
  reason: T,
  t: Translator,
): T extends null ? null : TranslatedIssue {
  if (!reason) {
    return null as T extends null ? null : TranslatedIssue;
  }

  const key = reason.key as PaymentDeskBlockingReasonKey | undefined;
  const titleKey = key ? TITLE_KEYS[key] : undefined;
  const detailKey = key ? DETAIL_KEYS[key] : undefined;
  const actionKey = key ? ACTION_KEYS[key] : undefined;
  const values = reason.keyValues;

  // For dues_load_failed and dues_not_prepared, the detail is a friendly
  // wrapper around a backend error — keep the server-shipped string instead
  // of forcing a generic translated phrase. The keyValues carry the same
  // detail when available so future Hindi/Hinglish reviewers can localize.
  const useServerDetailDirectly =
    key === "dues_load_failed" || (key === "dues_not_prepared" && Boolean(values?.detail));

  return {
    title: titleKey ? t(titleKey as Parameters<Translator>[0], values) : reason.title,
    detail:
      useServerDetailDirectly || !detailKey
        ? reason.detail
        : t(detailKey as Parameters<Translator>[0], values),
    actionLabel:
      reason.actionLabel === null
        ? null
        : actionKey
          ? t(actionKey as Parameters<Translator>[0], values)
          : reason.actionLabel,
    actionHref: reason.actionHref ?? null,
    repairStudentId: reason.repairStudentId ?? null,
  } as T extends null ? null : TranslatedIssue;
}
