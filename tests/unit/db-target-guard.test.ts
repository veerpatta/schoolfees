import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DatabaseTargetError,
  assertSafeDatabaseTarget,
  getDatabaseTarget,
  getSupabaseProjectRef,
  resetDatabaseTargetWarningsForTests,
} from "@/platform/db-target";

/**
 * The guard that decides whether this process may talk to the live school
 * database. Every case below is a real deployment shape, not a hypothetical:
 * the preview one is the reason the guard exists, and the two "allows" are the
 * reason it cannot simply refuse whenever it sees the production ref.
 */

const PRODUCTION_REF = "vgqyilgstjvgohrsiwkb";
const DEV_REF = "wtgxcptmucjerhufzjcf";

const PRODUCTION_URL = `https://${PRODUCTION_REF}.supabase.co`;
const DEV_URL = `https://${DEV_REF}.supabase.co`;

function setEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

const TOUCHED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "PRODUCTION_SUPABASE_PROJECT_REF",
  "VERCEL_ENV",
  "ALLOW_PRODUCTION_DB_OUTSIDE_PRODUCTION",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(TOUCHED.map((key) => [key, process.env[key]]));
  setEnv(Object.fromEntries(TOUCHED.map((key) => [key, undefined])));
  resetDatabaseTargetWarningsForTests();
});

afterEach(() => {
  setEnv(saved);
  vi.restoreAllMocks();
});

describe("getSupabaseProjectRef", () => {
  it("reads the ref out of a Supabase project URL", () => {
    expect(getSupabaseProjectRef(PRODUCTION_URL)).toBe(PRODUCTION_REF);
    expect(getSupabaseProjectRef(DEV_URL)).toBe(DEV_REF);
  });

  it("returns null for the local stack", () => {
    expect(getSupabaseProjectRef("http://localhost:54321")).toBeNull();
    expect(getSupabaseProjectRef("http://127.0.0.1:54321")).toBeNull();
  });

  it("returns null rather than guessing at anything else", () => {
    expect(getSupabaseProjectRef("https://example.com")).toBeNull();
    expect(getSupabaseProjectRef("not a url")).toBeNull();
    expect(getSupabaseProjectRef(undefined)).toBeNull();
  });
});

describe("getDatabaseTarget", () => {
  it("names production only when the ref matches the declared production ref", () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL,
      PRODUCTION_SUPABASE_PROJECT_REF: PRODUCTION_REF,
    });
    expect(getDatabaseTarget()).toEqual({ ref: PRODUCTION_REF, kind: "production" });
  });

  it("calls anything else with a readable ref dev", () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: DEV_URL,
      PRODUCTION_SUPABASE_PROJECT_REF: PRODUCTION_REF,
    });
    expect(getDatabaseTarget()).toEqual({ ref: DEV_REF, kind: "dev" });
  });

  it("calls a localhost URL local", () => {
    setEnv({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" });
    expect(getDatabaseTarget()).toEqual({ ref: null, kind: "local" });
  });

  it("calls an unreadable target unknown, not dev", () => {
    setEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://example.com" });
    expect(getDatabaseTarget()).toEqual({ ref: null, kind: "unknown" });

    setEnv({ NEXT_PUBLIC_SUPABASE_URL: undefined });
    expect(getDatabaseTarget()).toEqual({ ref: null, kind: "unknown" });
  });
});

describe("assertSafeDatabaseTarget", () => {
  it("throws when a preview deployment is pointed at production", () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL,
      PRODUCTION_SUPABASE_PROJECT_REF: PRODUCTION_REF,
      VERCEL_ENV: "preview",
    });

    expect(() => assertSafeDatabaseTarget()).toThrow(DatabaseTargetError);
    expect(() => assertSafeDatabaseTarget()).toThrow(
      "Refusing to start: this environment (VERCEL_ENV=preview) is pointed at the " +
        "PRODUCTION Supabase project. Fix the environment variables.",
    );
  });

  it("allows the production deployment itself", () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL,
      PRODUCTION_SUPABASE_PROJECT_REF: PRODUCTION_REF,
      VERCEL_ENV: "production",
    });

    expect(() => assertSafeDatabaseTarget()).not.toThrow();
  });

  /**
   * The Vercel preview of school-one/phase-0 depends on exactly this case: dev
   * ref, VERCEL_ENV=preview. If this ever throws, every preview stops booting.
   */
  it("allows a preview deployment pointed at the dev project", () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: DEV_URL,
      PRODUCTION_SUPABASE_PROJECT_REF: PRODUCTION_REF,
      VERCEL_ENV: "preview",
    });

    expect(() => assertSafeDatabaseTarget()).not.toThrow();
  });

  it("allows the local stack", () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      PRODUCTION_SUPABASE_PROJECT_REF: PRODUCTION_REF,
    });

    expect(() => assertSafeDatabaseTarget()).not.toThrow();
  });

  it("allows the documented override from a laptop, and says so loudly", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL,
      PRODUCTION_SUPABASE_PROJECT_REF: PRODUCTION_REF,
      ALLOW_PRODUCTION_DB_OUTSIDE_PRODUCTION: "I understand",
      VERCEL_ENV: undefined,
    });

    expect(() => assertSafeDatabaseTarget()).not.toThrow();
    expect(stderr).toHaveBeenCalledOnce();
    expect(stderr.mock.calls[0][0]).toContain("PRODUCTION DATABASE");
  });

  it("ignores the override on Vercel, where a human is not watching", () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL,
      PRODUCTION_SUPABASE_PROJECT_REF: PRODUCTION_REF,
      ALLOW_PRODUCTION_DB_OUTSIDE_PRODUCTION: "I understand",
      VERCEL_ENV: "preview",
    });

    expect(() => assertSafeDatabaseTarget()).toThrow(DatabaseTargetError);
  });

  it("does not accept a near-miss override phrase", () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL,
      PRODUCTION_SUPABASE_PROJECT_REF: PRODUCTION_REF,
      ALLOW_PRODUCTION_DB_OUTSIDE_PRODUCTION: "true",
      VERCEL_ENV: undefined,
    });

    expect(() => assertSafeDatabaseTarget()).toThrow(DatabaseTargetError);
  });

  /**
   * A guard that hard-fails on its own missing configuration would take
   * production down the first time somebody forgot to copy a variable. It warns
   * instead — but it must actually warn, which is what this pins.
   */
  it("warns once and allows when the production ref is not declared", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL,
      PRODUCTION_SUPABASE_PROJECT_REF: undefined,
      VERCEL_ENV: "preview",
    });

    expect(() => assertSafeDatabaseTarget()).not.toThrow();
    expect(() => assertSafeDatabaseTarget()).not.toThrow();

    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain("PRODUCTION_SUPABASE_PROJECT_REF is not set");
  });
});
