import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/switching-context", () => ({
  useSessionSwitching: () => ({ isSwitching: false, setGlobalSessionSwitching: vi.fn() }),
}));

const { NAV_EVENT } = await import("@/components/admin/nav-link");
const { RouteProgress } = await import("@/components/admin/route-progress");

function emit(pending: boolean) {
  act(() => {
    window.dispatchEvent(new CustomEvent(NAV_EVENT, { detail: { pending } }));
  });
}

/** The bar is the element whose aria-hidden flips. */
function isVisible(container: HTMLElement) {
  return container.querySelector('[aria-hidden="false"]') !== null;
}

describe("RouteProgress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows nothing until a navigation starts", () => {
    const { container } = render(<RouteProgress />);

    expect(isVisible(container)).toBe(false);
  });

  // The defect this rewrite exists to fix: the bar used to appear only AFTER
  // the navigation had committed.
  it("appears while a navigation is still in flight", () => {
    const { container } = render(<RouteProgress />);

    emit(true);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(isVisible(container)).toBe(true);
  });

  it("never flashes for an instant navigation", () => {
    const { container } = render(<RouteProgress />);

    emit(true);
    // Resolves inside the show delay — the bar must never have appeared.
    act(() => {
      vi.advanceTimersByTime(60);
    });
    emit(false);
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(isVisible(container)).toBe(false);
  });

  it("stays up long enough to be seen, rather than strobing", () => {
    const { container } = render(<RouteProgress />);

    emit(true);
    act(() => {
      vi.advanceTimersByTime(130);
    });
    expect(isVisible(container)).toBe(true);

    // Navigation finishes almost immediately after the bar appeared.
    emit(false);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(isVisible(container)).toBe(true);

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(isVisible(container)).toBe(false);
  });

  // A link unmounting mid-navigation must not pin the bar on forever.
  it("gives up if a navigation never reports finishing", () => {
    const { container } = render(<RouteProgress />);

    emit(true);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(isVisible(container)).toBe(true);

    act(() => {
      vi.advanceTimersByTime(16_000);
    });
    expect(isVisible(container)).toBe(false);
  });

  it("ignores repeated pending events from several links", () => {
    const { container } = render(<RouteProgress />);

    emit(true);
    emit(true);
    emit(true);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(isVisible(container)).toBe(true);

    emit(false);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(isVisible(container)).toBe(false);
  });
});
