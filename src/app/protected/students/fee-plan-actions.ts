"use server";

import { after } from "next/server";

import { recordActivity } from "@/modules/activity/data/events";
import { normalizeFeeHeadId } from "@/platform/config/fee-rules";
import {
  applyConventionalDiscountsToTuition,
  getStudentConventionalDiscountAssignments,
  saveStudentConventionalDiscountAssignments,
} from "@/modules/fees/data/conventional-discounts";
import { upsertStudentFeeOverride } from "@/modules/fees/domain/queries";
import { createClient } from "@/platform/supabase/server";
import { requireStaffPermission } from "@/platform/supabase/session";
import { prepareDuesForStudentsAutomatically } from "@/modules/system-sync/domain/finance-sync";
import { drainFinancialViewRefresh } from "@/modules/system-sync/data/financial-view-refresh";
import { publishOfficeSyncEvent } from "@/modules/system-sync/data/office-sync-events";
import {
  MAX_CUSTOM_FEE_HEADS,
  MAX_FEE_HEAD_LABEL_LENGTH,
  type StudentFeePlanActionState,
} from "./fee-plan-action-state";

type OverrideRow = {
  custom_books_fee_amount: number | null;
  custom_admission_activity_misc_fee_amount: number | null;
  custom_late_fee_flat_amount: number | null;
  late_fee_waiver_amount: number | null;
  discount_amount: number | null;
  student_type_override: "new" | "existing" | null;
  transport_applies_override: boolean | null;
  notes: string | null;
};

function fail(message: string): StudentFeePlanActionState {
  return { status: "error", message, duesNeedAttention: false };
}

/**
 * "default" clears the column so the class/route figure applies again;
 * "custom" requires a whole non-negative amount.
 */
function parseModeAmount(
  formData: FormData,
  modeField: string,
  amountField: string,
  label: string,
): { ok: true; value: number | null } | { ok: false; message: string } {
  const mode = (formData.get(modeField) ?? "default").toString().trim();

  if (mode !== "custom") {
    return { ok: true, value: null };
  }

  const raw = (formData.get(amountField) ?? "").toString().trim();
  if (!raw) {
    return { ok: false, message: `Enter a ${label} amount, or switch back to the default.` };
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    return { ok: false, message: `${label} must be a whole amount of ₹0 or more.` };
  }

  return { ok: true, value: parsed };
}

type ParsedHeads = {
  amounts: Record<string, number>;
  labels: Record<string, string>;
};

function parseNamedHeads(
  formData: FormData,
): { ok: true; value: ParsedHeads } | { ok: false; message: string } {
  const rawLabels = formData.getAll("headLabel").map((entry) => entry.toString());
  const rawAmounts = formData.getAll("headAmount").map((entry) => entry.toString());

  const amounts: Record<string, number> = {};
  const labels: Record<string, string> = {};
  let kept = 0;

  for (let index = 0; index < rawLabels.length; index += 1) {
    const label = (rawLabels[index] ?? "").trim();
    const amountRaw = (rawAmounts[index] ?? "").trim();

    // A wholly blank row is a row the admin added and left alone.
    if (!label && !amountRaw) {
      continue;
    }

    if (!label) {
      return { ok: false, message: "Give every extra fee head a name." };
    }

    if (label.length > MAX_FEE_HEAD_LABEL_LENGTH) {
      return {
        ok: false,
        message: `Fee head names must be ${MAX_FEE_HEAD_LABEL_LENGTH} characters or fewer.`,
      };
    }

    const amount = Number(amountRaw);
    if (!amountRaw || !Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
      // Negatives are rejected on purpose: the workbook matview sums this map
      // with ::integer and would count a negative that the TS resolver drops,
      // so the fee table and the projection would disagree. Reductions belong
      // in the signed "Other adjustment" field on the Edit Student page.
      return {
        ok: false,
        message: `"${label}" needs a whole amount above ₹0. Use the Other adjustment field for a reduction.`,
      };
    }

    kept += 1;
    if (kept > MAX_CUSTOM_FEE_HEADS) {
      return {
        ok: false,
        message: `Add at most ${MAX_CUSTOM_FEE_HEADS} extra fee heads for one student.`,
      };
    }

    const baseSlug = normalizeFeeHeadId(label);
    if (!baseSlug) {
      return { ok: false, message: `"${label}" is not a usable fee head name.` };
    }

    // "Lab fee" and "Lab Fee" both normalise to lab_fee; suffix so the second
    // one does not silently overwrite the first.
    let slug = baseSlug;
    let suffix = 2;
    while (slug in amounts) {
      slug = `${baseSlug}_${suffix}`;
      suffix += 1;
    }

    amounts[slug] = amount;
    labels[slug] = label;
  }

  return { ok: true, value: { amounts, labels } };
}

/**
 * Saves a student's custom fee plan: a per-student tuition and/or transport
 * amount plus any number of named extra heads. Admin-only via `fees:write`.
 *
 * Unlike the late-fee waiver, this DOES change installment amounts, so the dues
 * rebuild is awaited — returning early would re-render the page with stale
 * figures. `sessionLabel` is always passed so the sync takes its fast branch.
 */
export async function saveStudentFeePlanAction(
  _previous: StudentFeePlanActionState,
  formData: FormData,
): Promise<StudentFeePlanActionState> {
  try {
    const staff = await requireStaffPermission("fees:write");

    const studentId = (formData.get("studentId") ?? "").toString().trim();
    const sessionLabel = (formData.get("sessionLabel") ?? "").toString().trim();
    const reason = (formData.get("reason") ?? "").toString().trim();

    if (!studentId) {
      return fail("Student is required.");
    }
    if (!sessionLabel) {
      return fail("Academic session is required.");
    }
    if (reason.length < 4) {
      return fail("Add a reason (at least 4 characters) so the audit trail explains the change.");
    }

    const tuition = parseModeAmount(formData, "tuitionMode", "tuitionAmount", "Tuition");
    if (!tuition.ok) return fail(tuition.message);

    const transport = parseModeAmount(formData, "transportMode", "transportAmount", "Transport");
    if (!transport.ok) return fail(transport.message);

    const heads = parseNamedHeads(formData);
    if (!heads.ok) return fail(heads.message);

    const supabase = await createClient();
    const { data: existingRaw, error: existingError } = await supabase
      .from("student_fee_overrides")
      .select(
        "custom_books_fee_amount, custom_admission_activity_misc_fee_amount, custom_late_fee_flat_amount, late_fee_waiver_amount, discount_amount, student_type_override, transport_applies_override, notes",
      )
      .eq("student_id", studentId)
      .eq("is_active", true)
      .maybeSingle();

    if (existingError) {
      return fail(existingError.message);
    }

    const existing = (existingRaw ?? null) as OverrideRow | null;
    let discountAmount = existing?.discount_amount ?? 0;
    let clearedPolicyLabels: string[] = [];

    // "Custom wins outright" only actually holds if the conventional discount
    // stops being subtracted. Patch C backfilled conventional discounts into
    // discount_amount, and the workbook matview reads that column with no
    // notion of which part was conventional — so the fix has to happen here,
    // on the write, or the two engines disagree.
    if (tuition.value !== null) {
      const assignments = await getStudentConventionalDiscountAssignments({
        academicSessionLabel: sessionLabel,
        studentIds: [studentId],
      });
      const activeAssignments = assignments.filter((item) => item.isActive);

      if (activeAssignments.length > 0) {
        const backfilled = applyConventionalDiscountsToTuition({
          baseTuition: activeAssignments[0]!.beforeTuitionAmount,
          assignments: activeAssignments,
        }).discountApplied;

        discountAmount = Math.max(0, discountAmount - backfilled);
        clearedPolicyLabels = activeAssignments.map((item) => item.policy.displayName);

        await saveStudentConventionalDiscountAssignments({
          studentId,
          academicSessionLabel: sessionLabel,
          policyIds: [],
          reason,
          notes: null,
          baseTuition: tuition.value,
        });
      }
    }

    await upsertStudentFeeOverride({
      studentId,
      customTuitionFeeAmount: tuition.value,
      customTransportFeeAmount: transport.value,
      // Preserved verbatim — this editor does not own these fields, and
      // dropping late_fee_waiver_amount would silently un-waive late fees.
      customBooksFeeAmount: existing?.custom_books_fee_amount ?? null,
      customAdmissionActivityMiscFeeAmount:
        existing?.custom_admission_activity_misc_fee_amount ?? null,
      customLateFeeFlatAmount: existing?.custom_late_fee_flat_amount ?? null,
      lateFeeWaiverAmount: existing?.late_fee_waiver_amount ?? 0,
      studentTypeOverride: existing?.student_type_override ?? null,
      transportAppliesOverride: existing?.transport_applies_override ?? null,
      notes: existing?.notes ?? null,
      discountAmount,
      customFeeHeadAmounts: heads.value.amounts,
      customOtherFeeHeadLabels: heads.value.labels,
      customFeeHeads: [],
      allowUncatalogedHeads: true,
      // The named heads are the source of truth for this student, so the scalar
      // must be cleared: both engines prefer other_adjustment_amount when set,
      // which would strand the jsonb rows.
      otherAdjustmentHead: null,
      otherAdjustmentAmount: null,
      reason,
      useAdminClient: true,
    });

    // Awaited on purpose — see the doc comment. A fee-head change rewrites
    // installments.base_amount, so the page must not re-render before it lands.
    const dues = await prepareDuesForStudentsAutomatically({
      studentIds: [studentId],
      sessionLabel,
      reason: "Student fee plan updated",
      useSystemClient: true,
    });

    after(async () => {
      await drainFinancialViewRefresh();

      try {
        await publishOfficeSyncEvent({
          sessionLabel,
          entityType: "student",
          entityId: studentId,
          action: "fee_plan_updated",
          affectedStudentIds: [studentId],
          metadata: {
            customTuitionFeeAmount: tuition.value,
            customTransportFeeAmount: transport.value,
            extraFeeHeadCount: Object.keys(heads.value.amounts).length,
          },
        });
      } catch {
        // Office sync is best-effort.
      }

      try {
        await recordActivity({
          userId: (staff.id as string | undefined) ?? null,
          kind: "student_edited",
          refId: studentId,
          payload: {
            action: "fee_plan_updated",
            customTuitionFeeAmount: tuition.value,
            customTransportFeeAmount: transport.value,
            extraFeeHeads: heads.value.labels,
            clearedConventionalPolicies: clearedPolicyLabels,
            reason,
          },
        });
      } catch {
        // Activity logging is best-effort.
      }
    });

    const clearedNote = clearedPolicyLabels.length
      ? ` ${clearedPolicyLabels.join(" and ")} removed for this student.`
      : "";
    const duesNote =
      dues.duesNeedAttentionCount > 0
        ? " Dues need attention — check the student's dues tab."
        : "";

    return {
      status: "success",
      message: `Fee plan saved.${clearedNote}${duesNote}`,
      duesNeedAttention: dues.duesNeedAttentionCount > 0,
    };
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Unable to save the fee plan right now.",
    );
  }
}
