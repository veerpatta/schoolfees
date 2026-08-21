import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readRepoFile(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

describe("Vercel deployment configuration", () => {
  it("keeps app pages dynamic so the Vercel Next adapter emits lambdas for App Router pages", () => {
    const layout = readRepoFile("src/app/layout.tsx");

    expect(layout).toContain('export const dynamic = "force-dynamic"');
  });

  it("keeps Supabase clients lazily initialized for Vercel build safety", () => {
    for (const file of [
      "src/platform/supabase/admin.ts",
      "src/platform/supabase/client.ts",
      "src/platform/supabase/server.ts",
      "src/platform/supabase/cache-safe.ts",
    ]) {
      const source = readRepoFile(file);
      const executableSource = source
        .split("\n")
        .filter((line) => !line.trim().startsWith("export function "))
        .join("\n");

      expect(executableSource, file).not.toMatch(
        /^\s*(const|let|var)\s+\w+\s*=\s*(createSupabaseClient|createBrowserClient|createServerClient|createAdminClient|createClient)\(/m,
      );
    }
  });

  it("keeps request cookies out of module-scope Vercel runtime initialization", () => {
    const serverClient = readRepoFile("src/platform/supabase/server.ts");

    expect(serverClient).toContain("cache(() => cookies())");
    expect(serverClient).not.toMatch(/^\s*const\s+cookieStore\s*=\s*await\s+cookies\(\)/m);
    expect(serverClient).not.toMatch(/^\s*const\s+cookieStore\s*=\s*cookies\(\)/m);
  });
});
