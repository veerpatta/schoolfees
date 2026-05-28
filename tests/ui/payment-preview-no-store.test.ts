import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("payment desk preview cache (audit 1.10)", () => {
  const source = readFileSync(
    join(process.cwd(), "app/protected/payments/preview/route.ts"),
    "utf8",
  );

  it("uses no-store / must-revalidate — never the legacy 60s cache", () => {
    expect(source).toContain("no-store");
    expect(source).toContain("must-revalidate");
    expect(source).not.toContain("max-age=60");
    expect(source).not.toContain("stale-while-revalidate");
  });

  it("keeps the response private (never edge/CDN-cached)", () => {
    expect(source).toContain("private, no-store");
  });
});
