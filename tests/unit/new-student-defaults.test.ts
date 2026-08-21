import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/**
 * A student typed into the Add form is a fresh admission almost every time —
 * an existing student arrives by year-end rollover or bulk import, neither of
 * which reads this default.
 *
 * The form used to preselect "Existing", so whenever the clerk did not think to
 * change it the student was billed the Rs 500 old-student academic fee instead
 * of Rs 1,100. Five students added in the first week of August 2026 went in
 * that way — Rs 3,000 under-billed, and nothing on screen said so, because
 * "Existing" is a perfectly plausible thing for the field to say.
 */
describe("Add Student defaults to a new admission", () => {
  const addPage = read("src/app/protected/students/new/page.tsx");
  const editPage = read("src/app/protected/students/[studentId]/edit/page.tsx");
  const form = read("src/modules/students/ui/student-form.tsx");

  it("preselects New on the add form", () => {
    expect(addPage).toMatch(/studentTypeOverride:\s*"new"/);
    expect(addPage).not.toMatch(/studentTypeOverride:\s*"existing"/);
  });

  it("leaves the edit form showing what is actually stored", () => {
    // Editing must never re-classify a student as a side effect of opening the
    // page, so the fallback there stays "existing" — it mirrors what the
    // resolver returns for a student with no override.
    expect(editPage).toMatch(/studentTypeOverride:\s*student\.studentTypeOverride\s*\?\?\s*"existing"/);
  });

  it("still offers both choices", () => {
    expect(form).toContain('<option value="new">New</option>');
    expect(form).toContain('<option value="existing">Existing</option>');
  });
});
