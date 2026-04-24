import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getStudentFormOptions = vi.fn();
const getStudents = vi.fn();
const requireStaffPermission = vi.fn();
const hasStaffPermission = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/students/data", async () => {
  const actual = await vi.importActual<typeof import("@/lib/students/data")>(
    "@/lib/students/data",
  );

  return {
    ...actual,
    getStudentFormOptions,
    getStudents,
  };
});

vi.mock("@/lib/supabase/session", () => ({
  requireStaffPermission,
  hasStaffPermission,
}));

vi.mock("@/components/students/student-bulk-import-dialog", () => ({
  StudentBulkImportDialogTrigger: () => React.createElement("button", null, "Bulk Add Students"),
}));

vi.mock("@/components/students/student-filters", () => ({
  StudentFilters: () => React.createElement("div", null, "filters"),
}));

vi.mock("@/components/students/student-list-table", () => ({
  StudentListTable: ({ students }: { students: unknown[] }) =>
    React.createElement("div", null, `students:${students.length}`),
}));

describe("students page resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireStaffPermission.mockResolvedValue({ appRole: "admin" });
    hasStaffPermission.mockReturnValue(true);
    getStudentFormOptions.mockResolvedValue({
      allClassOptions: [],
      routeOptions: [],
      sessionOptions: [{ value: "2026-27", label: "2026-27" }],
      resolvedSessionLabel: "2026-27",
    });
  });

  it("renders even when student data loading fails", async () => {
    getStudents.mockRejectedValue(new Error("permission denied for schema private"));

    const { default: StudentsPage } = await import("@/app/protected/students/page");
    const element = await StudentsPage({
      searchParams: Promise.resolve({ sessionLabel: "2026-27" }),
    });
    const html = renderToStaticMarkup(element as React.ReactElement);

    expect(html).toContain("Students could not be loaded safely");
    expect(html).toContain("Load warning");
    expect(html).toContain("students:0");
  });
});
