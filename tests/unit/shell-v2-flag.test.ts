import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isShellV2Enabled } from "@/lib/env";

describe("SHELL_V2 env flag", () => {
  const original = {
    shell: process.env.SHELL_V2,
    mode: process.env.APP_MODE,
    vercel: process.env.VERCEL_ENV,
  };

  beforeEach(() => {
    delete process.env.SHELL_V2;
    delete process.env.APP_MODE;
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries({
      SHELL_V2: original.shell,
      APP_MODE: original.mode,
      VERCEL_ENV: original.vercel,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("defaults to false when unset (production-safe default)", () => {
    expect(isShellV2Enabled()).toBe(false);
  });

  it("defaults to true in preview and TEST app mode", () => {
    process.env.VERCEL_ENV = "preview";
    expect(isShellV2Enabled()).toBe(true);

    delete process.env.VERCEL_ENV;
    process.env.APP_MODE = "test";
    expect(isShellV2Enabled()).toBe(true);
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
      process.env.APP_MODE = "test";
      process.env.VERCEL_ENV = "preview";
      expect(isShellV2Enabled()).toBe(false);
    }
  });
});
