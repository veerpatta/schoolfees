import type {
  ClassFeeDefault,
  FeeHeadDefinition,
  FeePolicySnapshot,
  FeePolicySummary,
  FeeSetupPageData,
  TransportDefault,
} from "@/lib/fees/types";
import {
  normalizeWorkbookClassLabel,
  normalizeWorkbookRouteName,
  WORKBOOK_CLASS_TUITION_DEFAULTS,
  WORKBOOK_ROUTE_FEE_DEFAULTS,
} from "@/lib/fees/workbook";

export type WorkbookFeeSetupFormPayload = {
  academicSessionLabel: string;
  installmentDates: string[];
  lateFeeFlatAmount: number;
  newStudentAcademicFeeAmount: number;
  oldStudentAcademicFeeAmount: number;
  customFeeHeads: FeeHeadDefinition[];
  classRows: Array<{
    label: string;
    annualTuition: number;
  }>;
  routeRows: Array<{
    routeName: string;
    annualFee: number;
  }>;
};

export type WorkbookFeeSetupClassRow = {
  label: string;
  sortOrder: number;
  suggestedAnnualTuition: number;
  annualTuition: number;
  classId: string | null;
  hasClassRecord: boolean;
  hasSavedDefault: boolean;
  updatedAt: string | null;
  existingClassDefault: ClassFeeDefault | null;
};

export type WorkbookFeeSetupRouteRow = {
  routeName: string;
  suggestedAnnualFee: number;
  annualFee: number;
  routeId: string | null;
  hasRouteRecord: boolean;
  updatedAt: string | null;
  existingRouteDefault: TransportDefault | null;
};

function getWorkbookClassKey(value: string) {
  return normalizeWorkbookClassLabel(value) ?? value.trim();
}

export function getSessionPolicySnapshot(
  data: Pick<FeeSetupPageData, "globalPolicy" | "policySnapshots">,
  academicSessionLabel: string,
): FeePolicySummary | FeePolicySnapshot {
  return (
    data.policySnapshots.find((item) => item.academicSessionLabel === academicSessionLabel) ??
    data.globalPolicy
  );
}

export function toWorkbookDueDateInputValue(
  item: Pick<FeePolicySummary["installmentSchedule"][number], "dueDate"> | undefined,
) {
  return item?.dueDate ?? "";
}

export function buildWorkbookClassSetupRows(
  data: Pick<FeeSetupPageData, "classOptions" | "classDefaults">,
  academicSessionLabel: string,
): WorkbookFeeSetupClassRow[] {
  const sessionClassOptions = data.classOptions.filter(
    (item) => item.sessionLabel === academicSessionLabel,
  );
  const sessionClassDefaults = data.classDefaults.filter(
    (item) => item.sessionLabel === academicSessionLabel,
  );
  const classOptionByLabel = new Map(
    sessionClassOptions.map((item) => [getWorkbookClassKey(item.label), item]),
  );
  const classDefaultByLabel = new Map(
    sessionClassDefaults.map((item) => [getWorkbookClassKey(item.classLabel), item]),
  );
  const usedKeys = new Set<string>();
  const seededRows = WORKBOOK_CLASS_TUITION_DEFAULTS.map((item) => {
    const key = item.label;
    const matchedClass = classOptionByLabel.get(key) ?? null;
    const matchedDefault = classDefaultByLabel.get(key) ?? null;
    usedKeys.add(key);

    return {
      label: item.label,
      sortOrder: item.sortOrder,
      suggestedAnnualTuition: item.annualTuition,
      annualTuition: matchedDefault?.tuitionFee ?? item.annualTuition,
      classId: matchedClass?.id ?? matchedDefault?.classId ?? null,
      hasClassRecord: Boolean(matchedClass ?? matchedDefault),
      hasSavedDefault: Boolean(matchedDefault),
      updatedAt: matchedDefault?.updatedAt ?? null,
      existingClassDefault: matchedDefault,
    };
  });
  const extraRows = sessionClassOptions
    .filter((item) => !usedKeys.has(getWorkbookClassKey(item.label)))
    .map((item, index) => {
      const key = getWorkbookClassKey(item.label);
      const matchedDefault = classDefaultByLabel.get(key) ?? null;

      return {
        label: item.label,
        sortOrder: WORKBOOK_CLASS_TUITION_DEFAULTS.length + index + 1,
        suggestedAnnualTuition: matchedDefault?.tuitionFee ?? 0,
        annualTuition: matchedDefault?.tuitionFee ?? 0,
        classId: item.id,
        hasClassRecord: true,
        hasSavedDefault: Boolean(matchedDefault),
        updatedAt: matchedDefault?.updatedAt ?? null,
        existingClassDefault: matchedDefault,
      };
    });

  return [...seededRows, ...extraRows];
}

export function buildWorkbookRouteSetupRows(
  data: Pick<FeeSetupPageData, "transportDefaults">,
): WorkbookFeeSetupRouteRow[] {
  const routeByName = new Map(
    data.transportDefaults.map((item) => [normalizeWorkbookRouteName(item.routeName), item]),
  );
  const usedKeys = new Set<string>();
  const seededRows = WORKBOOK_ROUTE_FEE_DEFAULTS.map((item) => {
    const matchedRoute = routeByName.get(normalizeWorkbookRouteName(item.routeName)) ?? null;
    usedKeys.add(normalizeWorkbookRouteName(item.routeName));

    return {
      routeName: item.routeName,
      suggestedAnnualFee: item.annualFee,
      annualFee: matchedRoute?.annualFeeAmount ?? item.annualFee,
      routeId: matchedRoute?.id ?? null,
      hasRouteRecord: Boolean(matchedRoute),
      updatedAt: matchedRoute?.updatedAt ?? null,
      existingRouteDefault: matchedRoute,
    };
  });
  const extraRows = data.transportDefaults
    .filter((item) => !usedKeys.has(normalizeWorkbookRouteName(item.routeName)))
    .map((item) => ({
      routeName: item.routeName,
      suggestedAnnualFee: item.annualFeeAmount ?? 0,
      annualFee: item.annualFeeAmount ?? 0,
      routeId: item.id,
      hasRouteRecord: true,
      updatedAt: item.updatedAt,
      existingRouteDefault: item,
    }));

  return [...seededRows, ...extraRows];
}

export function buildWorkbookSetupSnapshot(
  data: Pick<
    FeeSetupPageData,
    "globalPolicy" | "policySnapshots" | "classOptions" | "classDefaults" | "transportDefaults"
  >,
  academicSessionLabel: string,
) {
  const policy = getSessionPolicySnapshot(data, academicSessionLabel);

  return {
    academicSessionLabel: policy.academicSessionLabel,
    installmentDates: policy.installmentSchedule.map((item) => toWorkbookDueDateInputValue(item)),
    lateFeeFlatAmount: policy.lateFeeFlatAmount,
    newStudentAcademicFeeAmount: policy.newStudentAcademicFeeAmount,
    oldStudentAcademicFeeAmount: policy.oldStudentAcademicFeeAmount,
    customFeeHeads: policy.customFeeHeads,
    targetSessionLabel: academicSessionLabel,
    classRows: buildWorkbookClassSetupRows(data, academicSessionLabel).map((item) => ({
      label: item.label,
      classId: item.classId,
      hasClassRecord: item.hasClassRecord,
      hasSavedDefault: item.hasSavedDefault,
      annualTuition: item.existingClassDefault?.tuitionFee ?? null,
    })),
    routeRows: buildWorkbookRouteSetupRows(data).map((item) => ({
      routeName: item.routeName,
      routeId: item.routeId,
      hasRouteRecord: item.hasRouteRecord,
      annualFee: item.existingRouteDefault?.annualFeeAmount ?? null,
      isActive: item.existingRouteDefault?.isActive ?? false,
    })),
  };
}
