import { describe, expect, it } from "vitest";

import {
  normalizeFeeHeadDefinition,
  parseFeeHeadCatalog,
} from "@/lib/fees/fee-heads";

describe("fee head metadata", () => {
  it("defaults Phase 1 metadata for old custom fee-head JSON", () => {
    expect(
      normalizeFeeHeadDefinition({
        id: "Lab Fee",
        label: "Lab Fee",
        amount: 1200,
        applicationType: "split_across_installments",
        isActive: true,
        notes: "Science lab",
      }),
    ).toEqual({
      id: "lab_fee",
      label: "Lab Fee",
      amount: 1200,
      applicationType: "split_across_installments",
      isRefundable: false,
      chargeFrequency: "one_time",
      isMandatory: true,
      includeInWorkbookCalculation: false,
      isActive: true,
      notes: "Science lab",
    });
  });

  it("preserves explicit Phase 1 metadata", () => {
    expect(
      normalizeFeeHeadDefinition({
        id: "security_deposit",
        label: "Security Deposit",
        amount: 5000,
        applicationType: "installment_1_only",
        isRefundable: true,
        chargeFrequency: "recurring",
        isMandatory: false,
        includeInWorkbookCalculation: true,
        isActive: false,
        notes: "",
      }),
    ).toEqual({
      id: "security_deposit",
      label: "Security Deposit",
      amount: 5000,
      applicationType: "installment_1_only",
      isRefundable: true,
      chargeFrequency: "recurring",
      isMandatory: false,
      includeInWorkbookCalculation: true,
      isActive: false,
      notes: null,
    });
  });

  it("deduplicates parsed fee-head catalog rows by normalized id", () => {
    expect(
      parseFeeHeadCatalog([
        { id: "Lab Fee", label: "Lab Fee", amount: 100 },
        { id: "lab_fee", label: "Duplicate Lab Fee", amount: 200 },
      ]),
    ).toHaveLength(1);
  });
});
