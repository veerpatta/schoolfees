import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PendingSubmitButton } from "@/ui/shell/pending-submit-button";

/**
 * Approve / Reject / Mark processed move a parent's money. Each sits in its
 * own <form>, so a second press before the first returns is a second request.
 *
 * The server does guard (approve_refund throws unless the request is still
 * pending_approval — app/protected/finance-controls/actions.ts), so a double
 * approve fails safely. This asserts the UI half: the second press never
 * happens in the first place, so staff never see a confusing error for an
 * action that actually worked.
 */
describe("money-moving refund controls", () => {
  it("cannot be pressed twice", async () => {
    const user = userEvent.setup();
    const approve = vi.fn(() => new Promise<void>(() => {}));

    render(
      <form action={approve}>
        <input type="hidden" name="workflowAction" value="approve_refund" />
        <PendingSubmitButton size="sm">Approve</PendingSubmitButton>
      </form>,
    );

    const button = screen.getByRole("button", { name: "Approve" });

    await user.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    await user.click(button);
    await user.click(button);

    expect(approve).toHaveBeenCalledTimes(1);
  });

  it("keeps its label and styling while pending", async () => {
    const user = userEvent.setup();

    render(
      <form action={() => new Promise<void>(() => {})}>
        <PendingSubmitButton
          size="sm"
          className="bg-success text-success-foreground"
        >
          Approve
        </PendingSubmitButton>
      </form>,
    );

    const button = screen.getByRole("button", { name: "Approve" });
    await user.click(button);

    await waitFor(() => expect(button).toHaveAttribute("aria-busy", "true"));
    // The affordance that distinguishes Approve from Reject must survive the
    // pending state — they are opposite money movements.
    expect(button.className).toContain("bg-success");
    expect(button).toHaveTextContent("Approve");
  });

  it("does not block a different form on the same page", async () => {
    const user = userEvent.setup();
    const reject = vi.fn(() => new Promise<void>(() => {}));

    render(
      <div>
        <form action={() => new Promise<void>(() => {})}>
          <PendingSubmitButton size="sm">Approve</PendingSubmitButton>
        </form>
        <form action={reject}>
          <PendingSubmitButton size="sm" variant="outline">
            Reject
          </PendingSubmitButton>
        </form>
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled());

    // useFormStatus is scoped to the nearest form, so Reject stays live.
    expect(screen.getByRole("button", { name: "Reject" })).not.toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(reject).toHaveBeenCalledTimes(1);
  });
});
