import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("Vercel deployment configuration", () => {
  it("keeps app pages dynamic so the Vercel Next adapter emits lambdas for App Router pages", () => {
    const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");

    expect(layout).toContain('export const dynamic = "force-dynamic"');
  });
});
