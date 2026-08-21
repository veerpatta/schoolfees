import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PendingSubmitButton } from "@/ui/shell/pending-submit-button";

/** Never resolves, so the pending state stays observable. */
function hangingAction() {
  return new Promise<void>(() => {});
}

describe("PendingSubmitButton", () => {
  it("keeps the original idleLabel/pendingLabel string API working", async () => {
    const user = userEvent.setup();
    render(
      <form action={hangingAction}>
        <PendingSubmitButton idleLabel="Reconcile" pendingLabel="Reconciling..." />
      </form>,
    );

    const button = screen.getByRole("button", { name: "Reconcile" });
    await user.click(button);

    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveTextContent("Reconciling...");
  });

  it("keeps the idle label beside the spinner when no pendingLabel is given", async () => {
    const user = userEvent.setup();
    render(
      <form action={hangingAction}>
        <PendingSubmitButton>Approve</PendingSubmitButton>
      </form>,
    );

    const button = screen.getByRole("button", { name: "Approve" });
    await user.click(button);

    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveTextContent("Approve");
  });

  // The reason this exists: a money-moving control must not fire twice.
  it("cannot be submitted twice", async () => {
    const user = userEvent.setup();
    const action = vi.fn(hangingAction);

    render(
      <form action={action}>
        <PendingSubmitButton>Approve refund</PendingSubmitButton>
      </form>,
    );

    const button = screen.getByRole("button", { name: "Approve refund" });
    await user.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    await user.click(button);

    expect(action).toHaveBeenCalledTimes(1);
  });

  it("stays disabled when the caller disables it, even while idle", () => {
    render(
      <form action={hangingAction}>
        <PendingSubmitButton disabled>Blocked</PendingSubmitButton>
      </form>,
    );

    expect(screen.getByRole("button", { name: "Blocked" })).toBeDisabled();
  });
});
