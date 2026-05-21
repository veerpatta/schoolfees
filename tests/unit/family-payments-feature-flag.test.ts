import { afterEach, describe, expect, it, vi } from "vitest";

const FLAG_NAME = "NEXT_PUBLIC_FAMILY_PAYMENTS_ENABLED";

async function loadFlag() {
  vi.resetModules();
  return import("@/lib/config/feature-flags");
}

describe("family payments feature flag", () => {
  const originalValue = process.env[FLAG_NAME];

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env[FLAG_NAME];
    } else {
      process.env[FLAG_NAME] = originalValue;
    }
  });

  it("keeps Pay Together available unless the feature is explicitly disabled", async () => {
    delete process.env[FLAG_NAME];

    await expect(loadFlag()).resolves.toMatchObject({
      familyPaymentsEnabled: true,
    });
  });

  it("can still disable family payments explicitly", async () => {
    process.env[FLAG_NAME] = "false";

    await expect(loadFlag()).resolves.toMatchObject({
      familyPaymentsEnabled: false,
    });
  });
});
