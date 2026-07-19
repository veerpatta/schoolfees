import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

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
