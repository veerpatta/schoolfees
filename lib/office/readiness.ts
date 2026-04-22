import type { StaffRole } from "@/lib/auth/roles";
import type { SetupReadinessSummary, SetupWizardData } from "@/lib/setup/types";

export type OfficeWorkflowKey =
  | "add_student"
  | "import_students"
  | "recalculate_ledgers"
  | "post_payments"
  | "reports";

export type OfficeWorkflowReadinessInput = {
  classCount: number;
  hasFeeDefaults: boolean;
  hasStudents: boolean;
  ledgerReady: boolean;
  collectionDeskReady: boolean;
  setupReadyForCompletion: boolean;
};

export type OfficeWorkflowGuard = {
  key: OfficeWorkflowKey;
  isReady: boolean;
  title: string;
  detail: string;
  actionLabel: string | null;
  actionHref: string | null;
};

export type OfficeWorkflowReadiness = {
  addStudent: OfficeWorkflowGuard;
  importStudents: OfficeWorkflowGuard;
  recalculateLedgers: OfficeWorkflowGuard;
  postPayments: OfficeWorkflowGuard;
  reports: OfficeWorkflowGuard;
};

function buildGuard(
  key: OfficeWorkflowKey,
  role: StaffRole,
  payload: {
    title: string;
    adminDetail: string;
    nonAdminDetail: string;
    actionLabel: string | null;
    actionHref: string | null;
  },
): OfficeWorkflowGuard {
  return {
    key,
    isReady: false,
    title: payload.title,
    detail: role === "admin" ? payload.adminDetail : payload.nonAdminDetail,
    actionLabel: role === "admin" ? payload.actionLabel : null,
    actionHref: role === "admin" ? payload.actionHref : null,
  };
}

function buildReadyGuard(
  key: OfficeWorkflowKey,
  payload: {
    title: string;
    detail: string;
  },
): OfficeWorkflowGuard {
  return {
    key,
    isReady: true,
    title: payload.title,
    detail: payload.detail,
    actionLabel: null,
    actionHref: null,
  };
}

export function buildOfficeWorkflowReadiness(
  input: OfficeWorkflowReadinessInput,
  role: StaffRole,
): OfficeWorkflowReadiness {
  const addStudent = input.classCount > 0
    ? buildReadyGuard("add_student", {
        title: "Student entry is ready.",
        detail: "Classes are available for the active session.",
      })
    : buildGuard("add_student", role, {
        title: "Add classes before entering students.",
        adminDetail:
          "The active session does not have any classes yet. Add classes first, then return to student entry.",
        nonAdminDetail:
          "Student entry is waiting for admin setup. Classes for the active session are still missing.",
        actionLabel: "Add classes now",
        actionHref: "/protected/setup#classes",
      });

  const importStudents =
    input.classCount > 0 && input.hasFeeDefaults
      ? buildReadyGuard("import_students", {
          title: "Student import is ready.",
          detail: "Session classes and fee defaults are in place for safe import.",
        })
      : buildGuard("import_students", role, {
          title: "Finish setup before importing students.",
          adminDetail:
            input.classCount === 0
              ? "Create the active session classes first so import rows can map cleanly."
              : "Configure school and class fee defaults before importing students.",
          nonAdminDetail:
            "Student import is waiting on admin setup. The active session classes or fee defaults are incomplete.",
          actionLabel: input.classCount === 0 ? "Go to Setup" : "Configure fee defaults",
          actionHref:
            input.classCount === 0 ? "/protected/setup#classes" : "/protected/setup#class-defaults",
        });

  const recalculateLedgers =
    input.hasFeeDefaults && input.hasStudents
      ? buildReadyGuard("recalculate_ledgers", {
          title: input.ledgerReady
            ? "Ledger recalculation is up to date."
            : "Ledger recalculation is ready.",
          detail: input.ledgerReady
            ? "Students and resolved fee defaults are already in sync for the current session."
            : "Students and resolved fee defaults are available for preview.",
        })
      : buildGuard("recalculate_ledgers", role, {
          title: "Students and fee defaults are required before recalculation.",
          adminDetail:
            !input.hasStudents
              ? "Import or add students first, then preview ledger recalculation."
              : "Configure school and class fee defaults first, then preview ledger recalculation.",
          nonAdminDetail:
            "Ledger recalculation is waiting on admin setup or student import.",
          actionLabel: !input.hasStudents ? "Import students" : "Configure fee defaults",
          actionHref: !input.hasStudents ? "/protected/imports" : "/protected/fee-setup",
        });

  const postPayments = input.collectionDeskReady
    ? buildReadyGuard("post_payments", {
        title: "Payment posting is ready.",
        detail: "Setup, student import, and ledger preparation are complete for collection work.",
      })
    : buildGuard("post_payments", role, {
        title: "Finish setup before posting payments.",
        adminDetail:
          input.setupReadyForCompletion
            ? "Mark the setup stage complete after the final review, then start collections."
            : "Clear the remaining setup blockers before opening the collection desk for live posting.",
        nonAdminDetail:
          "Payment posting is waiting on admin setup. The collection desk is not ready yet.",
        actionLabel: input.setupReadyForCompletion ? "Mark setup complete" : "Go to Setup",
        actionHref: input.setupReadyForCompletion ? "/protected/setup#complete" : "/protected/setup",
      });

  const reports =
    input.classCount > 0 && (input.hasStudents || input.hasFeeDefaults)
      ? buildReadyGuard("reports", {
          title: "Operational views are ready.",
          detail: "The app has enough setup data to open workbook-style dues and receipt views.",
        })
      : buildGuard("reports", role, {
          title: "Finish setup before relying on reports.",
          adminDetail:
            "Add classes and fee defaults first so dues and receipt views have useful operational data.",
          nonAdminDetail:
            "Operational views are limited until admin setup and student import are complete.",
          actionLabel: "Open Setup",
          actionHref: "/protected/setup",
        });

  return {
    addStudent,
    importStudents,
    recalculateLedgers,
    postPayments,
    reports,
  };
}

function hasChecklistItem(readiness: SetupReadinessSummary, key: string) {
  return readiness.checklist.some((item) => item.key === key && item.status === "complete");
}

export function getOfficeWorkflowReadiness(
  setup: SetupWizardData,
  role: StaffRole,
) {
  return buildOfficeWorkflowReadiness(
    {
      classCount: setup.activeSessionClasses.length,
      hasFeeDefaults: hasChecklistItem(setup.readiness, "fee_defaults_configured"),
      hasStudents: setup.activeSessionStudentCount > 0,
      ledgerReady: hasChecklistItem(setup.readiness, "ledgers_generated"),
      collectionDeskReady: setup.readiness.collectionDeskReady,
      setupReadyForCompletion: setup.readiness.readyForCompletion,
    },
    role,
  );
}
