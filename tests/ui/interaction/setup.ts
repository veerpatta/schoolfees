import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// These tests render components in isolation, with no app router mounted.
// Any component that announces a save now calls router.refresh(), which would
// otherwise throw "invariant expected app router to be mounted". The node
// project stubs this in tests/setup.ts; the interaction project needs its own.
vi.mock("next/navigation", async (original) => {
  const real = (await original()) as Record<string, unknown>;
  return {
    ...real,
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      refresh: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      prefetch: vi.fn(),
    }),
    usePathname: () => "/",
    useSearchParams: () => new URLSearchParams(),
  };
});

// jsdom implements neither of these, and components under test call both:
// use-media-query.ts reads matchMedia, and the haptics helper calls vibrate.
if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

if (!navigator.vibrate) {
  Object.defineProperty(navigator, "vibrate", {
    writable: true,
    value: vi.fn(() => true),
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
