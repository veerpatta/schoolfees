import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isShellV2Enabled } from "@/lib/env";

describe("SHELL_V2 env flag", () => {
  const original = process.env.SHELL_V2;

  beforeEach(() => {
    delete process.env.SHELL_V2;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.SHELL_V2;
    } else {
      process.env.SHELL_V2 = original;
    }
  });

  it("defaults to false when unset (production-safe default)", () => {
    expect(isShellV2Enabled()).toBe(false);
  });

  it("returns true when SHELL_V2 is set to 1", () => {
    process.env.SHELL_V2 = "1";
    expect(isShellV2Enabled()).toBe(true);
  });

  it("returns true for 'true' / 'yes' / 'on'", () => {
    for (const value of ["true", "yes", "on"]) {
      process.env.SHELL_V2 = value;
      expect(isShellV2Enabled()).toBe(true);
    }
  });

  it("returns false for explicit falsy strings", () => {
    for (const value of ["0", "false", "no", "off"]) {
      process.env.SHELL_V2 = value;
      expect(isShellV2Enabled()).toBe(false);
    }
  });
});
