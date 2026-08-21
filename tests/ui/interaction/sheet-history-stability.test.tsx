import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Sheet, releaseAllSheetScrollLocks } from "@/ui/primitives/sheet";

/**
 * Regression guard for the "the sheet vanishes while I am using it" bug.
 *
 * Every call site passes `onClose` as an inline arrow, so its identity changes
 * on each render of the owner. When the history-dismiss effect depended on that
 * identity, typing a character (or picking a row) tore the effect down —
 * running `history.back()` — and immediately re-pushed a fresh marker entry.
 * The queued traversal then landed on the *new* entry, the popstate handler saw
 * a marker it did not recognise, and closed the sheet mid-interaction.
 */

function TypingSheetHarness({ onClosed }: { onClosed?: () => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open sheet
      </button>
      <Sheet
        open={open}
        // Deliberately unstable: this mirrors every real call site.
        onClose={() => {
          setOpen(false);
          setQuery("");
          setPicked(null);
          onClosed?.();
        }}
        title="Pick a student"
      >
        <input aria-label="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="button" onClick={() => setPicked("student-1")}>
          Pick student
        </button>
        {picked ? <p>Selected {picked}</p> : null}
      </Sheet>
    </div>
  );
}

beforeEach(() => {
  releaseAllSheetScrollLocks();
  window.history.replaceState({}, "", "/");
});

describe("Sheet — stays open across owner re-renders", () => {
  it("survives typing in a field inside the sheet", async () => {
    const user = userEvent.setup();
    const onClosed = vi.fn();
    render(<TypingSheetHarness onClosed={onClosed} />);

    await user.click(screen.getByRole("button", { name: "Open sheet" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await user.type(screen.getByLabelText("Search"), "meena");

    expect(onClosed).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Search")).toHaveValue("meena");
  });

  it("survives selecting a row inside the sheet", async () => {
    const user = userEvent.setup();
    const onClosed = vi.fn();
    render(<TypingSheetHarness onClosed={onClosed} />);

    await user.click(screen.getByRole("button", { name: "Open sheet" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Pick student" }));

    expect(onClosed).not.toHaveBeenCalled();
    expect(screen.getByText("Selected student-1")).toBeInTheDocument();
  });

  it("pushes exactly one history marker entry for one open", async () => {
    const user = userEvent.setup();
    const pushSpy = vi.spyOn(window.history, "pushState");
    const backSpy = vi.spyOn(window.history, "back");
    render(<TypingSheetHarness />);

    await user.click(screen.getByRole("button", { name: "Open sheet" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await user.type(screen.getByLabelText("Search"), "ab");
    await user.click(screen.getByRole("button", { name: "Pick student" }));

    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(backSpy).not.toHaveBeenCalled();

    pushSpy.mockRestore();
    backSpy.mockRestore();
  });
});
