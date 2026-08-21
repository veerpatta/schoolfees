import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastViewport, toast } from "@/ui/primitives/toast";

function show(payload: Parameters<typeof toast>[0]) {
  act(() => {
    toast(payload);
  });
}

describe("toast tone", () => {
  it("interrupts for a failure and stays polite for a success", () => {
    render(<ToastViewport />);

    show({ title: "Saved", tone: "success" });
    show({ title: "Could not save", tone: "danger" });

    expect(screen.getByText("Saved").closest("[role]")).toHaveAttribute("role", "status");
    expect(screen.getByText("Could not save").closest("[role]")).toHaveAttribute("role", "alert");
  });

  // The defect this phase exists to fix: success and failure used to be
  // distinguishable ONLY by the title string.
  it("distinguishes success from failure by more than the wording", () => {
    render(<ToastViewport />);

    show({ title: "Done", tone: "success" });
    show({ title: "Done", tone: "danger" });

    const tones = screen
      .getAllByText("Done")
      .map((node) => node.closest("[data-tone]")?.getAttribute("data-tone"));

    expect(tones).toEqual(["success", "danger"]);

    // ...and each carries its own icon, so tone is never colour-only.
    const icons = document.querySelectorAll("[data-toast-icon]");
    expect([...icons].map((node) => node.getAttribute("data-toast-icon"))).toEqual([
      "success",
      "danger",
    ]);
  });

  it("defaults to neutral so existing callers are unchanged", () => {
    render(<ToastViewport />);

    show({ title: "Plain" });

    const node = screen.getByText("Plain").closest("[data-tone]");
    expect(node).toHaveAttribute("data-tone", "neutral");
    expect(screen.getByText("Plain").closest("[role]")).toHaveAttribute("role", "status");
  });

  it("keeps a caller-supplied icon in preference to the tone icon", () => {
    render(<ToastViewport />);

    show({ title: "Custom", tone: "success", icon: <span>★</span> });

    expect(screen.getByText("★")).toBeInTheDocument();
  });
});

describe("toast lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("auto-dismisses after its duration", () => {
    render(<ToastViewport />);
    show({ title: "Bye", durationMs: 1000 });

    expect(screen.getByText("Bye")).toBeInTheDocument();

    // Duration, then the exit animation.
    act(() => {
      vi.advanceTimersByTime(1000 + 300);
    });

    expect(screen.queryByText("Bye")).not.toBeInTheDocument();
  });

  it("gives a failure longer to be read than a success", () => {
    render(<ToastViewport />);
    show({ title: "Failed", tone: "danger" });

    // Past the 5s neutral default; a danger toast must still be up.
    act(() => {
      vi.advanceTimersByTime(6000);
    });

    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  // fireEvent rather than userEvent: userEvent's own internal delays deadlock
  // against fake timers, and these two assertions are specifically about timers.
  it("pauses the countdown while hovered and resumes on leave", () => {
    render(<ToastViewport />);
    show({ title: "Hover me", durationMs: 2000 });

    const item = screen.getByText("Hover me").closest("[data-tone]") as HTMLElement;

    act(() => {
      fireEvent.pointerEnter(item);
      vi.advanceTimersByTime(5000);
    });

    // Still there: the timer was paused.
    expect(screen.getByText("Hover me")).toBeInTheDocument();

    act(() => {
      fireEvent.pointerLeave(item);
      vi.advanceTimersByTime(2000 + 300);
    });

    expect(screen.queryByText("Hover me")).not.toBeInTheDocument();
  });

  it("can be dismissed by hand", () => {
    render(<ToastViewport />);
    show({ title: "Dismiss me" });

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
      vi.advanceTimersByTime(300);
    });

    expect(screen.queryByText("Dismiss me")).not.toBeInTheDocument();
  });

  // The regression most likely to break when adding the two-phase exit.
  it("never shows more than three at once", () => {
    render(<ToastViewport />);

    show({ title: "One" });
    show({ title: "Two" });
    show({ title: "Three" });
    show({ title: "Four" });

    expect(screen.queryByText("One")).not.toBeInTheDocument();
    expect(screen.getByText("Two")).toBeInTheDocument();
    expect(screen.getByText("Three")).toBeInTheDocument();
    expect(screen.getByText("Four")).toBeInTheDocument();
  });
});
