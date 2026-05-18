import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("server-only", () => ({}));

const createServerClient = vi.fn(() => ({ from: vi.fn() }));
const createSupabaseClient = vi.fn(() => ({ from: vi.fn() }));
const cookieStore = {
  getAll: vi.fn(() => []),
  set: vi.fn(),
};
const originalAppMode = process.env.APP_MODE;
const originalPublicAppMode = process.env.NEXT_PUBLIC_APP_MODE;
const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalPublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const repoRoot = process.cwd();

vi.mock("@supabase/ssr", () => ({
  createServerClient,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createSupabaseClient,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore),
}));

function setRequiredEnv(mode?: string) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";

  if (mode === undefined) {
    delete process.env.APP_MODE;
  } else {
    process.env.APP_MODE = mode;
  }

  delete process.env.NEXT_PUBLIC_APP_MODE;
}

describe("test schema isolation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    setRequiredEnv();
  });

  afterEach(() => {
    if (originalAppMode === undefined) {
      delete process.env.APP_MODE;
    } else {
      process.env.APP_MODE = originalAppMode;
    }

    if (originalPublicAppMode === undefined) {
      delete process.env.NEXT_PUBLIC_APP_MODE;
    } else {
      process.env.NEXT_PUBLIC_APP_MODE = originalPublicAppMode;
    }

    if (originalSupabaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    }

    if (originalPublishableKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalPublishableKey;
    }

    if (originalServiceRoleKey === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
    }
  });

  it("defaults server clients to the production public schema", async () => {
    const { createClient } = await import("@/lib/supabase/server");

    await createClient();

    expect(createServerClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "sb_publishable_test",
      expect.objectContaining({
        db: { schema: "public" },
      }),
    );
  });

  it("sets server and admin clients to the test schema when APP_MODE=test", async () => {
    setRequiredEnv("test");

    const [{ createClient }, { createAdminClient }] = await Promise.all([
      import("@/lib/supabase/server"),
      import("@/lib/supabase/admin"),
    ]);

    await createClient();
    createAdminClient();

    expect(createServerClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "sb_publishable_test",
      expect.objectContaining({
        db: { schema: "test" },
      }),
    );
    expect(createSupabaseClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "service-role-test",
      expect.objectContaining({
        db: { schema: "test" },
      }),
    );
  });

  it("rejects unknown APP_MODE values", async () => {
    setRequiredEnv("staging");

    const { getAppMode } = await import("@/lib/env");

    expect(() => getAppMode()).toThrow("Invalid APP_MODE");
  });

  it("does not let the legacy public mode variable select the database schema", async () => {
    process.env.NEXT_PUBLIC_APP_MODE = "test";

    const { getAppMode, getSupabaseSchemaForAppMode } = await import("@/lib/env");

    expect(getAppMode()).toBe("production");
    expect(getSupabaseSchemaForAppMode()).toBe("public");
  });

  it("keeps runtime code on APP_MODE instead of the legacy public mode variable", () => {
    const protectedLayout = readFileSync(
      join(repoRoot, "app", "protected", "layout.tsx"),
      "utf8",
    );
    const schoolConfig = readFileSync(
      join(repoRoot, "lib", "config", "school.ts"),
      "utf8",
    );

    expect(protectedLayout).toContain("getAppMode() === \"test\"");
    expect(protectedLayout).not.toContain("NEXT_PUBLIC_APP_MODE");
    expect(schoolConfig).not.toContain("NEXT_PUBLIC_APP_MODE");
  });
});
