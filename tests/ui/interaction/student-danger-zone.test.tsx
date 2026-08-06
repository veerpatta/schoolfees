import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import messages from "@/messages/en.json";

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", async (original) => {
  const real = (await original()) as Record<string, unknown>;
  return {
    ...real,
    useRouter: () => ({
      push: vi.fn(),
      replace,
      refresh,
      back: vi.fn(),
      forward: vi.fn(),
      prefetch: vi.fn(),
    }),
  };
});

const archiveStudentAction = vi.fn(async () => ({
  status: "success" as const,
  message: "Student withdrawn. Receipts and payment history stay saved.",
  deleted: false,
}));

const hardDeleteStudentAction = vi.fn(async () => ({
  status: "success" as const,
  message: "KUSAM REGAR (SR 2712) was deleted.",
  deleted: true,
}));

vi.mock("@/app/protected/students/actions", () => ({
  archiveStudentAction: (...args: unknown[]) =>
    (archiveStudentAction as unknown as (...a: unknown[]) => unknown)(...args),
  hardDeleteStudentAction: (...args: unknown[]) =>
    (hardDeleteStudentAction as unknown as (...a: unknown[]) => unknown)(...args),
}));

const { StudentDangerZone } = await import("@/components/students/student-danger-zone");
const { ToastViewport } = await import("@/components/ui/toast");

const safety = {
  studentId: "s-1",
  hasFinancialHistory: false,
  hardDeleteAllowed: true,
  generatedDuesDeleteAllowed: false,
  canForceDeleteTestRecord: false,
  installmentCount: 0,
  receiptCount: 0,
  paymentCount: 0,
  adjustmentCount: 0,
  refundRequestCount: 0,
  blockedInstallmentCount: 0,
  ledgerRegenerationRowCount: 0,
  importReferenceCount: 0,
  feeOverrideCount: 0,
  auditLogCount: 0,
  receiptAdjustmentCount: 0,
  receiptFinanceAdjustmentCount: 0,
  carryForwardBalanceCount: 0,
  sessionReanchorLogCount: 0,
  paymentImportRowCount: 0,
  hardDeleteBlockers: [],
  sessionLabel: "2026-27",
  admissionNo: "2712",
  fullName: "KUSAM REGAR",
};

function renderZone() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <StudentDangerZone studentId="s-1" deletionSafety={safety} />
      <ToastViewport />
    </NextIntlClientProvider>,
  );
}

describe("StudentDangerZone feedback", () => {
  it("confirms a withdrawal and refreshes the page", async () => {
    const user = userEvent.setup();
    renderZone();

    await user.click(screen.getByRole("button", { name: /withdraw student/i }));

    // Reported twice on purpose: the transient toast and the panel message.
    const shown = await screen.findAllByText(
      "Student withdrawn. Receipts and payment history stay saved.",
    );
    expect(shown.length).toBeGreaterThanOrEqual(2);
    expect(refresh).toHaveBeenCalled();
  });

  // The toast lasts five seconds; the panel message stays until the next
  // action, so a refresh happening underneath cannot swallow the result.
  it("leaves the confirmation on the panel, not only in a toast", async () => {
    const user = userEvent.setup();
    const { container } = renderZone();

    await user.click(screen.getByRole("button", { name: /withdraw student/i }));

    const statuses = await screen.findAllByRole("status");
    expect(
      statuses.some((node) =>
        node.textContent?.includes("Student withdrawn. Receipts and payment history stay saved."),
      ),
    ).toBe(true);

    // ...and the panel it lives in must not collapse on the refresh.
    expect(container.querySelector("details")).toHaveAttribute("open");
  });

  it("carries the delete confirmation to the students list", async () => {
    const user = userEvent.setup();
    renderZone();

    await user.type(screen.getByLabelText(/type sr/i), "2712");
    await user.click(screen.getByRole("button", { name: /delete wrong student/i }));

    // The banner text travels in the URL, because a toast fired while the page
    // is navigating away is easy to miss entirely.
    expect(replace).toHaveBeenCalledWith(
      expect.stringContaining("/protected/students?removed="),
    );
    expect(decodeURIComponent(replace.mock.calls.at(-1)![0] as string)).toContain(
      "KUSAM REGAR (SR 2712)",
    );
  });
});
