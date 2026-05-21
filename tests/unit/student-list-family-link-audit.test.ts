import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "components/students/student-list-table.tsx"),
  "utf8",
);

describe("student list family link audit", () => {
  it("does not nest the sibling family link inside the mobile student workspace link", () => {
    expect(source).toContain("MobileStudentListItem");
    expect(source).not.toMatch(
      /<Link\s+href=\{withSession\(`\/protected\/students\/\$\{student\.id\}[\s\S]*?<SiblingPill/,
    );
  });
});
