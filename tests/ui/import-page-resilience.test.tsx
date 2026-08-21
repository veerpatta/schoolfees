import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getStudentImportPageData = vi.fn();
const getStudentImportWorkflowReadiness = vi.fn();
const getStudentFormOptions = vi.fn();
const requireStaffPermission = vi.fn();
const hasStaffPermission = vi.fn();
const getViewSessionCookie = vi.fn();
const resolveViewSession = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/modules/imports/data/queries", async () => {
  const actual = await vi.importActual<typeof import("@/modules/imports/data/queries")>(
    "@/modules/imports/data/queries",
  );

  return {
    ...actual,
    getStudentImportPageData,
  };
});

vi.mock("@/modules/imports/data/readiness", () => ({
  getStudentImportWorkflowReadiness,
}));

vi.mock("@/modules/students/data/queries", () => ({
  getStudentFormOptions,
}));

vi.mock("@/platform/supabase/session", () => ({
  requireStaffPermission,
  hasStaffPermission,
}));

vi.mock("@/platform/session/cookie", () => ({
  getViewSessionCookie,
}));

vi.mock("@/platform/session/resolver", () => ({
  resolveViewSession,
}));

vi.mock("@/modules/imports/ui/student-import-workflow", () => ({
  StudentImportWorkflow: ({ data }: { data: { selectedBatch: unknown } }) =>
    React.createElement("div", null, data.selectedBatch ? "batch" : "empty"),
}));

vi.mock("@/ui/office/office-ui", () => ({
  WorkflowGuard: ({ title, detail }: { title: string; detail: string }) =>
    React.createElement("div", null, `${title} ${detail}`),
}));

describe("imports page resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireStaffPermission.mockResolvedValue({ appRole: "admin" });
    hasStaffPermission.mockReturnValue(true);
    getViewSessionCookie.mockResolvedValue(null);
    resolveViewSession.mockResolvedValue({ sessionLabel: "2026-27" });
    getStudentFormOptions.mockResolvedValue({
      currentSessionLabel: "2026-27",
      sessionOptions: [],
    });
  });

  it("renders even when import data and readiness fail", async () => {
    getStudentImportPageData.mockRejectedValue(new Error("import data failed"));
    getStudentImportWorkflowReadiness.mockRejectedValue(new Error("readiness failed"));

    const { default: ImportsPage } = await import("@/app/protected/imports/page");
    const element = await ImportsPage({
      searchParams: Promise.resolve({ mode: "add" }),
    });
    const html = renderToStaticMarkup(element as React.ReactElement);

    expect(html).toContain("Import data could not be loaded safely");
    expect(html).toContain("Import readiness could not be loaded safely");
    expect(html).toContain("empty");
  });
});
