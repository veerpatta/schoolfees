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
  message:
    "Marked as left from 2026-10-15. 2 later installments stopped. 2 installments already carry money and stay charged — write off the balance below if it will never be collected. Receipts and payment history stay saved.",
  deleted: false,
}));

const reinstateStudentAction = vi.fn(async () => ({
  status: "success" as const,
  message: "Back on the roll as active, leave date cleared. No installments needed restoring.",
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
  reinstateStudentAction: (...args: unknown[]) =>
    (reinstateStudentAction as unknown as (...a: unknown[]) => unknown)(...args),
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

const { StudentDangerZone } = await import("@/modules/students/ui/student-danger-zone");
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

type Enrolment = { status: string; joinedOn: string | null; leftOn: string | null };

const ACTIVE_ENROLMENT: Enrolment = { status: "active", joinedOn: "2026-04-01", leftOn: null };
const LEFT_ENROLMENT: Enrolment = { status: "left", joinedOn: "2026-04-01", leftOn: "2026-10-15" };

function renderZone(enrolment: Enrolment = ACTIVE_ENROLMENT) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <StudentDangerZone studentId="s-1" deletionSafety={safety} enrolment={enrolment} />
      <ToastViewport />
    </NextIntlClientProvider>,
  );
}

/** Opens the Mark-as-left sheet and fills the two required fields. */
async function markAsLeft(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /withdraw student/i }));
  const reason = await screen.findByLabelText(/reason/i);
  await user.type(reason, "TC issued");
  await user.click(screen.getByRole("button", { name: /^mark as left$/i }));
}

describe("StudentDangerZone feedback", () => {
  it("asks for a leave date before withdrawing, and refreshes on success", async () => {
    const user = userEvent.setup();
    renderZone();

    // Withdrawing is no longer one click. The DATE decides which installments
    // stop being charged, so the button opens a sheet rather than writing
    // status='left' and guessing — which is what cancelled fees for months a
    // child had actually attended.
    await markAsLeft(user);

    // Both inside the same waitFor: the refresh fires from useActionFeedback's
    // effect AFTER the action state settles, not synchronously with the submit.
    // Asserted bare it passed alone and flaked under a loaded full-suite run,
    // which is the worst of both.
    await waitFor(() => {
      expect(archiveStudentAction).toHaveBeenCalled();
      expect(refresh).toHaveBeenCalled();
    });
  });

  it("keeps the outcome on screen instead of closing on success", async () => {
    const user = userEvent.setup();
    renderZone();

    await markAsLeft(user);

    // The message says how many installments were stopped AND how many could
    // not be, because money is receipted against them. Closing the sheet on
    // success would throw that away — it is the whole reason a leaver can be
    // left with a balance nobody expected.
    await waitFor(() => {
      // Twice on purpose: the transient toast AND the status line inside the
      // sheet, which is the copy that has to outlive five seconds.
      expect(screen.getAllByText(/2 installments already carry money/i).length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.getByRole("button", { name: /^done$/i })).toBeInTheDocument();
  });

  it("offers a way back for a student marked left by mistake", async () => {
    const user = userEvent.setup();
    renderZone(LEFT_ENROLMENT);

    // A leave date is typed by hand and will be typed wrong.
    expect(screen.getByText(/from/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /back on the roll/i }));

    await waitFor(() => {
      expect(reinstateStudentAction).toHaveBeenCalled();
    });
  });

  it("carries the delete confirmation to the students list", async () => {
    const user = userEvent.setup();
    renderZone();

    await user.type(screen.getByLabelText(/type sr/i), "2712");
    await user.click(screen.getByRole("button", { name: /delete wrong student/i }));

    // The banner text travels in the URL, because a toast fired while the page
    // is navigating away is easy to miss entirely.
    //
    // waitFor, because `replace` is called from useActionFeedback's onSuccess —
    // a useEffect that runs after the action state settles, not synchronously
    // inside the click. Asserted bare, this passed on a quiet machine and
    // failed on a loaded CI runner, which is the worst of both.
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(
        expect.stringContaining("/protected/students?removed="),
      );
    });
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
      screen.getByRole("button", { name: /write off this year’s balance \(₹4,500\)/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /write off old balance \(₹1,200\)/i }),
    ).toBeInTheDocument();
  });

  it("hides the old-balance action when there is no previous-year balance", () => {
    renderWithCloseBalance({ oldBalanceAmount: 0 });

    expect(screen.queryByRole("button", { name: /write off old balance/i })).toBeNull();
    expect(
      screen.getByRole("button", { name: /write off this year’s balance/i }),
    ).toBeInTheDocument();
  });

  it("shows nothing to close when the student owes nothing at all", () => {
    renderWithCloseBalance({ pendingAmount: 0, oldBalanceAmount: 0 });

    expect(screen.queryByText(/write off a balance/i)).toBeNull();
  });

  it("is absent entirely when the caller passes no closeBalance payload", () => {
    renderZone();

    expect(screen.queryByText(/write off a balance/i)).toBeNull();
  });

  it("opens the old-balance sheet describing a write-off, not a discount override", async () => {
    const user = userEvent.setup();
    renderWithCloseBalance();

    await user.click(screen.getByRole("button", { name: /write off old balance/i }));

    await waitFor(() => {
      expect(screen.getByText(/write off the old balance/i)).toBeInTheDocument();
    });
    // The old copy claimed it "adds the amount to this student's discount
    // override", which the action never did.
    expect(screen.getByText(/never counts as collection/i)).toBeInTheDocument();
    expect(screen.queryByText(/discount override/i)).toBeNull();
  });
});
