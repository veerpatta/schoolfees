import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { FeeSetupClient } from "@/components/fees/fee-setup-client";
import type { FeeSetupActionState, FeeSetupPageData } from "@/lib/fees/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const noopFeeSetupAction = async (): Promise<FeeSetupActionState> => ({
  status: "idle",
  message: null,
  changeBatchId: null,
  preview: null,
  syncOutcome: null,
});

const noopMasterDataAction = async () => ({ status: "idle" as const, message: "" });

function pageData(): FeeSetupPageData {
  return {
    globalPolicy: {
      id: "policy-1",
      academicSessionLabel: "TEST-2026-27",
      calculationModel: "workbook_v1",
      installmentCount: 4,
      installmentSchedule: [
        { label: "Installment 1", dueDateLabel: "20 Apr 2026", dueDate: "2026-04-20" },
      ],
      lateFeeFlatAmount: 1000,
      lateFeeLabel: "Flat late fee",
      newStudentAcademicFeeAmount: 1100,
      oldStudentAcademicFeeAmount: 500,
      acceptedPaymentModes: [{ value: "cash", label: "Cash" }],
      receiptPrefix: "SVP",
      customFeeHeads: [],
      notes: null,
    },
    policySnapshots: [
      {
        id: "policy-1",
        academicSessionLabel: "TEST-2026-27",
        calculationModel: "workbook_v1",
        installmentCount: 4,
        installmentSchedule: [
          { label: "Installment 1", dueDateLabel: "20 Apr 2026", dueDate: "2026-04-20" },
        ],
        lateFeeFlatAmount: 1000,
        lateFeeLabel: "Flat late fee",
        newStudentAcademicFeeAmount: 1100,
        oldStudentAcademicFeeAmount: 500,
        acceptedPaymentModes: [{ value: "cash", label: "Cash" }],
        receiptPrefix: "SVP",
        customFeeHeads: [],
        notes: null,
        isActive: true,
        updatedAt: "2026-05-21T00:00:00.000Z",
      },
    ],
    schoolDefault: {
      id: "school-default",
      tuitionFee: 0,
      transportFee: 0,
      booksFee: 0,
      admissionActivityMiscFee: 0,
      customFeeHeadAmounts: {},
      studentTypeDefault: "existing",
      transportAppliesDefault: false,
      notes: null,
      updatedAt: null,
    },
    classDefaults: [
      {
        id: "fee-class-1",
        classId: "class-1",
        classLabel: "Class 1",
        sessionLabel: "TEST-2026-27",
        tuitionFee: 18000,
        transportFee: 0,
        booksFee: 0,
        admissionActivityMiscFee: 0,
        customFeeHeadAmounts: {},
        annualTotal: 18000,
        studentTypeDefault: "existing",
        transportAppliesDefault: false,
        notes: null,
        updatedAt: "2026-05-21T00:00:00.000Z",
      },
    ],
    transportDefaults: [],
    studentOverrides: [],
    conventionalDiscountPolicies: [],
    conventionalDiscountAssignments: [],
    classOptions: [{ id: "class-1", label: "Class 1", sessionLabel: "TEST-2026-27" }],
    studentOptions: [],
    routeOptions: [],
  };
}

describe("FeeSetupClient", () => {
  it("opens the default Basic Fee Rules section so the panel is not blank", () => {
    const html = renderToStaticMarkup(
      <FeeSetupClient
        data={pageData()}
        masterData={{
          sessions: [
            {
              id: "session-1",
              session_label: "TEST-2026-27",
              status: "active",
              is_current: false,
              notes: null,
              created_at: "2026-05-21T00:00:00.000Z",
              updated_at: "2026-05-21T00:00:00.000Z",
            },
          ],
          classes: [],
          routes: [],
        }}
        canEdit={true}
        saveWorkbookFeeSetupAction={noopFeeSetupAction}
        initialState={{
          status: "idle",
          message: null,
          changeBatchId: null,
          preview: null,
          syncOutcome: null,
        }}
        initialMasterDataState={{ status: "idle", message: "" }}
        initialSelectedSessionLabel="TEST-2026-27"
        actions={{
          createSessionAction: noopMasterDataAction,
          updateSessionAction: noopMasterDataAction,
          deleteSessionAction: noopMasterDataAction,
          copySessionAction: noopMasterDataAction,
          createClassAction: noopMasterDataAction,
          updateClassAction: noopMasterDataAction,
          deleteClassAction: noopMasterDataAction,
          createRouteAction: noopMasterDataAction,
          updateRouteAction: noopMasterDataAction,
          deleteRouteAction: noopMasterDataAction,
        }}
      />,
    );

    expect(html).toMatch(/<details class="group md:contents ?" open="">[\s\S]*2\. Basic Fee Rules/);
    expect(html).toContain("2. Basic Fee Rules");
    expect(html).toContain("Late Fee");
  });
});
