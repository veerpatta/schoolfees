import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Download links must stay real navigations.
 *
 * Their hrefs hit a route handler returning a binary attachment (XLSX) or a
 * printable HTML page. Rendering one as <Link> makes the App Router intercept
 * the click as a client-side navigation, which silently no-ops for a non-RSC
 * response — "the button does nothing". That bug was live in the Students
 * template dropdown for months.
 *
 * The invariant used to be pinned to the literal JSX in exports/page.tsx. It
 * now lives in the shared primitive instead, so it holds for every call site
 * rather than the one page someone remembered to write a test for.
 */

const root = process.cwd();
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");

/**
 * These checks are about code, not prose. The component's own comments explain
 * that it must never call preventDefault, which would otherwise trip the very
 * assertion enforcing it.
 */
function stripComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("DownloadAnchor stays a real navigation", () => {
  const source = stripComments(read("src/ui", "primitives", "download-anchor.tsx"));

  it("renders a real anchor, not a Link", () => {
    expect(source).toMatch(/<a\s/);
    expect(source).not.toMatch(/from\s+["']next\/link["']/);
  });

  // The three ways this component could quietly stop being a download.
  it("never intercepts the click", () => {
    expect(source).not.toContain("preventDefault");
  });

  it("never turns the download into a fetch or a blob", () => {
    expect(source).not.toMatch(/\bfetch\(/);
    expect(source).not.toContain("createObjectURL");
    expect(source).not.toContain("XMLHttpRequest");
  });

  it("always stops spinning, even if the response never arrives", () => {
    expect(source).toContain("timeoutMs");
    expect(source).toMatch(/setTimeout/);
  });
});

describe("exports page", () => {
  const source = read("src/app", "protected", "exports", "page.tsx");

  it("does not import next/link", () => {
    expect(source).not.toMatch(/from\s+["']next\/link["']/);
  });

  it("routes both formats through the shared primitive", () => {
    expect(source).toContain("DownloadAnchor");
    expect(source).toMatch(/<DownloadAnchor[\s\S]*?href=\{xlsxHref\}/);
    expect(source).toMatch(/<DownloadAnchor[\s\S]*?href=\{pdfHref\}/);
    expect(source).toContain('target="_blank"');
  });
});

// ---------------------------------------------------------------------------
// Contract: every download link goes through the primitive
// ---------------------------------------------------------------------------

/** Route handlers that answer with a file rather than a page. */
const DOWNLOAD_ROUTES = [
  "/protected/exports/",
  "/protected/imports/template",
  "/protected/reports/export",
  "/protected/transactions/export",
  "/protected/finance-controls/export",
  "/protected/payments/bulk/template",
  "/protected/students/bulk-update/template",
];

/**
 * Files that mention a download route and also use <Link> somewhere.
 *
 * The check is deliberately coarse — it cannot tell which <Link> owns which
 * href — and that coarseness is what caught two live no-op downloads (the
 * dashboard empty-state quick action and the bulk-import dialog). The cost is
 * that files with a download href AND unrelated page links need listing here,
 * each with a reason recording that someone checked.
 */
const ALLOWED: Record<string, string> = {
  "src/app/protected/dashboard/page.tsx":
    "template quick action uses DownloadAnchor; the other quick actions are pages",
  // The dialog body moved out of student-bulk-import-dialog.tsx when the
  // trigger was made lazy; the trigger itself now has no download href at all.
  "src/components/students/student-bulk-import-dialog-body.tsx":
    "template button uses DownloadAnchor; remaining Links are pages",
  // Builds its own href and hands it to DownloadAnchor; the string literal
  // lives here rather than at the anchor.
  "src/components/students/bulk-update-workspace.tsx": "href built here, rendered by DownloadAnchor",
  "src/components/imports/batch-upload-card.tsx": "href built here, rendered by DownloadAnchor",
  "src/app/protected/reports/page.tsx": "href built here, rendered by DownloadAnchor",
  "src/app/protected/finance-controls/page.tsx": "href built here, rendered by DownloadAnchor",
  "src/components/defaulters/defaulters-workspace.tsx": "href built here, rendered by DownloadAnchor",
  "src/app/protected/students/page.tsx": "href built here, rendered by DownloadAnchor",
  "src/app/protected/exports/page.tsx": "href built here, rendered by DownloadAnchor",
  "src/app/protected/defaulters/page.tsx": "builds exportHref, passed to defaulters-workspace",
  "src/app/protected/admin-tools/recovery/page.tsx": "href built here, rendered by DownloadAnchor",
  "src/components/payments/bulk/bulk-payment-workflow.tsx":
    "href built here, rendered by DownloadAnchor",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (entry.endsWith(".tsx") && !entry.endsWith(".test.tsx")) {
      out.push(full);
    }
  }
  return out;
}

describe("no download link bypasses the primitive", () => {
  it("has no <Link> pointing at a download route", () => {
    const offenders: string[] = [];

    for (const dir of ["src"]) {
      for (const file of walk(join(root, dir))) {
        const relative = file.slice(root.length + 1).split("\\").join("/");
        const code = readFileSync(file, "utf8");

        if (!DOWNLOAD_ROUTES.some((route) => code.includes(route))) continue;
        if (relative in ALLOWED) continue;
        // A <Link> to a download route is the exact shipped bug.
        if (/<Link[^>]*href=/.test(code)) offenders.push(relative);
      }
    }

    expect(offenders.sort()).toEqual([]);
  });

  it("has no stale allowlist entries", () => {
    for (const entry of Object.keys(ALLOWED)) {
      expect(() => read(...entry.split("/"))).not.toThrow();
    }
  });
});
