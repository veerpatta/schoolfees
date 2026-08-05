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

  it("keeps a suspected group selectable", () => {
    // Phone-matched students are NOT linked yet. Excluding them removed the
    // very siblings staff opened the picker to link.
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
      "components/students/family-panel.tsx",
      "components/students/mobile-student-family-tab.tsx",
    ]) {
      const source = read(path);
      expect(source, path).toContain("resolveSiblingPickerExclusions");
      // The old inline `members.map(...)` is what let the two surfaces drift.
      expect(source, path).not.toMatch(/excludeStudentIds=\{members\.map/);
    }
  });
});
