import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Sheet, releaseAllSheetScrollLocks } from "@/components/ui/sheet";

/**
 * Real DOM behavior tests. The pre-existing tests/ui suites assert that the
 * SOURCE contains strings like "previouslyFocusedRef" — they pass if the
 * feature is broken and fail if a variable is renamed. These assert what the
 * user actually experiences.
 */

function SheetHarness({
  historyDismiss = true,
  onClosed,
}: {
  historyDismiss?: boolean;
  onClosed?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open sheet
      </button>
      <button type="button">Background button</button>
      <Sheet
        open={open}
        historyDismiss={historyDismiss}
        onClose={() => {
          setOpen(false);
          onClosed?.();
        }}
        title="Test sheet"
      >
        <button type="button">First inside</button>
        <button type="button">Second inside</button>
      </Sheet>
    </div>
  );
}

beforeEach(() => {
  releaseAllSheetScrollLocks();
  window.history.replaceState({}, "", "/");
});

describe("Sheet — focus management", () => {
  it("moves focus into the panel on open and restores it on close", async () => {
    const user = userEvent.setup();
    render(<SheetHarness historyDismiss={false} />);

    const opener = screen.getByRole("button", { name: "Open sheet" });
    opener.focus();
    await user.click(opener);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    // Focus lands inside the dialog panel (deferred via setTimeout), not on
    // the backdrop and not left behind on the opener.
    await waitFor(() => {
      const dialog = screen.getByRole("dialog");
      const panel = dialog.querySelector<HTMLElement>('[class*="rounded-t-xl"]');
      expect(panel?.contains(document.activeElement)).toBe(true);
    });

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(opener);
    });
  });

  it("traps Tab inside the panel instead of reaching background controls", async () => {
    const user = userEvent.setup();
    render(<SheetHarness historyDismiss={false} />);

    await user.click(screen.getByRole("button", { name: "Open sheet" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    const background = screen.getByRole("button", { name: "Background button" });
    // Cycle well past the number of focusables in the panel.
    for (let index = 0; index < 8; index += 1) {
      await user.tab();
      expect(document.activeElement).not.toBe(background);
    }
  });
});

describe("Sheet — scroll lock", () => {
  it("locks body scroll while open and fully releases it on close", async () => {
    const user = userEvent.setup();
    render(<SheetHarness historyDismiss={false} />);

    expect(document.body.style.overflow).not.toBe("hidden");

    await user.click(screen.getByRole("button", { name: "Open sheet" }));
    await waitFor(() => expect(document.body.style.overflow).toBe("hidden"));

    await user.keyboard("{Escape}");
    await waitFor(() => expect(document.body.style.overflow).not.toBe("hidden"));
  });
});

describe("Sheet — back button dismissal", () => {
  it("closes on popstate (Android back) instead of leaving the page", async () => {
    const user = userEvent.setup();
    const onClosed = vi.fn();
    render(<SheetHarness onClosed={onClosed} />);

    await user.click(screen.getByRole("button", { name: "Open sheet" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    // Simulate the hardware back button: the browser pops our marker entry.
    window.history.replaceState({}, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(onClosed).toHaveBeenCalled();
  });

  it("pops its own history entry when dismissed by the close button", async () => {
    const user = userEvent.setup();
    const backSpy = vi.spyOn(window.history, "back");
    render(<SheetHarness />);

    await user.click(screen.getByRole("button", { name: "Open sheet" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    // Two "Close" controls exist (backdrop + header X); either must clean up.
    await user.click(screen.getAllByRole("button", { name: "Close" })[0]);

    // Without this, phantom entries accumulate and back appears dead later.
    expect(backSpy).toHaveBeenCalled();
    backSpy.mockRestore();
  });

  it("does not touch history when historyDismiss is off", async () => {
    const user = userEvent.setup();
    const pushSpy = vi.spyOn(window.history, "pushState");
    render(<SheetHarness historyDismiss={false} />);

    await user.click(screen.getByRole("button", { name: "Open sheet" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    expect(pushSpy).not.toHaveBeenCalled();
    pushSpy.mockRestore();
  });
});
