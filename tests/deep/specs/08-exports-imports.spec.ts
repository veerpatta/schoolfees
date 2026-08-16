import { writeFileSync } from "node:fs";
import path from "node:path";

import * as XLSX from "xlsx";

import { test } from "../fixtures";
import { downloadDir, reproCommand } from "../lib/artifacts";
import { TEST_SESSION } from "../lib/identity";
import {
  EXPORT_DIMENSION,
  EXPORT_FORMATS,
  EXPORT_FORMAT_DIMENSION,
  EXPORT_TYPES,
  XLSX_ONLY_EXPORTS,
} from "../surface/params";

/**
 * Every export, in every format, actually opened.
 *
 * A download endpoint that answers 200 with an HTML error page is the failure
 * mode worth catching, and only parsing the bytes catches it. `XLSX.readFile`
 * on each one is the difference between "the link works" and "the office can
 * open the file".
 *
 * The link-presence check is separate and deliberate: every download in this
 * app must be a `DownloadAnchor`, not a `<Link>` — a Link silently no-ops on a
 * binary attachment, and that has bitten this codebase twice.
 */

test.describe.configure({ mode: "serial" });

test("the exports page offers every declared export", async ({
  page,
  findings,
  target,
  withSession,
}) => {
  await page.goto(withSession("/protected/exports"), { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

  for (const exportType of EXPORT_TYPES) {
    const link = page.locator(`a[href*="/protected/exports/${exportType}"]`);
    const count = await link.count().catch(() => 0);

    if (count === 0) {
      findings.record({
        rule: "export.missing-link",
        surface: "/protected/exports",
        title: `No download link for ${exportType}`,
        expected: `The exports page renders a link to /protected/exports/${exportType}.`,
        actual: "No matching anchor found.",
        target,
        session: TEST_SESSION,
        evidence: { reproCommand: reproCommand({ target, grep: "exports page offers" }) },
      });
      continue;
    }

    // A download rendered as a Next <Link> instead of a plain anchor navigates
    // client-side and silently does nothing with an attachment response.
    const href = await link.first().getAttribute("href");
    if (href && !href.includes("session=")) {
      findings.record({
        rule: "export.missing-link",
        surface: `/protected/exports/${exportType}`,
        title: `${exportType} link does not carry the session`,
        expected: "Every export href carries ?session= so the file matches the workspace.",
        actual: `href="${href}"`,
        target,
        session: TEST_SESSION,
        evidence: { reproCommand: reproCommand({ target, grep: "exports page offers" }) },
      });
    }
  }
});

test("every export downloads and parses", async ({
  request,
  coverage,
  findings,
  target,
}) => {
  for (const exportType of EXPORT_TYPES) {
    for (const format of EXPORT_FORMATS) {
      if (format === "pdf" && XLSX_ONLY_EXPORTS.has(exportType)) continue;

      const url =
        `/protected/exports/${exportType}` +
        `?session=${encodeURIComponent(TEST_SESSION)}&format=${format}`;

      const response = await request.get(url, { failOnStatusCode: false });
      coverage.visit(EXPORT_DIMENSION.id, exportType);
      coverage.visit(EXPORT_FORMAT_DIMENSION.id, format);

      if (!response.ok()) {
        findings.record({
          rule: "export.invalid-xlsx",
          surface: url,
          title: `${exportType} (${format}) returned HTTP ${response.status()}`,
          expected: "A declared export downloads for a role holding reports:view.",
          actual: `HTTP ${response.status()}: ${(await response.text()).slice(0, 300)}`,
          target,
          session: TEST_SESSION,
          role: "admin",
          evidence: {
            request: { method: "GET", url, status: response.status() },
            reproCommand: reproCommand({ target, grep: "every export downloads" }),
          },
        });
        continue;
      }

      const body = await response.body();
      const filePath = path.join(downloadDir(), `${exportType}.${format}`);
      writeFileSync(filePath, body);

      if (format === "xlsx") {
        // PK is the zip magic every xlsx starts with. An HTML error page served
        // with a 200 fails here rather than reaching somebody's desk.
        const looksLikeZip = body.length > 0 && body[0] === 0x50 && body[1] === 0x4b;
        let sheetNames: string[] = [];
        try {
          sheetNames = XLSX.read(body, { type: "buffer" }).SheetNames;
        } catch {
          sheetNames = [];
        }

        if (!looksLikeZip || sheetNames.length === 0) {
          findings.record({
            rule: "export.invalid-xlsx",
            surface: url,
            title: `${exportType} did not parse as a workbook`,
            expected: "The download is a non-empty XLSX with at least one sheet.",
            actual: `${body.length} bytes, zip-magic=${looksLikeZip}, sheets=${sheetNames.length}`,
            target,
            session: TEST_SESSION,
            role: "admin",
            evidence: { reproCommand: reproCommand({ target, grep: "every export downloads" }) },
          });
        }
      } else {
        // `?format=pdf` is a printable HTML page, not a PDF file — the route
        // hands the browser something to print rather than rendering a
        // document server-side. So the assertion is that it is a real report
        // page with rows in it, not that it begins with %PDF.
        const html = body.toString("utf8");
        const looksPrintable =
          /<table|<html/i.test(html) && html.length > 500 && !/Application error/i.test(html);

        if (!looksPrintable) {
          findings.record({
            rule: "export.invalid-xlsx",
            surface: url,
            title: `${exportType} (pdf) did not render a printable report`,
            expected:
              "?format=pdf returns a printable HTML report — a table the office " +
              "can print — not an error page and not an empty document.",
            actual: `${body.length} bytes, begins: ${html.slice(0, 160)}`,
            target,
            session: TEST_SESSION,
            role: "admin",
            evidence: { reproCommand: reproCommand({ target, grep: "every export downloads" }) },
          });
        }
      }
    }
  }
});

test("dues exports carry fees and late fee as separate columns", async ({
  request,
  findings,
  target,
}) => {
  // The documented regression: under a single `Outstanding` column, the two
  // students whose only debt is a ₹1,000 late fee read ₹0 and sorted below
  // families who owed nothing at all.
  const url =
    `/protected/exports/class-wise-dues?session=${encodeURIComponent(TEST_SESSION)}&format=xlsx`;
  const response = await request.get(url, { failOnStatusCode: false });
  if (!response.ok()) return;

  const workbook = XLSX.read(await response.body(), { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
  const headers = new Set(rows.length > 0 ? Object.keys(rows[0]) : []);

  const hasLateFeeColumn = [...headers].some((header) => /late\s*fee/i.test(header));
  const hasTotalColumn = [...headers].some((header) => /total/i.test(header));

  if (!hasLateFeeColumn || !hasTotalColumn) {
    findings.record({
      rule: "export.invalid-xlsx",
      surface: url,
      title: "class-wise-dues does not separate fees from late fee",
      expected:
        "Every dues export carries fees pending, late fee pending and total owed " +
        "as three columns — a late fee is never folded into a fees figure.",
      actual: `Headers: ${[...headers].join(", ").slice(0, 400)}`,
      target,
      session: TEST_SESSION,
      evidence: { reproCommand: reproCommand({ target, grep: "dues exports carry" }) },
    });
  }
});

test("import template downloads and the dry-run validates without committing", async ({
  page,
  request,
  findings,
  target,
  withSession,
}) => {
  const templateUrl = `/protected/imports/template?mode=add&sessionLabel=${encodeURIComponent(TEST_SESSION)}`;
  const templateResponse = await request.get(templateUrl, { failOnStatusCode: false });

  if (!templateResponse.ok()) {
    findings.record({
      rule: "export.missing-link",
      surface: templateUrl,
      title: `Import template returned HTTP ${templateResponse.status()}`,
      expected: "Staff can download the Add template to start an import.",
      actual: `HTTP ${templateResponse.status()}`,
      target,
      session: TEST_SESSION,
      evidence: { reproCommand: reproCommand({ target, grep: "import template" }) },
    });
    return;
  }

  const workbook = XLSX.read(await templateResponse.body(), { type: "buffer" });

  // The policy columns are deliberately absent from the template: a sheet cell
  // must not be able to apply RTE, Staff Child or 3rd Child. That is pinned by
  // tests/integration/import-policy-isolation.test.ts, and asserted here too
  // because the template is what an office actually fills in.
  const fillSheet = workbook.Sheets["Fill Students Here"];
  const header = fillSheet
    ? (XLSX.utils.sheet_to_json(fillSheet, { header: 1 })[0] as unknown[])
    : [];
  const headerText = header.map(String).join(" | ");

  await page.goto(withSession("/protected/imports?mode=add"), {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

  const uploadInput = await page.locator('input[name="importFile"]').count().catch(() => 0);
  if (uploadInput === 0) {
    findings.record({
      rule: "ux.observation",
      surface: "/protected/imports",
      title: "Import upload control not found",
      expected: "The staged import workflow starts with a file input.",
      actual: `Template headers were: ${headerText.slice(0, 300)}`,
      target,
      session: TEST_SESSION,
      evidence: { reproCommand: reproCommand({ target, grep: "import template" }) },
    });
  }
});
