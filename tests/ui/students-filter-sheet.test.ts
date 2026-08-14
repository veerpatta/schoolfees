import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The Students filter sheet applies as you tap, and now says so.
 *
 * It always did apply instantly — the list behind it refetched on every
 * change — but it ended in an "Apply filters" button, which told the reader the
 * opposite. These are the three things that fixed it, all of which a refactor
 * could quietly undo.
 */

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const QUICK_LOAD = "components/students/student-quick-load.tsx";

describe("Students filter sheet", () => {
  it("pins a live count where the Apply button used to be", () => {
    const source = read(QUICK_LOAD);

    // Outside the scroll body, so it survives a long sheet and the keyboard.
    expect(source).toContain("footer={");
    expect(source).toContain('t("filterShowNStudents", { count:');
    expect(source).toContain('t("filterInstantApplyHint")');
    // The old button claimed the list was waiting on a decision it had already
    // acted on. It must not come back.
    expect(source).not.toContain('t("filterApplyFilters")');
  });

  it("shows the whole school at once instead of one class at a time", () => {
    const source = read(QUICK_LOAD);

    expect(source).toContain("grid grid-cols-4 gap-2");
    // One source of truth: the grid writes the same filters.classId the
    // header's chip row writes, so the two cannot disagree.
    expect(source).toContain("classId: previous.classId === option.id");
  });

  it("offers only sorts that order the whole roll", () => {
    const source = read(QUICK_LOAD);

    expect(source).toContain('t("filterSortBy")');
    expect(source).toContain('labelKey: "sortName"');
    expect(source).toContain('labelKey: "sortClass"');
    // Dues cannot be sorted here: the list query runs against public.students
    // and dues are enriched after paging, so a dues sort would reorder only the
    // rows already loaded. That ranking lives on the Overdue view and the
    // Defaulters screen.
    expect(source).not.toContain("sortDues");
  });

  it("sorts in SQL on both passes, so the list does not reshuffle mid-load", () => {
    const data = read("lib/students/data.ts");

    // One helper, used by the identity and the financial pass. A different
    // order in either shows the list visibly reordering itself as the enriched
    // rows overwrite the identities.
    expect(data).toContain("function applyStudentSort");
    // Two call sites: getStudentsPageUncached and getStudentsIdentityPage.
    expect(data.match(/applyStudentSort\(/g) ?? []).toHaveLength(2);
    // full_name is always the last key: class order alone leaves students
    // within a class unordered, and .range() then repeats or skips rows.
    expect(data).toContain(
      '.order("sort_order", { ascending: true, referencedTable: "class_ref" })\n' +
        '      .order("full_name", { ascending: true });',
    );
  });

  it("keeps sort in the URL so a filtered list can be linked as seen", () => {
    const params = read("lib/students/filter-params.ts");

    expect(params).toContain('params.set("sort", filters.sort)');
    expect(params).toContain('read("sort")');
  });
});
