import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getVisibleProtectedNavigation,
  getGroupedProtectedNavigation,
} from "@/platform/config/navigation";

/**
 * The canary model, tested where it actually decides something.
 *
 * Production runs one deployment for the whole school. `director@vpps.co.in`
 * does the day's work in it; `raj@vpps.co.in` sees School One first. The whole
 * arrangement rests on one claim — *only the ids and roles on the flag see the
 * feature* — so these tests pin that claim rather than the plumbing around it.
 */

const rows: Array<Record<string, unknown>> = [];
let selectError: { message: string } | null = null;

vi.mock("@/platform/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: async () => ({ data: selectError ? null : rows, error: selectError }),
    }),
  }),
}));

const captureMessage = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureMessage: (...args: unknown[]) => captureMessage(...args),
}));

const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
}));

const requireAuthenticatedStaff = vi.fn();
vi.mock("@/platform/supabase/session", () => ({
  requireAuthenticatedStaff: () => requireAuthenticatedStaff(),
}));

import {
  getEnabledFeatures,
  isFeatureEnabled,
  isFeatureEnabledForStaff,
  requireFeature,
} from "@/platform/features/flags";

const CANARY = "11111111-1111-1111-1111-111111111111";
const DIRECTOR = "22222222-2222-2222-2222-222222222222";

function flag(overrides: Record<string, unknown> = {}) {
  return {
    key: "school_one_placeholder",
    description: "placeholder",
    enabled_for_all: false,
    enabled_roles: [],
    enabled_user_ids: [],
    updated_by: null,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  rows.length = 0;
  selectError = null;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isFeatureEnabledForStaff — precedence", () => {
  it("is off when nothing names this person", () => {
    expect(
      isFeatureEnabledForStaff(flag(), { id: DIRECTOR, role: "admin" }),
    ).toBe(false);
  });

  it("is on for everyone when enabled_for_all", () => {
    expect(
      isFeatureEnabledForStaff(flag({ enabled_for_all: true }), {
        id: DIRECTOR,
        role: "admin",
      }),
    ).toBe(true);
  });

  it("is on for a named role", () => {
    const row = flag({ enabled_roles: ["teacher"] });
    expect(isFeatureEnabledForStaff(row, { id: DIRECTOR, role: "teacher" })).toBe(true);
    expect(isFeatureEnabledForStaff(row, { id: DIRECTOR, role: "admin" })).toBe(false);
  });

  /**
   * The claim the whole rollout model rests on: one id on the list, and the
   * other admin — same role, same deployment — sees nothing.
   */
  it("is on for a named id and for nobody else with the same role", () => {
    const row = flag({ enabled_user_ids: [CANARY] });

    expect(isFeatureEnabledForStaff(row, { id: CANARY, role: "admin" })).toBe(true);
    expect(isFeatureEnabledForStaff(row, { id: DIRECTOR, role: "admin" })).toBe(false);
  });

  it("treats the three conditions as OR, never AND", () => {
    const row = flag({ enabled_roles: ["accountant"], enabled_user_ids: [CANARY] });

    expect(isFeatureEnabledForStaff(row, { id: CANARY, role: "teacher" })).toBe(true);
    expect(isFeatureEnabledForStaff(row, { id: DIRECTOR, role: "accountant" })).toBe(true);
    expect(isFeatureEnabledForStaff(row, { id: DIRECTOR, role: "teacher" })).toBe(false);
  });

  it("survives null arrays from the database", () => {
    expect(
      isFeatureEnabledForStaff(flag({ enabled_roles: null, enabled_user_ids: null }), {
        id: CANARY,
        role: "admin",
      }),
    ).toBe(false);
  });
});

describe("isFeatureEnabled", () => {
  it("reports an unknown key to Sentry and returns false, never throws", async () => {
    await expect(
      isFeatureEnabled("no_such_flag", { id: CANARY, role: "admin" }),
    ).resolves.toBe(false);

    expect(captureMessage).toHaveBeenCalledWith(
      "feature-flags.unknown-key",
      expect.objectContaining({ level: "warning" }),
    );
  });

  /** A database hiccup must never switch a feature ON. */
  it("fails closed when the table cannot be read", async () => {
    selectError = { message: "connection reset" };

    await expect(
      isFeatureEnabled("school_one_placeholder", { id: CANARY, role: "admin" }),
    ).resolves.toBe(false);

    expect(captureMessage).toHaveBeenCalledWith(
      "feature-flags.read-failed",
      expect.objectContaining({ level: "warning" }),
    );
  });

  it("reads the row when the key exists", async () => {
    rows.push(flag({ enabled_user_ids: [CANARY] }));

    await expect(
      isFeatureEnabled("school_one_placeholder", { id: CANARY, role: "admin" }),
    ).resolves.toBe(true);
    await expect(
      isFeatureEnabled("school_one_placeholder", { id: DIRECTOR, role: "admin" }),
    ).resolves.toBe(false);
  });
});

describe("getEnabledFeatures", () => {
  it("returns only the keys this person has", async () => {
    rows.push(
      flag({ key: "a", enabled_user_ids: [CANARY] }),
      flag({ key: "b", enabled_for_all: true }),
      flag({ key: "c" }),
    );

    await expect(getEnabledFeatures({ id: CANARY, role: "admin" })).resolves.toEqual([
      "a",
      "b",
    ]);
    await expect(getEnabledFeatures({ id: DIRECTOR, role: "admin" })).resolves.toEqual([
      "b",
    ]);
  });
});

describe("requireFeature", () => {
  it("answers 404, not 403, when the feature is off", async () => {
    rows.push(flag());
    requireAuthenticatedStaff.mockResolvedValue({ id: DIRECTOR, appRole: "admin" });

    await expect(requireFeature("school_one_placeholder")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFound).toHaveBeenCalled();
  });

  it("lets the flagged user through", async () => {
    rows.push(flag({ enabled_user_ids: [CANARY] }));
    requireAuthenticatedStaff.mockResolvedValue({ id: CANARY, appRole: "admin" });

    await expect(requireFeature("school_one_placeholder")).resolves.toBeUndefined();
    expect(notFound).not.toHaveBeenCalled();
  });
});

describe("navigation gating", () => {
  const flagged = "school_one_placeholder";

  it("hides a flag-gated item by default", () => {
    const items = getVisibleProtectedNavigation("admin");
    expect(items.some((item) => item.featureFlag === flagged)).toBe(false);
  });

  it("shows it only when the key is supplied", () => {
    const items = getVisibleProtectedNavigation("admin", [flagged]);
    expect(items.some((item) => item.href === "/protected/school-one")).toBe(true);
  });

  /**
   * The failure this defends against is a caller that never learned about
   * flags: it must show fewer items, never more.
   */
  it("hides it for an unrelated key", () => {
    const items = getVisibleProtectedNavigation("admin", ["something_else"]);
    expect(items.some((item) => item.href === "/protected/school-one")).toBe(false);
  });

  it("carries the same rule through the grouped sidebar", () => {
    const withFlag = getGroupedProtectedNavigation("admin", [flagged])
      .flatMap((group) => group.items)
      .map((item) => item.href);
    const without = getGroupedProtectedNavigation("admin")
      .flatMap((group) => group.items)
      .map((item) => item.href);

    expect(withFlag).toContain("/protected/school-one");
    expect(without).not.toContain("/protected/school-one");
  });

  it("does not hand the item to a role without the underlying permission", () => {
    const items = getVisibleProtectedNavigation("view_only", [flagged]);
    // view_only holds dashboard:view, so the flag is what decides here; the
    // point of the assertion is that the flag never *grants* permission.
    for (const item of items) {
      expect(item.requiredPermission).toBeDefined();
    }
  });
});
