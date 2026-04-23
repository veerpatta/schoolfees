import type {
  ClassFeeDefault,
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

export function toWorkbookDueDateInputValue(
  item: Pick<FeePolicySummary["installmentSchedule"][number], "dueDate"> | undefined,
) {
  return item?.dueDate ?? "";
}

export function buildWorkbookClassSetupRows(
  data: Pick<FeeSetupPageData, "classOptions" | "classDefaults">,
  academicSessionLabel: string,
): WorkbookFeeSetupClassRow[] {
  const classOptionByLabel = new Map(
    data.classOptions
      .filter((item) => item.sessionLabel === academicSessionLabel)
      .map((item) => [getWorkbookClassKey(item.label), item]),
  );
  const classDefaultByLabel = new Map(
    data.classDefaults
      .filter((item) => item.sessionLabel === academicSessionLabel)
      .map((item) => [getWorkbookClassKey(item.classLabel), item]),
  );

  return WORKBOOK_CLASS_TUITION_DEFAULTS.map((item) => {
    const matchedClass = classOptionByLabel.get(item.label) ?? null;
    const matchedDefault = classDefaultByLabel.get(item.label) ?? null;

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
}

export function buildWorkbookRouteSetupRows(
  data: Pick<FeeSetupPageData, "transportDefaults">,
): WorkbookFeeSetupRouteRow[] {
  const routeByName = new Map(
    data.transportDefaults.map((item) => [normalizeWorkbookRouteName(item.routeName), item]),
  );

  return WORKBOOK_ROUTE_FEE_DEFAULTS.map((item) => {
    const matchedRoute = routeByName.get(normalizeWorkbookRouteName(item.routeName)) ?? null;

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
}

export function buildWorkbookSetupSnapshot(
  data: Pick<
    FeeSetupPageData,
    "globalPolicy" | "classOptions" | "classDefaults" | "transportDefaults"
  >,
  academicSessionLabel: string,
) {
  return {
    academicSessionLabel: data.globalPolicy.academicSessionLabel,
    installmentDates: data.globalPolicy.installmentSchedule.map((item) =>
      toWorkbookDueDateInputValue(item),
    ),
    lateFeeFlatAmount: data.globalPolicy.lateFeeFlatAmount,
    newStudentAcademicFeeAmount: data.globalPolicy.newStudentAcademicFeeAmount,
    oldStudentAcademicFeeAmount: data.globalPolicy.oldStudentAcademicFeeAmount,
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
