import { registerDimension } from "../lib/coverage";

/**
 * Three viewports, because the app renders genuinely different components at
 * each — `components/*\/mobile-*` screens, a bottom nav, and takeover routes
 * that hide the tab bar. A responsive-CSS-only app would not need this; this
 * one has a separate phone Payment Desk with its own CI line budget.
 *
 * 390x844 is the `mobile-counter` viewport named in
 * `quality/office-quality-budgets.json`, so the harness and the budget agree on
 * what "a phone" means.
 */

export type DeviceProfile = {
  id: "desktop" | "tablet" | "mobile";
  label: string;
  viewport: { width: number; height: number };
  isMobile: boolean;
  hasTouch: boolean;
};

export const DEVICE_PROFILES: readonly DeviceProfile[] = [
  {
    id: "desktop",
    label: "Desktop 1440x900",
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
  },
  {
    id: "tablet",
    label: "Tablet 820x1180",
    viewport: { width: 820, height: 1180 },
    isMobile: false,
    hasTouch: true,
  },
  {
    id: "mobile",
    label: "Phone 390x844",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  },
];

export const DEVICE_DIMENSION = registerDimension({
  id: "device.viewport",
  label: "Device viewports",
  domain: DEVICE_PROFILES.map((device) => device.id),
  strategy: "exhaustive-pairwise",
  pairedWith: ["route.family"],
});
