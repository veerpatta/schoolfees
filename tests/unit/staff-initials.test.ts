import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The phone staff list shows two-letter initials in place of a full name.
 *
 * The original split was `/s+/` — the letter s, not whitespace — so any name
 * containing a lowercase s was cut at it: "Suresh Sharma" rendered SH,
 * "Rajesh Singh" rendered RH. Names without a lowercase s came out correct,
 * which is exactly why nobody noticed.
 *
 * The function is module-private, so this reimplements it from source to keep
 * the assertion honest about which regex is actually in the file.
 */

const source = readFileSync(
  join(process.cwd(), "components/staff/staff-management-client.tsx"),
  "utf8",
);

function initialsOfName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

describe("staff initials", () => {
  it("splits on whitespace, not on the letter s", () => {
    expect(source).toContain("split(/\\s+/)");
    expect(source).not.toMatch(/split\(\/s\+\/\)/);
  });

  it("takes the first letter of the first and last words", () => {
    expect(initialsOfName("Suresh Sharma")).toBe("SS");
    expect(initialsOfName("Rajesh Singh")).toBe("RS");
    expect(initialsOfName("Sunita Verma")).toBe("SV");
    expect(initialsOfName("Anil Kumar Gupta")).toBe("AG");
  });

  it("handles single words and empty input", () => {
    expect(initialsOfName("Sunita")).toBe("SU");
    expect(initialsOfName("   ")).toBe("?");
  });

  it("survives the extra whitespace a pasted name arrives with", () => {
    expect(initialsOfName("  Suresh   Sharma  ")).toBe("SS");
  });
});
