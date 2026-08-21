import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveSiblingPickerExclusions } from "@/lib/students/family-link";

const SELF = "22222222-2222-4222-8222-222222222222";
const SIBLING = "33333333-3333-4333-8333-333333333333";
const FAMILY = "11111111-1111-4111-8111-111111111111";

describe("sibling picker exclusions", () => {
  it("hides members of a confirmed family — they are already linked", () => {
    expect(
      resolveSiblingPickerExclusions({
        familyGroupId: FAMILY,
        members: [{ id: SELF }, { id: SIBLING }],
      }),
    ).toEqual([SELF, SIBLING]);
  });

  it("excludes nobody when the student has no family yet", () => {
    // A student with no family group has nothing to hide from the picker, so
    // every candidate stays selectable even if `members` is somehow populated.
    expect(
      resolveSiblingPickerExclusions({
        familyGroupId: null,
        members: [{ id: SELF }, { id: SIBLING }],
      }),
    ).toEqual([]);
  });

  it("is used by both the desktop panel and the phone family tab", () => {
    const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

    for (const path of [
      "src/components/students/family-panel.tsx",
      "src/components/students/mobile-student-family-tab.tsx",
    ]) {
      const source = read(path);
      expect(source, path).toContain("resolveSiblingPickerExclusions");
      // The old inline `members.map(...)` is what let the two surfaces drift.
      expect(source, path).not.toMatch(/excludeStudentIds=\{members\.map/);
    }
  });
});
