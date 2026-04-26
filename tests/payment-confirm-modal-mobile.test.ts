import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ConfirmationAllocationSummary } from "@/components/payments/payment-entry-client";

describe("payment confirm modal mobile allocation summary", () => {
  const rows = [
    {
      installmentId: "i-1",
      installmentLabel: "Installment 1",
      dueDate: "2026-04-20",
      allocatedAmount: 500,
      outstandingAfter: 1500,
    },
    {
      installmentId: "i-2",
      installmentLabel: "Installment 2",
      dueDate: "2026-07-20",
      allocatedAmount: 750,
      outstandingAfter: 1250,
    },
  ];

  it("renders stacked card rows for mobile and keeps table for md+ only", () => {
    const markup = renderToStaticMarkup(
      createElement(ConfirmationAllocationSummary, { allocationPreview: rows }),
    );

    expect(markup).toContain("md:hidden");
    expect(markup).toContain("md:block");
    expect(markup).toContain("Installment 1");
    expect(markup).toContain("Installment 2");
    expect(markup).toMatchSnapshot();
  });

  it("shows empty-state helper text when there are no rows", () => {
    const markup = renderToStaticMarkup(
      createElement(ConfirmationAllocationSummary, { allocationPreview: [] }),
    );

    expect(markup).toContain("No installment allocation rows are available");
  });
});

describe("payment confirm modal mobile UX guardrails", () => {
  const sourcePath = resolve(process.cwd(), "components/payments/payment-entry-client.tsx");
  const source = readFileSync(sourcePath, "utf-8");
  const confirmModalSection = source.split("{isConfirmOpen && confirmationSummary ? (")[1] ?? source;

  it("keeps critical fields block above student metadata", () => {
    const amountIndex = confirmModalSection.indexOf("Payment amount");
    const dateIndex = confirmModalSection.indexOf("Payment date");
    const modeIndex = confirmModalSection.indexOf("Payment mode");
    const remainingIndex = confirmModalSection.indexOf("Remaining balance");
    const studentNameIndex = confirmModalSection.indexOf("Student name:");

    expect(amountIndex).toBeGreaterThan(-1);
    expect(dateIndex).toBeGreaterThan(amountIndex);
    expect(modeIndex).toBeGreaterThan(dateIndex);
    expect(remainingIndex).toBeGreaterThan(modeIndex);
    expect(studentNameIndex).toBeGreaterThan(remainingIndex);
  });

  it("keeps sticky footer action bar visible without horizontal wrapper", () => {
    expect(confirmModalSection).toContain('className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-white px-4 py-3 md:px-5"');
    expect(confirmModalSection).not.toContain("mt-4 overflow-x-auto rounded-lg border border-slate-200");
  });
});
