import "server-only";

import {
  buildWorkbookInstallmentCharges,
  isWorkbookSession,
} from "@/modules/fees/domain/workbook";
import { applyConventionalDiscountsToTuition } from "@/modules/fees/domain/conventional-discount-rules";
import type { ClassFeeDefault, FeeHeadAmount, FeeHeadDefinition, FeePolicySummary, ResolvedFeeBreakdown, SchoolFeeDefault, StudentConventionalDiscountAssignment, StudentFeeOverride, TransportDefault } from "@/modules/fees/domain/types";
import { titleCaseFromKey } from "@/modules/fees/domain/policy-shaping";

export function buildResolvedBreakdown(payload: {
  tuitionBeforeConventionalDiscount?: number;
  conventionalDiscountApplied?: number;
  conventionalDiscountLabels?: string[];
  tuitionFee: number;
  transportFee: number;
  booksFee: number;
  admissionActivityMiscFee: number;
  customFeeHeadAmounts: Record<string, number>;
  customFeeHeads: FeeHeadDefinition[];
  calculationModel?: FeePolicySummary["calculationModel"];
  studentType?: "new" | "existing";
  academicFeeAmount?: number;
  otherAdjustmentHead?: string | null;
  otherAdjustmentAmount?: number;
  grossBaseBeforeDiscount?: number;
  discountApplied?: number;
  lateFeeWaiverAmount?: number;
  annualTotal?: number;
  booksExcludedFromWorkbook?: boolean;
  /**
   * Workbook only. When present, these replace the single collapsed
   * "Other fee / adjustment" row. Their amounts MUST already sum to
   * `otherAdjustmentAmount` — the totals below are driven by the scalar, so a
   * mismatch shows up as a breakdown that does not add up to its own total.
   */
  otherAdjustmentHeads?: FeeHeadAmount[];
}): ResolvedFeeBreakdown {
  const customHeadMap = new Map(
    payload.customFeeHeads.map((item) => [item.id, item.label]),
  );

  const isWorkbook = payload.calculationModel === "workbook_v1";
  const otherAdjustmentHeads = isWorkbook ? payload.otherAdjustmentHeads ?? [] : [];

  // Per-student named heads render as their own rows in place of the collapsed
  // "Other fee / adjustment" line. They are NOT appended to `customHeads`:
  // buildFeeBreakupDisplayRows renders [...coreHeads, ...customHeads], so a head
  // in both places would show up twice, and the totals below sum customHeads.
  const otherAdjustmentRows =
    otherAdjustmentHeads.length > 0
      ? otherAdjustmentHeads.map((head) => ({
          id: `other_adjustment:${head.id}`,
          label: head.label,
          amount: head.amount,
        }))
      : [
          {
            id: "other_adjustment",
            label: payload.otherAdjustmentHead?.trim() || "Other fee / adjustment",
            amount: payload.otherAdjustmentAmount ?? 0,
          },
        ];

  const coreHeads = isWorkbook
    ? [
        { id: "tuition_fee", label: "Tuition fee", amount: payload.tuitionFee },
        { id: "transport_fee", label: "Transport fee", amount: payload.transportFee },
        {
          id: "academic_fee",
          label: "Academic fee",
          amount: Math.max(0, payload.academicFeeAmount ?? 0),
        },
        ...otherAdjustmentRows,
      ]
    : [
        { id: "tuition_fee", label: "Tuition fee", amount: payload.tuitionFee },
        { id: "transport_fee", label: "Transport fee", amount: payload.transportFee },
        { id: "books_fee", label: "Books fee", amount: payload.booksFee },
        {
          id: "admission_activity_misc_fee",
          label: "Admission / activity / misc fee",
          amount: payload.admissionActivityMiscFee,
        },
      ];

  const customHeads = isWorkbook
    ? []
    : Object.entries(payload.customFeeHeadAmounts)
        .map(([id, amount]) => ({
          id,
          label: customHeadMap.get(id) ?? titleCaseFromKey(id),
          amount,
        }))
        .sort((left, right) => left.label.localeCompare(right.label));

  const annualTotal =
    payload.annualTotal ??
    (coreHeads.reduce((sum, item) => sum + item.amount, 0) +
      customHeads.reduce((sum, item) => sum + item.amount, 0));

  return {
    coreHeads,
    customHeads,
    otherAdjustmentHeads,
    annualTotal,
    calculationModel: payload.calculationModel ?? "standard",
    studentType: payload.studentType ?? "existing",
    academicFeeAmount: Math.max(0, payload.academicFeeAmount ?? 0),
    otherAdjustmentHead: payload.otherAdjustmentHead ?? null,
    otherAdjustmentAmount: payload.otherAdjustmentAmount ?? 0,
    grossBaseBeforeDiscount:
      payload.grossBaseBeforeDiscount ??
      (coreHeads.reduce((sum, item) => sum + item.amount, 0) +
        customHeads.reduce((sum, item) => sum + item.amount, 0)),
    discountApplied: Math.max(0, payload.discountApplied ?? 0),
    conventionalDiscountApplied: Math.max(
      0,
      Math.trunc(payload.conventionalDiscountApplied ?? 0),
    ),
    conventionalDiscountLabels: payload.conventionalDiscountLabels ?? [],
    tuitionBeforeConventionalDiscount:
      payload.tuitionBeforeConventionalDiscount ?? payload.tuitionFee,
    lateFeeWaiverAmount: Math.max(0, payload.lateFeeWaiverAmount ?? 0),
    booksExcludedFromWorkbook: Boolean(payload.booksExcludedFromWorkbook),
  };
}

export function resolveStudentPolicyBreakdown(payload: {
  policy: FeePolicySummary;
  schoolDefault: SchoolFeeDefault;
  classDefault: ClassFeeDefault | null;
  routeDefault: TransportDefault | null;
  studentOverride: StudentFeeOverride | null;
  conventionalDiscountAssignments?: StudentConventionalDiscountAssignment[];
  hasTransportRoute: boolean;
}) {
  const base = payload.classDefault ?? payload.schoolDefault;
  const baseCustomAmounts = base.customFeeHeadAmounts;
  const overrideCustomAmounts = payload.studentOverride?.customFeeHeadAmounts ?? {};
  const mergedCustomAmounts = payload.policy.customFeeHeads.reduce<Record<string, number>>(
    (acc, item) => {
      const overrideAmount = overrideCustomAmounts[item.id];
      const baseAmount = baseCustomAmounts[item.id];
      acc[item.id] =
        overrideAmount !== undefined ? overrideAmount : baseAmount ?? 0;
      return acc;
    },
    {},
  );
  const effectiveStudentType =
    payload.studentOverride?.studentTypeOverride ?? base.studentTypeDefault;
  const lateFeeFlatAmount =
    payload.studentOverride?.customLateFeeFlatAmount ??
    payload.policy.lateFeeFlatAmount;
  const lateFeeWaiverAmount = payload.studentOverride?.lateFeeWaiverAmount ?? 0;
  const classSessionLabel = payload.classDefault?.sessionLabel ?? payload.policy.academicSessionLabel;
  const routeAnnualAmount =
    payload.hasTransportRoute && payload.routeDefault
      ? (payload.routeDefault.annualFeeAmount ??
          payload.routeDefault.defaultInstallmentAmount * payload.policy.installmentCount)
      : 0;

  if (isWorkbookSession(payload.policy, classSessionLabel)) {
    const legacyOtherAdjustmentEntries = Object.entries(overrideCustomAmounts).filter(
      ([, amount]) => amount !== 0,
    );
    const fallbackOtherAdjustmentAmount = legacyOtherAdjustmentEntries.reduce(
      (sum, [, amount]) => sum + amount,
      0,
    );
    const otherAdjustmentHead =
      payload.studentOverride?.otherAdjustmentHead?.trim() ||
      (legacyOtherAdjustmentEntries.length === 1
        ? titleCaseFromKey(legacyOtherAdjustmentEntries[0]![0])
        : legacyOtherAdjustmentEntries.length > 1
          ? "Other fee / adjustment"
          : null);
    const otherAdjustmentAmount =
      payload.studentOverride?.otherAdjustmentAmount ?? fallbackOtherAdjustmentAmount;

    // Named per-student heads, expanded into their own display rows. Only used
    // when the scalar other_adjustment_amount is NOT set — the scalar wins in
    // both engines (see the CASE in v_workbook_student_financials), so honouring
    // the jsonb here too would make the rows disagree with the total.
    const overrideHeadLabels =
      payload.studentOverride?.customOtherFeeHeadLabels ?? {};
    const otherAdjustmentHeads =
      payload.studentOverride?.otherAdjustmentAmount == null
        ? legacyOtherAdjustmentEntries.map(([id, amount]) => ({
            id,
            label: overrideHeadLabels[id]?.trim() || titleCaseFromKey(id),
            amount,
          }))
        : [];

    const customTuitionFeeAmount =
      payload.studentOverride?.customTuitionFeeAmount ?? null;
    const hasCustomTuition = customTuitionFeeAmount !== null;
    const tuitionBeforeConventionalDiscount = hasCustomTuition
      ? customTuitionFeeAmount
      : base.tuitionFee;
    // A per-student custom tuition is an explicit, reason-logged decision. It
    // REPLACES any conventional policy (RTE / Staff Child / 3rd Child) for this
    // student rather than stacking with it, so the discount is not applied on
    // top. The write path clears the assignments and nets the backfilled
    // conventional amount out of discount_amount, which is what keeps this
    // agreeing with v_workbook_student_financials (the view has no notion of
    // which part of discount_amount was conventional).
    const conventionalDiscountEffect = hasCustomTuition
      ? {
          beforeTuition: tuitionBeforeConventionalDiscount,
          resultingTuition: tuitionBeforeConventionalDiscount,
          discountApplied: 0,
          appliedLabels: [] as string[],
        }
      : applyConventionalDiscountsToTuition({
          baseTuition: tuitionBeforeConventionalDiscount,
          assignments: payload.conventionalDiscountAssignments ?? [],
        });
    const tuitionFee = conventionalDiscountEffect.resultingTuition;
    const transportFee =
      payload.studentOverride?.customTransportFeeAmount ??
      (payload.hasTransportRoute ? routeAnnualAmount : 0);
    const academicFeeAmount =
      effectiveStudentType === "new"
        ? payload.policy.newStudentAcademicFeeAmount
        : payload.policy.oldStudentAcademicFeeAmount;
    // Patch C (2026-05-24, docs/go-live/POLICY-FIX-2026-05-24.md) backfilled
    // conventional-policy discounts into student_fee_overrides.discount_amount
    // for ~68 students so the workbook view could surface the discount line.
    // The resolver also applies the conventional discount independently, so
    // we subtract that portion here — the override now means "owner-extra
    // discount on top of conventional".
    const remainingOwnerDiscount = Math.max(
      0,
      (payload.studentOverride?.discountAmount ?? 0) -
        conventionalDiscountEffect.discountApplied,
    );
    const workbookCharges = buildWorkbookInstallmentCharges({
      installmentCount: payload.policy.installmentCount,
      tuitionFee,
      transportFee,
      academicFee: academicFeeAmount,
      otherAdjustmentAmount,
      discountAmount: remainingOwnerDiscount,
      academicFeeDistribution: payload.policy.academicFeeDistribution,
    });

    return {
      breakdown: buildResolvedBreakdown({
        tuitionFee,
        tuitionBeforeConventionalDiscount,
        transportFee,
        booksFee: 0,
        admissionActivityMiscFee: 0,
        customFeeHeadAmounts: {},
        customFeeHeads: [],
        calculationModel: payload.policy.calculationModel,
        studentType: effectiveStudentType,
        academicFeeAmount,
        otherAdjustmentHead,
        otherAdjustmentAmount,
        otherAdjustmentHeads,
        grossBaseBeforeDiscount: workbookCharges.grossBaseBeforeDiscount,
        discountApplied: workbookCharges.discountApplied,
        conventionalDiscountApplied: conventionalDiscountEffect.discountApplied,
        conventionalDiscountLabels: conventionalDiscountEffect.appliedLabels,
        lateFeeWaiverAmount,
        annualTotal: workbookCharges.baseTotalDue,
        booksExcludedFromWorkbook: true,
      }),
      lateFeeFlatAmount,
      activeOverrideReason: payload.studentOverride?.reason ?? null,
    };
  }

  const transportEnabled =
    payload.studentOverride?.transportAppliesOverride ??
    base.transportAppliesDefault;
  const admissionActivityMiscFee =
    payload.studentOverride?.customAdmissionActivityMiscFeeAmount ??
    (effectiveStudentType === "new" ? base.admissionActivityMiscFee : 0);
  const transportFee = transportEnabled
    ? payload.studentOverride?.customTransportFeeAmount ??
      (payload.hasTransportRoute ? routeAnnualAmount : base.transportFee)
    : 0;
  const legacyTuitionFee =
    payload.studentOverride?.customTuitionFeeAmount ?? base.tuitionFee;
  const conventionalDiscountEffect = applyConventionalDiscountsToTuition({
    baseTuition: legacyTuitionFee,
    assignments: payload.conventionalDiscountAssignments ?? [],
  });
  const tuitionFee = conventionalDiscountEffect.resultingTuition;
  const legacyBooksFee =
    payload.studentOverride?.customBooksFeeAmount ?? base.booksFee;
  const legacyGrossBaseBeforeDiscount =
    tuitionFee +
    transportFee +
    legacyBooksFee +
    admissionActivityMiscFee +
    Object.values(mergedCustomAmounts).reduce((sum, value) => sum + value, 0);
  // See workbook branch above for the rationale.
  const legacyRemainingOwnerDiscount = Math.max(
    0,
    (payload.studentOverride?.discountAmount ?? 0) -
      conventionalDiscountEffect.discountApplied,
  );

  const breakdown = buildResolvedBreakdown({
    tuitionFee,
    tuitionBeforeConventionalDiscount: legacyTuitionFee,
    transportFee,
    booksFee: legacyBooksFee,
    admissionActivityMiscFee,
    customFeeHeadAmounts: mergedCustomAmounts,
    customFeeHeads: payload.policy.customFeeHeads,
    calculationModel: payload.policy.calculationModel,
    studentType: effectiveStudentType,
    grossBaseBeforeDiscount: legacyGrossBaseBeforeDiscount,
    discountApplied: legacyRemainingOwnerDiscount,
    conventionalDiscountApplied: conventionalDiscountEffect.discountApplied,
    conventionalDiscountLabels: conventionalDiscountEffect.appliedLabels,
    lateFeeWaiverAmount,
  });

  return {
    breakdown,
    lateFeeFlatAmount,
    activeOverrideReason: payload.studentOverride?.reason ?? null,
  };
}

