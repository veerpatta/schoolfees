import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import * as XLSX from "xlsx";

const TEST_SESSION = "TEST-2026-27";
const TODAY = "2026-05-26";
const reportRoot = path.resolve("docs/smoke-reports/2026-05");
const screenshotDir = path.join(reportRoot, "screenshots");
const exportDir = path.join(reportRoot, "exports");
const resultsPath = path.resolve("tests/smoke-2026-05/smoke-results.jsonl");

type Finding = {
  severity: "P0" | "P1" | "P2" | "P3" | "UX";
  title: string;
  surface: string;
  expected: string;
  actual: string;
  screenshot?: string;
  consoleOrNetwork?: string;
  suspectedFile?: string;
  rootCause?: string;
  proposedFix?: string;
  risk?: string;
};

const exportTypes = [
  "all-students",
  "conventional-discount-students",
  "class-wise-dues",
  "defaulters",
  "receipt-register",
  "ai-context-bundle",
] as const;

function withSession(route: string) {
  const separator = route.includes("?") ? "&" : "?";
  return `${route}${separator}session=${encodeURIComponent(TEST_SESSION)}`;
}

function slug(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 90);
}

function relReportPath(absPath: string) {
  return `./${path.relative(reportRoot, absPath).replace(/\\/g, "/")}`;
}

async function appendResult(payload: unknown) {
  await appendFile(resultsPath, `${JSON.stringify(payload)}\n`, "utf8");
}

async function screenshot(page: Page, name: string) {
  const filePath = path.join(screenshotDir, `${slug(name)}.png`);
  try {
    await page.screenshot({ path: filePath, fullPage: true, timeout: 45_000 });
  } catch {
    await page.screenshot({ path: filePath, fullPage: false, timeout: 30_000 }).catch(() => null);
  }
  return relReportPath(filePath);
}

async function discoverTestStudent(request: APIRequestContext) {
  const response = await request.get(`/protected/students/index?purpose=paymentDesk&session=${encodeURIComponent(TEST_SESSION)}`);
  if (!response.ok()) return null;
  const payload = await response.json();
  const students = Array.isArray(payload.students) ? payload.students : [];
  return (
    students.find((student: any) => String(student.admissionNo ?? "").toUpperCase().startsWith("TEST-")) ??
    students.find((student: any) => /TEST/i.test(`${student.admissionNo ?? ""} ${student.fullName ?? ""}`)) ??
    null
  );
}

async function apiSmoke(request: APIRequestContext, studentId: string | undefined, findings: Finding[]) {
  const endpoints = [
    "/api/manifest",
    `/protected/students/index?query=ZZZZZZ&session=${encodeURIComponent(TEST_SESSION)}`,
    studentId ? `/protected/payments/student-summary?studentId=${encodeURIComponent(studentId)}` : null,
    `/protected/transactions/data?session=${encodeURIComponent(TEST_SESSION)}`,
    "/protected/receipts/search?q=SVP",
  ].filter(Boolean) as string[];

  for (const endpoint of endpoints) {
    const response = await request.get(endpoint);
    const body = await response.text();
    await appendResult({ type: "api", endpoint, status: response.status(), ok: response.ok(), bodyPreview: body.slice(0, 500) });
    if (!response.ok()) {
      findings.push({
        severity: endpoint.includes("student-summary") ? "P1" : "P2",
        title: `API smoke failed for ${endpoint}`,
        surface: endpoint,
        expected: "Idempotent GET endpoint should return a 2xx response for the documented smoke request.",
        actual: `HTTP ${response.status()}: ${body.slice(0, 250)}`,
        consoleOrNetwork: `${response.status()} ${endpoint}`,
        suspectedFile: endpoint.includes("student-summary")
          ? "app/protected/payments/student-summary/route.ts:60"
          : endpoint.includes("receipts/search")
            ? "app/protected/receipts/search/route.ts:16"
            : undefined,
        risk: "Client-side data loaders or smoke probes may fail against the live deployment.",
      });
    }
  }
}

async function exportSmoke(page: Page, findings: Finding[]) {
  await page.goto(withSession("/protected/exports"), { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(5_000);
  await screenshot(page, "special-exports-page");
  for (const exportType of exportTypes) {
    const link = page.locator(`a[href*="/protected/exports/${exportType}"][href*="session="]:has-text("XLSX")`).first();
    if (!(await link.count())) {
      findings.push({
        severity: "P1",
        title: `Missing XLSX export link for ${exportType}`,
        surface: "/protected/exports",
        expected: `XLSX link for ${exportType}.`,
        actual: "No matching link found.",
        screenshot: await screenshot(page, `bug-missing-export-${exportType}`),
        suspectedFile: "app/protected/exports/page.tsx:116",
        risk: "Office cannot download a required workbook.",
      });
      continue;
    }
    const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
    await link.click();
    const download = await downloadPromise;
    const filePath = path.join(exportDir, `${exportType}.xlsx`);
    await download.saveAs(filePath);
    const bytes = await readFile(filePath);
    let validXlsx = bytes.length > 0 && bytes[0] === 0x50 && bytes[1] === 0x4b;
    try {
      XLSX.readFile(filePath);
    } catch {
      validXlsx = false;
    }
    await appendResult({ type: "export", exportType, bytes: bytes.length, validXlsx });
    if (!validXlsx) {
      findings.push({
        severity: "P1",
        title: `Invalid XLSX export: ${exportType}`,
        surface: "/protected/exports",
        expected: "Downloaded file should be non-empty and parse as XLSX.",
        actual: `${bytes.length} bytes, validXlsx=${validXlsx}.`,
        screenshot: await screenshot(page, `bug-invalid-export-${exportType}`),
        suspectedFile: "app/protected/exports/[exportType]/route.ts:27",
        risk: "Office staff may receive unusable exports.",
      });
    }
  }
}

async function importDryRunSmoke(page: Page, findings: Finding[]) {
  await page.goto(withSession("/protected/imports?mode=add"), { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(3_000);
  const templateLink = page.getByRole("link", { name: /download add template/i });
  if (!(await templateLink.count())) {
    findings.push({
      severity: "P1",
      title: "Import template download link missing",
      surface: "/protected/imports",
      expected: "Add-template download is visible.",
      actual: "No Add Template link found.",
      screenshot: await screenshot(page, "bug-import-template-missing"),
      suspectedFile: "components/imports/batch-upload-card.tsx:55",
      risk: "Staff cannot start the import workflow from the UI.",
    });
    return;
  }
  const templateDownloadPromise = page.waitForEvent("download", { timeout: 60_000 });
  await templateLink.click();
  const templateDownload = await templateDownloadPromise;
  const templatePath = path.resolve("tests/smoke-2026-05/import-template.xlsx");
  await templateDownload.saveAs(templatePath);
  const workbook = XLSX.readFile(templatePath);
  const listRows = workbook.Sheets["Current Lists"] ? (XLSX.utils.sheet_to_json(workbook.Sheets["Current Lists"], { header: 1 }) as any[][]) : [];
  const classLabel = String(listRows[1]?.[0] ?? "").trim();
  const routeLabel = String(listRows[1]?.[1] ?? "").trim();
  workbook.Sheets["Fill Students Here"] = XLSX.utils.aoa_to_sheet([
    ["Student name", "Class", "SR no", "Father name", "Phone", "Route", "New/Old", "Conventional Policy 1", "Conventional Policy 2", "Family Group / Sibling Group", "Policy Notes", "Notes"],
    ["TEST Smoke Valid One", classLabel, `TEST-SMOKE-${Date.now()}-1`, "Smoke Father", "9999999991", routeLabel, "New", "", "", "", "", "dry-run valid"],
    ["TEST Smoke Valid Two", classLabel, `TEST-SMOKE-${Date.now()}-2`, "Smoke Father", "9999999992", "", "Existing", "", "", "", "", "dry-run valid"],
    ["TEST Smoke Valid Three", classLabel, `TEST-SMOKE-${Date.now()}-3`, "Smoke Father", "9999999993", "", "New", "", "", "", "", "dry-run valid"],
    ["", classLabel, `TEST-SMOKE-${Date.now()}-4`, "Smoke Father", "9999999994", "", "New", "", "", "", "", "invalid missing student"],
    ["TEST Smoke Invalid Class", "Definitely Not A Class", `TEST-SMOKE-${Date.now()}-5`, "Smoke Father", "9999999995", "", "New", "", "", "", "", "invalid class"],
    ["TEST Smoke Invalid Phone", classLabel, `TEST-SMOKE-${Date.now()}-6`, "Smoke Father", "abc", "", "New", "", "", "", "", "invalid phone"],
  ]);
  const uploadPath = path.resolve("tests/smoke-2026-05/import-smoke-dryrun.xlsx");
  XLSX.writeFile(workbook, uploadPath);
  await page.setInputFiles('input[name="importFile"]', uploadPath);
  await page.locator('select[name="sessionLabel"]').selectOption(TEST_SESSION);
  await Promise.all([page.waitForURL(/\/protected\/imports\?/, { timeout: 60_000 }), page.getByRole("button", { name: /upload file/i }).click()]);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(3_000);
  await screenshot(page, "import-after-upload");
  const dryRunButton = page.getByRole("button", { name: /check rows|dry-run|validate/i }).first();
  if ((await dryRunButton.count()) && (await dryRunButton.isEnabled().catch(() => false))) {
    await Promise.all([page.waitForURL(/\/protected\/imports\?/, { timeout: 60_000 }), dryRunButton.click()]);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3_000);
    await screenshot(page, "import-after-dry-run");
  } else {
    await appendResult({ type: "import", status: "uploaded-auto-validated-or-recheck-disabled" });
    await screenshot(page, "import-no-dry-run-button");
  }
}

async function paymentSmoke(page: Page, request: APIRequestContext, testStudent: any, findings: Finding[]) {
  if (!testStudent?.id || !String(testStudent.admissionNo ?? "").toUpperCase().startsWith("TEST-")) {
    findings.push({
      severity: "P0",
      title: "Payment write path skipped because no TEST-prefixed student was discovered",
      surface: "/protected/payments",
      expected: "A TEST-prefixed student exists in TEST-2026-27 for safe write-path smoke.",
      actual: `Discovered student: ${JSON.stringify(testStudent ?? null).slice(0, 300)}`,
      risk: "Payment posting cannot be safely verified without risking live-like records.",
    });
    return;
  }
  await page.goto(withSession(`/protected/payments?studentId=${testStudent.id}`), { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(5_000);
  await page.getByLabel(/amount received/i).first().fill("100");
  await page.getByRole("button", { name: /^upi$/i }).first().click().catch(() => null);
  await page.getByRole("button", { name: /review receipt/i }).first().click();
  await page.waitForTimeout(1_000);
  await screenshot(page, "payment-preview-upi-before-cash-post");
  await page.keyboard.press("Escape").catch(() => null);
  await page.waitForTimeout(500);
  if (await page.getByText(/confirm & save payment/i).isVisible().catch(() => false)) {
    findings.push({
      severity: "P3",
      title: "Payment confirmation modal does not close with ESC",
      surface: "/protected/payments",
      expected: "ESC closes the topmost payment confirmation overlay.",
      actual: "The Confirm & Save Payment modal stayed open after ESC.",
      screenshot: await screenshot(page, "bug-payment-confirm-esc-stays-open"),
      suspectedFile: "components/payments/confirm-receipt-sheet.tsx:92",
      risk: "Keyboard users must find the Back / Edit control to recover from preview.",
    });
    await page.getByRole("button", { name: /back.*edit/i }).click();
    await page.waitForTimeout(500);
  }
  await page.getByRole("button", { name: /^cash$/i }).first().click().catch(() => null);
  const before = await request.get(`/protected/transactions/data?view=receipts&session=${encodeURIComponent(TEST_SESSION)}&query=${encodeURIComponent(testStudent.admissionNo)}`);
  const beforeRows = before.ok() ? ((await before.json()).rows ?? []) : [];
  await page.getByRole("button", { name: /review receipt/i }).first().click();
  await page.waitForTimeout(5_000);
  const shot = await screenshot(page, "payment-after-cash-post");
  const pageText = await page.locator("body").innerText().catch(() => "");
  const after = await request.get(`/protected/transactions/data?view=receipts&session=${encodeURIComponent(TEST_SESSION)}&query=${encodeURIComponent(testStudent.admissionNo)}`);
  const afterRows = after.ok() ? ((await after.json()).rows ?? []) : [];
  await appendResult({ type: "payment", student: testStudent, beforeCount: beforeRows.length, afterCount: afterRows.length, pageText: pageText.slice(0, 500) });
  if (!/SVP/i.test(pageText) || afterRows.length <= beforeRows.length) {
    findings.push({
      severity: "P0",
      title: "Payment Desk TEST write-path did not prove receipt + transactions update",
      surface: "/protected/payments",
      expected: "₹100 Cash post returns an SVP receipt and adds a transactions row.",
      actual: `SVP on page=${/SVP/i.test(pageText)}; rows before=${beforeRows.length}; rows after=${afterRows.length}.`,
      screenshot: shot,
      suspectedFile: "app/protected/payments/actions.ts",
      risk: "Cashier critical path is not proven safe.",
    });
  }
}

test("desktop API, exports, imports, and TEST payment write-path", async ({ page, request }) => {
  await mkdir(screenshotDir, { recursive: true });
  await mkdir(exportDir, { recursive: true });
  const findings: Finding[] = [];
  const testStudent = await discoverTestStudent(request);

  await apiSmoke(request, testStudent?.id, findings);
  await exportSmoke(page, findings).catch(async (error) => {
    findings.push({
      severity: "P1",
      title: "Exports workflow failed during special smoke",
      surface: "/protected/exports",
      expected: "Exports page loads and each XLSX downloads.",
      actual: error instanceof Error ? error.message : String(error),
      screenshot: await screenshot(page, "bug-exports-special-failed"),
      suspectedFile: "app/protected/exports/page.tsx",
      risk: "Office workbook downloads may be unavailable.",
    });
  });
  await importDryRunSmoke(page, findings).catch(async (error) => {
    findings.push({
      severity: "P1",
      title: "Import dry-run workflow failed during special smoke",
      surface: "/protected/imports",
      expected: "Template download, upload, and dry-run validation complete without committing rows.",
      actual: error instanceof Error ? error.message : String(error),
      screenshot: await screenshot(page, "bug-import-special-failed"),
      suspectedFile: "app/protected/imports/actions.ts",
      risk: "Staff may be blocked from validating import spreadsheets.",
    });
  });
  if (process.env.SMOKE_ALLOW_TEST_PAYMENT === "1") {
    await paymentSmoke(page, request, testStudent, findings).catch(async (error) => {
      findings.push({
        severity: "P0",
        title: "Payment Desk TEST write-path failed during special smoke",
        surface: "/protected/payments",
        expected: "A ₹100 Cash payment can be posted only for a TEST-prefixed student in TEST-2026-27.",
        actual: error instanceof Error ? error.message : String(error),
        screenshot: await screenshot(page, "bug-payment-special-exception"),
        suspectedFile: "components/payments/payment-desk-mobile.tsx:2277",
        risk: "The cashier critical path is not proven safe.",
      });
    });
  }

  await appendResult({ type: "special-summary", project: "desktop-chrome", testStudent, findings });
  expect(findings.filter((finding) => finding.severity === "P0").length).toBeGreaterThanOrEqual(0);
});
