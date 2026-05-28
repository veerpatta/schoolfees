import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("conventional-discount policy filter UUID guard (audit 1.24)", () => {
  const source = readFileSync(
    join(process.cwd(), "lib/fees/conventional-discounts.ts"),
    "utf8",
  );

  it("UUID-validates policyIds before concatenating into the .not() IN-list", () => {
    expect(source).toMatch(/uuidPattern\s*=\s*\//);
    expect(source).toContain("policyIds.filter((id) => uuidPattern.test(id))");
    expect(source).toContain("policyIdsForFilter");
  });

  it("retains the empty-list sentinel UUID so the IN-list is never empty", () => {
    expect(source).toContain('"00000000-0000-0000-0000-000000000000"');
  });

  it("never concatenates raw policyIds.join into the filter expression anymore", () => {
    expect(source).not.toMatch(/\.not\("policy_id", "in", `\(\$\{policyIds\.join/);
  });
});
