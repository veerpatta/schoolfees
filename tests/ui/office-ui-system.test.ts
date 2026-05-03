import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readRepoFile(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

describe("shared office UI system", () => {
  it("exposes reusable staff-facing layout primitives", () => {
    const officeUi = readRepoFile("components/office/office-ui.tsx");

    expect(officeUi).toContain("export function OfficeNotice");
    expect(officeUi).toContain("export function OfficeEmptyState");
    expect(officeUi).toContain("export function OfficeActionBar");
    expect(officeUi).toContain("export function OfficeFilterBar");
    expect(officeUi).toContain("export function OfficeTableShell");
    expect(officeUi).toContain("export function OfficeNextActions");
  });

  it("keeps shared page framing compact and non-decorative", () => {
    const pageHeader = readRepoFile("components/admin/page-header.tsx");
    const sectionCard = readRepoFile("components/admin/section-card.tsx");

    expect(pageHeader).not.toContain("glass-panel");
    expect(sectionCard).not.toContain("glass-panel");
    expect(pageHeader).not.toContain("tracking-[0.24em]");
    expect(sectionCard).toContain("rounded-lg");
  });
});
