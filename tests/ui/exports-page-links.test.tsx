import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The export tiles must be plain anchors: their hrefs hit a route handler that
// returns a binary attachment (XLSX) or a printable HTML page. Rendering them
// as <Link> makes App Router intercept the click as a client-side navigation,
// which silently no-ops for a non-RSC binary response — "the button does
// nothing". Regression guard for that exact bug.
describe("exports page download links", () => {
  const source = readFileSync(
    join(process.cwd(), "app", "protected", "exports", "page.tsx"),
    "utf8",
  );

  it("does not import next/link", () => {
    expect(source).not.toMatch(/from\s+["']next\/link["']/);
  });

  it("renders the XLSX action as a plain download anchor", () => {
    expect(source).toMatch(/<a\s[^>]*href=\{xlsxHref\}/);
    expect(source).toMatch(/href=\{xlsxHref\}\s*\n\s*download/);
  });

  it("renders the PDF action as a plain anchor in a new tab", () => {
    expect(source).toMatch(/<a\s[^>]*href=\{pdfHref\}/);
    expect(source).toContain('target="_blank"');
  });
});
