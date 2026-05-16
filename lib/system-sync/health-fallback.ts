import type { SystemSyncHealth } from "@/lib/system-sync/finance-sync";

type DatabaseObjectStatusKey = keyof SystemSyncHealth["requiredDatabaseObjectsStatus"];

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function unavailableObjectStatus(
  key: DatabaseObjectStatusKey,
  label: string,
  objectName: string,
  message: string,
) {
  return {
    key,
    label,
    objectName,
    required: true,
    usable: false,
    message,
  };
}

export function buildUnavailableSystemSyncHealth(
  sessionLabel: string,
  errorMessage: string,
): SystemSyncHealth {
  const message = `Automatic health check could not finish: ${errorMessage}`;

  return {
    activeFeePolicySession: sessionLabel,
    activeFeePolicyCalculationModel: "unavailable",
    academicCurrentSession: sessionLabel,
    sessionMismatch: false,
    activeSession: sessionLabel,
    academicSessionsCurrentSession: sessionLabel,
    sessionsMatch: true,
    activeStudentsBySession: [],
    workbookFinancialRowsBySession: [],
    importBatchesByTargetSession: [],
    importBatchesByTargetSessionStatus: [],
    studentsMissingInstallments: [],
    studentsOutsideActiveFeeSession: [],
    classSessionMismatchStudents: [],
    classesMissingFeeSettings: [],
    classRowsWithoutFeeSettings: [],
    workbookFinancialRowCount: 0,
    rawStudentsInActiveSession: 0,
    studentsShownInDefaultWorkspace: 0,
    studentsWithFinancialRows: 0,
    studentsMissingFinancialRows: 0,
    studentsMissingInstallmentRows: 0,
    studentsWithNoFeeSetting: 0,
    studentsInInactiveOrWrongSession: 0,
    studentsMissingDues: 0,
    classesWithoutFeeSettings: 0,
    routesWithoutAnnualFees: 0,
    requiredDatabaseObjectsStatus: {
      vWorkbookStudentFinancials: unavailableObjectStatus(
        "vWorkbookStudentFinancials",
        "Workbook student financials view",
        "public.v_workbook_student_financials",
        message,
      ),
      vWorkbookInstallmentBalances: unavailableObjectStatus(
        "vWorkbookInstallmentBalances",
        "Workbook installment balances view",
        "public.v_workbook_installment_balances",
        message,
      ),
      previewWorkbookPaymentAllocation: unavailableObjectStatus(
        "previewWorkbookPaymentAllocation",
        "Payment preview function",
        "public.preview_workbook_payment_allocation(uuid, date)",
        message,
      ),
      postStudentPayment: unavailableObjectStatus(
        "postStudentPayment",
        "Payment posting function",
        "public.post_student_payment",
        message,
      ),
      privateWorkbookInstallmentSnapshot: unavailableObjectStatus(
        "privateWorkbookInstallmentSnapshot",
        "Workbook installment snapshot helper",
        "private.workbook_installment_snapshot",
        message,
      ),
    },
    paymentPreviewReady: false,
    paymentDeskReady: false,
    dashboardReady: false,
    warnings: [],
    errors: [message],
  };
}

export function isUnavailableSystemSyncHealth(health: SystemSyncHealth) {
  return health.errors.some((message) =>
    message.startsWith("Automatic health check could not finish:"),
  );
}
