import { render, screen, waitFor } from "@testing-library/react";
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

// The Danger Zone now owns the close-balance sheet, whose server action reaches
// lib/supabase/session and therefore "server-only". Same treatment as the two
// actions above.
const closeDueAsDiscountAction = vi.fn(async () => ({
  status: "success" as const,
  message: "Balance closed.",
  receiptNumber: "SVP20260808-0001",
}));

vi.mock("@/app/protected/students/close-due-actions", () => ({
  closeDueAsDiscountAction: (...args: unknown[]) =>
    (closeDueAsDiscountAction as unknown as (...a: unknown[]) => unknown)(...args),
}));

const { StudentDangerZone } = await import("@/components/students/student-danger-zone");
const { ToastViewport } = await import("@/ui/primitives/toast");

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
    // waitFor, not findAllByText — the latter resolves on the FIRST match, so
    // it races whichever of the two renders first and flakes under load.
    await waitFor(() => {
      expect(
        screen.getAllByText("Student withdrawn. Receipts and payment history stay saved."),
      ).toHaveLength(2);
    });
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

// The close-balance action moved here from the Transactions table (where any
// finance:write holder could reach it mid-row) and from a phone-only card on the
// student profile that the desktop never rendered. It now sits behind the same
// admin gate as withdraw and delete, on both layouts.
describe("StudentDangerZone close balance as discount", () => {
  const closeBalance = {
    studentLabel: "KUSAM REGAR",
    studentAdmissionNo: "2712",
    classLabel: "Class 5",
    sessionLabel: "TEST-2026-27",
    pendingAmount: 4500,
    oldBalanceAmount: 1200,
  };

  function renderWithCloseBalance(overrides: Partial<typeof closeBalance> = {}) {
    return render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <StudentDangerZone
          studentId="s-1"
          deletionSafety={safety}
          closeBalance={{ ...closeBalance, ...overrides }}
        />
        <ToastViewport />
      </NextIntlClientProvider>,
    );
  }

  it("offers both this year's balance and the old balance, each with its amount", () => {
    renderWithCloseBalance();

    expect(
      screen.getByRole("button", { name: /close this year’s balance \(₹4,500\)/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /close old balance \(₹1,200\)/i }),
    ).toBeInTheDocument();
  });

  it("hides the old-balance action when there is no previous-year balance", () => {
    renderWithCloseBalance({ oldBalanceAmount: 0 });

    expect(screen.queryByRole("button", { name: /close old balance/i })).toBeNull();
    expect(
      screen.getByRole("button", { name: /close this year’s balance/i }),
    ).toBeInTheDocument();
  });

  it("shows nothing to close when the student owes nothing at all", () => {
    renderWithCloseBalance({ pendingAmount: 0, oldBalanceAmount: 0 });

    expect(screen.queryByText(/close a balance as discount/i)).toBeNull();
  });

  it("is absent entirely when the caller passes no closeBalance payload", () => {
    renderZone();

    expect(screen.queryByText(/close a balance as discount/i)).toBeNull();
  });

  it("opens the old-balance sheet describing a write-off, not a discount override", async () => {
    const user = userEvent.setup();
    renderWithCloseBalance();

    await user.click(screen.getByRole("button", { name: /close old balance/i }));

    await waitFor(() => {
      expect(screen.getByText(/close old balance as discount/i)).toBeInTheDocument();
    });
    // The old copy claimed it "adds the amount to this student's discount
    // override", which the action never did.
    expect(screen.getByText(/posts a discount receipt/i)).toBeInTheDocument();
    expect(screen.queryByText(/discount override/i)).toBeNull();
  });
});
