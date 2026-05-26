import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getStudentFormOptions = vi.fn();
const getStudentsPage = vi.fn();
const getClassOptionsForSession = vi.fn();
const requireStaffPermission = vi.fn();
const hasStaffPermission = vi.fn();

vi.mock("server-only", () => ({}));

// Server pages call getTranslations() from next-intl/server, which expects the
// next-intl request config to be bootstrapped. In tests we substitute a sync
// translator built from the English message catalog so the rendered markup
// matches the production English copy.
vi.mock("next-intl/server", async () => {
  const actual = await vi.importActual<typeof import("next-intl")>("next-intl");
  const messages = JSON.parse(
    readFileSync(join(process.cwd(), "messages", "en.json"), "utf-8"),
  );
  return {
    getTranslations: async (namespace: string) =>
      actual.createTranslator({ locale: "en", messages, namespace }),
  };
});

vi.mock("@/lib/students/data", async () => {
  const actual = await vi.importActual<typeof import("@/lib/students/data")>(
    "@/lib/students/data",
  );

  return {
    ...actual,
    getStudentFormOptions,
    getStudentsPage,
    getClassOptionsForSession,
  };
});

vi.mock("@/lib/supabase/session", () => ({
  requireStaffPermission,
  hasStaffPermission,
}));

vi.mock("@/lib/session/cookie", () => ({
  getViewSessionCookie: vi.fn(async () => null),
}));

vi.mock("@/lib/session/resolver", () => ({
  resolveViewSession: vi.fn(async () => ({
    sessionLabel: "2026-27",
    source: "policy",
    isTest: false,
  })),
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

vi.mock("@/components/students/student-quick-load", () => ({
  StudentQuickLoad: ({ initialStudents, initialTotalCount }: {
    initialStudents: unknown[];
    initialTotalCount: number;
  }) =>
    React.createElement(
      "div",
      null,
      `quick-load students:${initialStudents.length} total:${initialTotalCount}`,
    ),
}));

vi.mock("@/components/students/student-session-mismatch-actions", () => ({
  StudentSessionMismatchActions: () => React.createElement("div", null, "session-mismatch"),
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
    getClassOptionsForSession.mockReturnValue([]);
  });

  it("renders even when student data loading fails", async () => {
    getStudentsPage.mockRejectedValue(new Error("permission denied for schema private"));

    const { default: StudentsPage } = await import("@/app/protected/students/page");
    const element = await StudentsPage({
      searchParams: Promise.resolve({ sessionLabel: "2026-27" }),
    });
    const html = renderToStaticMarkup(element as React.ReactElement);

    expect(html).toContain("Students could not be loaded safely");
    expect(html).toContain("Load warning");
    // Page still renders the quick-load shell with an empty initial list.
    expect(html).toContain("quick-load students:0 total:0");
  });
});
