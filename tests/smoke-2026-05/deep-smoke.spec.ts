import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  expect,
  test,
  type APIRequestContext,
  type ConsoleMessage,
  type Page,
  type Response as PlaywrightResponse,
  type TestInfo,
} from "@playwright/test";
import * as XLSX from "xlsx";

type SmokeStudent = { id?: string; admissionNo?: string; fullName?: string };
type SmokeIds = {
  testSessionAvailable: boolean;
  testStudent?: SmokeStudent;
  fallbackStudent?: SmokeStudent;
  familyGroupId?: string;
  receiptId?: string;
  promotionRunId?: string;
};

const TEST_SESSION = "TEST-2026-27";
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

type CoverageRow = {
  route: string;
  project: string;
  ok: boolean;
  status: number | null;
  loadMs: number;
  screenshot: string;
  interactiveCount: number;
  consoleErrors: number;
  networkErrors: number;
  notes: string;
};

const topRoutes = [
  "/protected/dashboard",
  "/protected/students",
  "/protected/students/families",
  "/protected/fee-setup",
  "/protected/fee-setup/generate",
  "/protected/fee-setup/time-travel",
  "/protected/fee-structure",
  "/protected/payments",
  "/protected/transactions",
  "/protected/dues",
  "/protected/receipts",
  "/protected/ledger",
  "/protected/defaulters",
  "/protected/exports",
  "/protected/admin-tools",
  "/protected/admin-tools/session-health",
  "/protected/admin-tools/whatsapp-templates",
  "/protected/admin-tools/activity",
  "/protected/admin-tools/promotion",
] as const;

const adminRoutes = [
  "/protected/staff",
  "/protected/settings",
  "/protected/master-data",
  "/protected/finance-controls",
  "/protected/imports",
  "/protected/setup",
  "/protected/reports",
  "/protected/password",
  "/protected/access-denied",
  "/protected/advanced",
  "/protected/collections",
] as const;

const publicRoutes = ["/", "/auth/login", "/auth/confirm"] as const;
const exportTypes = [
  "all-students",
  "conventional-discount-students",
  "class-wise-dues",
  "defaulters",
  "receipt-register",
  "ai-context-bundle",
] as const;

function withSession(route: string) {
  if (!route.startsWith("/protected")) return route;
  const separator = route.includes("?") ? "&" : "?";
  return `${route}${separator}session=${encodeURIComponent(TEST_SESSION)}`;
}

function slug(value: string) {
  return value.replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 90);
}

function relReportPath(absPath: string) {
  return `./${path.relative(reportRoot, absPath).replace(/\\/g, "/")}`;
}

async function ensureDirs() {
  await mkdir(screenshotDir, { recursive: true });
  await mkdir(exportDir, { recursive: true });
}

async function appendResult(payload: unknown) {
  await appendFile(resultsPath, `${JSON.stringify(payload)}\n`, "utf8");
}

async function screenshot(page: Page, name: string) {
  const filePath = path.join(screenshotDir, `${slug(name)}.png`);
  try {
    await page.screenshot({ path: filePath, fullPage: true, timeout: 45_000 });
  } catch {
    try {
      await page.screenshot({ path: filePath, fullPage: false, timeout: 30_000 });
    } catch {
      return "(screenshot failed)";
    }
  }
  return relReportPath(filePath);
}

async function collectPageHealth(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const bodyText = document.body?.innerText ?? "";
    const interactive = Array.from(document.querySelectorAll('a[href],button,input,select,textarea,summary,[role="button"],[role="tab"],[role="option"]')).filter((element) => {
      const rect = (element as HTMLElement).getBoundingClientRect();
      const style = window.getComputedStyle(element as HTMLElement);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    });
    const brokenImages = Array.from(document.images).filter((img) => !img.complete || img.naturalWidth === 0);
    const buttonsWithoutNames = Array.from(document.querySelectorAll("button")).filter((button) => {
      const label = button.getAttribute("aria-label") || button.getAttribute("title") || button.textContent?.trim() || "";
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && !label;
    });
    return {
      title: document.title,
      bodyText: bodyText.slice(0, 1200),
      interactiveCount: interactive.length,
      brokenImages: brokenImages.length,
      buttonsWithoutNames: buttonsWithoutNames.length,
      horizontalOverflow: root.scrollWidth > root.clientWidth + 2,
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      hasFrameworkOverlay: bodyText.includes("Unhandled Runtime Error") || bodyText.includes("Application error") || bodyText.includes("Hydration failed"),
    };
  });
}

async function exerciseSafeInteractions(page: Page) {
  let count = 0;
  const unsafe = /delete|remove|save|create|add student|commit|publish|promot|refund|day close|close due|adjust|correct|reconcile|post|collect|pay now|approve|import valid|upload file|run promotion|apply/i;
  const safe = /search|filter|clear|show|hide|view|print|copy|refresh|expand|collapse|download|back|cancel|more details|previous uploads|history/i;

  for (const selector of ["summary", '[role="tab"]', "button", "a[href]"]) {
    const locators = page.locator(selector);
    const total = Math.min(await locators.count(), 10);
    for (let index = 0; index < total; index += 1) {
      const item = locators.nth(index);
      if (!(await item.isVisible().catch(() => false))) continue;
      const text = ((await item.innerText().catch(() => "")) || (await item.getAttribute("aria-label").catch(() => "")) || "").trim();
      if (!text || unsafe.test(text) || !safe.test(text)) continue;
      try {
        await item.hover({ timeout: 1500 });
        await item.click({ timeout: 2500 });
        await page.waitForTimeout(250);
        count += 1;
        if (/back/i.test(text)) await page.goBack({ waitUntil: "networkidle", timeout: 10_000 }).catch(() => null);
      } catch {
        // Keep broad smoke moving; page-level failures are logged separately.
      }
    }
  }

  const searchInputs = page.locator('input[type="search"], input[name*="query" i], input[name*="search" i], input[placeholder*="search" i], input[placeholder*="Name or SR" i]');
  const totalInputs = Math.min(await searchInputs.count(), 3);
  for (let index = 0; index < totalInputs; index += 1) {
    const input = searchInputs.nth(index);
    if (!(await input.isVisible().catch(() => false))) continue;
    try {
      await input.fill("ZZZZZZ O'Brien 😀 اختبار");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(400);
      await input.fill("");
      count += 1;
    } catch {
      // Non-fatal exploratory interaction.
    }
  }

  for (let index = 0; index < 10; index += 1) await page.keyboard.press("Tab").catch(() => null);
  await page.keyboard.press("Escape").catch(() => null);
  return count;
}

async function auditRoute(page: Page, testInfo: TestInfo, route: string, findings: Finding[], coverage: CoverageRow[], options: { expectedRedirect?: RegExp; allow404?: boolean } = {}) {
  const consoleErrors: string[] = [];
  const networkErrors: string[] = [];
  const pageErrors: string[] = [];

  const onConsole = (message: ConsoleMessage) => {
    if (message.type() === "error" || /hydration|react.*key|act\(/i.test(message.text())) consoleErrors.push(message.text());
  };
  const onPageError = (error: Error) => pageErrors.push(error.message);
  const onResponse = (response: PlaywrightResponse) => {
    if (response.status() >= 400) networkErrors.push(`${response.status()} ${response.url()}`);
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);

  const startedAt = Date.now();
  let status: number | null = null;
  let ok = true;
  let notes = "";
  try {
    const response = await page.goto(route.startsWith("/protected") ? withSession(route) : route, { waitUntil: "domcontentloaded", timeout: 45_000 });
    status = response?.status() ?? null;
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {
      notes = "networkidle timed out; DOM was still captured";
    });
  } catch (error) {
    ok = false;
    notes = error instanceof Error ? error.message : String(error);
  }

  const loadMs = Date.now() - startedAt;
  const shot = await screenshot(page, `${testInfo.project.name}-${route}`);
  const health = await collectPageHealth(page).catch(() => ({
    interactiveCount: 0,
    brokenImages: 0,
    buttonsWithoutNames: 0,
    horizontalOverflow: false,
    hasFrameworkOverlay: false,
    bodyText: "",
    title: "",
    scrollWidth: 0,
    clientWidth: 0,
  }));
  const interacted = await exerciseSafeInteractions(page).catch(() => 0);

  if (options.expectedRedirect && !options.expectedRedirect.test(page.url())) {
    findings.push({
      severity: "P1",
      title: `Legacy alias did not redirect as expected: ${route}`,
      surface: route,
      expected: `URL should match ${options.expectedRedirect}.`,
      actual: `Landed on ${page.url()}.`,
      screenshot: shot,
      risk: "Staff may bookmark or use stale routes that no longer land in the intended workspace.",
    });
  }
  if (!options.allow404 && status && status >= 500) {
    findings.push({
      severity: "P0",
      title: `Server error on ${route}`,
      surface: route,
      expected: "Protected route should render without a 500.",
      actual: `HTTP ${status}.`,
      screenshot: shot,
      consoleOrNetwork: networkErrors.slice(0, 5).join("\n"),
      risk: "Critical office navigation can be blocked for staff.",
    });
  }
  if (loadMs > 5_000) {
    findings.push({
      severity: "P3",
      title: `Slow initial render on ${route}`,
      surface: route,
      expected: "Initial render under 5s on broadband.",
      actual: `${loadMs}ms to DOM/network-idle capture.`,
      screenshot: shot,
      risk: "Office staff experience visible waiting during daily work.",
    });
  }
  if (consoleErrors.length || pageErrors.length) {
    findings.push({
      severity: "P2",
      title: `Console/runtime errors on ${route}`,
      surface: route,
      expected: "No console errors, page errors, hydration warnings, or React key warnings.",
      actual: [...consoleErrors, ...pageErrors].slice(0, 6).join("\n"),
      screenshot: shot,
      consoleOrNetwork: [...consoleErrors, ...pageErrors].slice(0, 6).join("\n"),
      risk: "Client-side errors can hide broken controls or stale state.",
    });
  }
  if (health.brokenImages > 0) {
    findings.push({
      severity: "P2",
      title: `Broken image assets on ${route}`,
      surface: route,
      expected: "All image assets should load.",
      actual: `${health.brokenImages} broken image(s).`,
      screenshot: shot,
      risk: "Staff may see broken branding or missing student media.",
    });
  }
  if (health.buttonsWithoutNames > 0) {
    findings.push({
      severity: "P3",
      title: `Icon buttons without accessible names on ${route}`,
      surface: route,
      expected: "Every visible button should have text, title, or aria-label.",
      actual: `${health.buttonsWithoutNames} visible button(s) had no accessible name.`,
      screenshot: shot,
      risk: "Keyboard and screen-reader users cannot identify the control.",
    });
  }
  if (health.horizontalOverflow && testInfo.project.name !== "desktop-chrome") {
    findings.push({
      severity: "P2",
      title: `Horizontal overflow on ${testInfo.project.name}: ${route}`,
      surface: route,
      expected: "No horizontal scrolling on mobile/tablet.",
      actual: `scrollWidth ${health.scrollWidth}, clientWidth ${health.clientWidth}.`,
      screenshot: shot,
      suspectedFile: "components/admin/mobile-bottom-nav.tsx",
      risk: "Mobile cashier/admin workflows become harder to use.",
    });
  }
  if (health.hasFrameworkOverlay) {
    findings.push({
      severity: "P0",
      title: `Framework error overlay or application error on ${route}`,
      surface: route,
      expected: "Route should render the app, not a framework error surface.",
      actual: health.bodyText,
      screenshot: shot,
      risk: "The route is unusable.",
    });
  }

  coverage.push({
    route,
    project: testInfo.project.name,
    ok,
    status,
    loadMs,
    screenshot: shot,
    interactiveCount: health.interactiveCount + interacted,
    consoleErrors: consoleErrors.length + pageErrors.length,
    networkErrors: networkErrors.length,
    notes,
  });

  page.off("console", onConsole);
  page.off("pageerror", onPageError);
  page.off("response", onResponse);
}

async function discoverIds(request: APIRequestContext, page: Page) {
  const ids: SmokeIds = { testSessionAvailable: false };
  await page.goto(withSession("/protected/dashboard"), { waitUntil: "networkidle" });
  ids.testSessionAvailable = (await page.getByText(TEST_SESSION).count().catch(() => 0)) > 0;

  const studentsResponse = await request.get(`/protected/students/index?purpose=paymentDesk&session=${encodeURIComponent(TEST_SESSION)}`);
  if (studentsResponse.ok()) {
    const payload = await studentsResponse.json();
    const students: SmokeStudent[] = Array.isArray(payload.students) ? payload.students : [];
    ids.testStudent =
      students.find((student) => String(student.admissionNo ?? "").toUpperCase().startsWith("TEST-")) ??
      students.find((student) => /TEST/i.test(`${student.admissionNo ?? ""} ${student.fullName ?? ""}`));
    ids.fallbackStudent = ids.testStudent ?? students[0];
  }

  if (ids.fallbackStudent?.id) {
    await page.goto(withSession(`/protected/students/${ids.fallbackStudent.id}`), { waitUntil: "networkidle" });
    const familyHref = await page.locator('a[href*="/protected/students/family/"]').first().getAttribute("href").catch(() => null);
    ids.familyGroupId = familyHref?.match(/\/protected\/students\/family\/([^/?#]+)/)?.[1];
  }

  const receiptsResponse = await request.get(`/protected/transactions/data?view=receipts&session=${encodeURIComponent(TEST_SESSION)}&query=SVP`);
  if (receiptsResponse.ok()) {
    const payload = await receiptsResponse.json();
    const rows: Array<Record<string, unknown>> = Array.isArray(payload.rows) ? payload.rows : [];
    const row = rows.find((candidate) => /SVP/i.test(String(candidate.receiptNumber ?? ""))) ?? rows[0];
    ids.receiptId = (row?.receiptId ?? row?.id) as string | undefined;
  }

  await page.goto(withSession("/protected/admin-tools/promotion"), { waitUntil: "networkidle" });
  const promotionHref = await page.locator('a[href*="/protected/admin-tools/promotion/"]').first().getAttribute("href").catch(() => null);
  ids.promotionRunId = promotionHref?.match(/\/protected\/admin-tools\/promotion\/([^/?#]+)/)?.[1];
  return ids;
}

async function runApiSmoke(request: APIRequestContext, studentId: string | undefined, findings: Finding[]) {
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
        risk: "Client-side data loaders or smoke probes may fail against the live deployment.",
      });
    }
  }
}

async function runExports(page: Page, findings: Finding[]) {
  await page.goto(withSession("/protected/exports"), { waitUntil: "networkidle" });
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
        risk: "Office cannot download a required workbook.",
      });
      continue;
    }
    const downloadPromise = page.waitForEvent("download", { timeout: 45_000 });
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
        risk: "Office staff may receive unusable exports.",
      });
    }
  }
}

async function runImportDryRun(page: Page, findings: Finding[]) {
  await page.goto(withSession("/protected/imports?mode=add"), { waitUntil: "networkidle" });
  const templateLink = page.getByRole("link", { name: /download add template/i });
  if (!(await templateLink.count())) {
    findings.push({
      severity: "P1",
      title: "Import template download link missing",
      surface: "/protected/imports",
      expected: "Add-template download is visible.",
      actual: "No Add Template link found.",
      screenshot: await screenshot(page, "bug-import-template-missing"),
      risk: "Staff cannot start the import workflow from the UI.",
    });
    return;
  }

  const templateDownloadPromise = page.waitForEvent("download", { timeout: 45_000 });
  await templateLink.click();
  const templateDownload = await templateDownloadPromise;
  const templatePath = path.resolve("tests/smoke-2026-05/import-template.xlsx");
  await templateDownload.saveAs(templatePath);
  const workbook = XLSX.readFile(templatePath);
  const listRows = workbook.Sheets["Current Lists"] ? (XLSX.utils.sheet_to_json(workbook.Sheets["Current Lists"], { header: 1 }) as unknown[][]) : [];
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
  await Promise.all([page.waitForURL(/\/protected\/imports\?/, { timeout: 45_000 }), page.getByRole("button", { name: /upload file/i }).click()]);
  await page.waitForLoadState("networkidle");
  await screenshot(page, "import-after-upload");
  const dryRunButton = page.getByRole("button", { name: /check rows|dry-run|validate/i }).first();
  if (await dryRunButton.count()) {
    await Promise.all([page.waitForURL(/\/protected\/imports\?/, { timeout: 45_000 }), dryRunButton.click()]);
    await page.waitForLoadState("networkidle");
    await screenshot(page, "import-after-dry-run");
  } else {
    await screenshot(page, "import-no-dry-run-button");
  }
}

async function runPaymentWritePath(page: Page, request: APIRequestContext, testStudent: SmokeStudent | null, findings: Finding[]) {
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

  await page.goto(withSession(`/protected/payments?studentId=${testStudent.id}`), { waitUntil: "networkidle" });
  await page.getByLabel(/amount received/i).first().fill("100");
  await page.getByRole("button", { name: /^upi$/i }).first().click().catch(() => null);
  await page.getByRole("button", { name: /review receipt/i }).click();
  await page.waitForTimeout(800);
  await screenshot(page, "payment-preview-upi-before-cash-post");
  await page.keyboard.press("Escape").catch(() => null);
  await page.getByRole("button", { name: /^cash$/i }).first().click().catch(() => null);
  const before = await request.get(`/protected/transactions/data?view=receipts&session=${encodeURIComponent(TEST_SESSION)}&query=${encodeURIComponent(testStudent.admissionNo ?? "")}`);
  const beforePayload = before.ok() ? await before.json() : { rows: [] };
  const beforeCount = Array.isArray(beforePayload.rows) ? beforePayload.rows.length : 0;
  await page.getByRole("button", { name: /review receipt/i }).click();
  await page.waitForLoadState("networkidle").catch(() => null);
  await page.waitForTimeout(3000);
  const paymentShot = await screenshot(page, "payment-after-cash-post");
  const pageText = await page.locator("body").innerText().catch(() => "");
  if (!/SVP/i.test(pageText)) {
    findings.push({
      severity: "P0",
      title: "Cash payment post did not surface an SVP receipt",
      surface: "/protected/payments",
      expected: "Posting a ₹100 Cash payment on a TEST student shows a non-null SVP receipt.",
      actual: pageText.slice(0, 800),
      screenshot: paymentShot,
      risk: "Cashier cannot trust the posting/receipt confirmation path.",
    });
  }
  const after = await request.get(`/protected/transactions/data?view=receipts&session=${encodeURIComponent(TEST_SESSION)}&query=${encodeURIComponent(testStudent.admissionNo ?? "")}`);
  const afterPayload = after.ok() ? await after.json() : { rows: [] };
  const afterRows = Array.isArray(afterPayload.rows) ? afterPayload.rows : [];
  if (afterRows.length <= beforeCount) {
    findings.push({
      severity: "P0",
      title: "Posted payment did not appear in transactions",
      surface: "/protected/transactions",
      expected: "The new TEST payment appears in transactions without manual database work.",
      actual: `Rows before=${beforeCount}, after=${afterRows.length}.`,
      screenshot: paymentShot,
      risk: "The append-only ledger may not reflect a cashier post.",
    });
  }
}

test.describe.configure({ mode: "serial" });

test("deep route and workflow smoke", async ({ page, request }, testInfo) => {
  await ensureDirs();
  const findings: Finding[] = [];
  const coverage: CoverageRow[] = [];
  const ids = await discoverIds(request, page);

  if (!ids.testSessionAvailable) {
    findings.push({
      severity: "P0",
      title: "Test session missing from session switcher",
      surface: "/protected/dashboard",
      expected: "TEST-2026-27 exists and is visible in the session switcher/topbar.",
      actual: "TEST-2026-27 was not visible after navigating with the session query parameter.",
      screenshot: await screenshot(page, "bug-test-session-missing"),
      suspectedFile: "lib/session/switcher.ts",
      risk: "All write-path smoke must stop to avoid mutating live 2026-27 data.",
    });
  }

  const dynamicRoutes = [
    ids.fallbackStudent?.id ? `/protected/students/${ids.fallbackStudent.id}` : null,
    ids.fallbackStudent?.id ? `/protected/students/${ids.fallbackStudent.id}/edit` : null,
    ids.fallbackStudent?.id ? `/protected/students/${ids.fallbackStudent.id}/statement` : null,
    ids.familyGroupId ? `/protected/students/family/${ids.familyGroupId}/pay` : null,
    ids.familyGroupId ? `/protected/students/family/${ids.familyGroupId}/receipts` : null,
    ids.familyGroupId ? `/protected/students/family/${ids.familyGroupId}/statement` : null,
    ids.receiptId ? `/protected/receipts/${ids.receiptId}` : null,
    ids.fallbackStudent?.id ? `/protected/reports/ledger/${ids.fallbackStudent.id}/print` : null,
    ids.promotionRunId ? `/protected/admin-tools/promotion/${ids.promotionRunId}` : "/protected/admin-tools/promotion/smoke-missing-run",
    "/protected/students/9999999",
  ].filter(Boolean) as string[];

  const desktop = testInfo.project.name === "desktop-chrome";
  const routes = desktop
    ? [...publicRoutes, ...topRoutes, ...adminRoutes, "/protected/students/new", ...dynamicRoutes]
    : ["/protected/dashboard", "/protected/students", "/protected/fee-setup", "/protected/payments", "/protected/transactions", "/protected/defaulters", "/protected/exports", "/protected/admin-tools"];

  for (const route of routes) {
    await auditRoute(page, testInfo, route, findings, coverage, {
      allow404: route.includes("9999999") || route.includes("smoke-missing-run") || route === "/auth/confirm",
      expectedRedirect:
        route === "/protected/advanced"
          ? /\/protected\/admin-tools/
          : route === "/protected/collections"
            ? /\/protected\/payments/
            : route === "/protected/dues"
              ? /\/protected\/transactions/
              : undefined,
    });
  }

  await appendResult({
    type: "route-summary",
    project: testInfo.project.name,
    discovered: ids,
    coverage,
    findings,
  });

  if (desktop) {
    await runApiSmoke(request, ids.fallbackStudent?.id, findings);
    if (ids.testSessionAvailable) {
      await runExports(page, findings);
      await runImportDryRun(page, findings).catch(async (error) => {
        findings.push({
          severity: "P1",
          title: "Import dry-run workflow failed during smoke",
          surface: "/protected/imports",
          expected: "Template download, upload, and dry-run validation complete without committing rows.",
          actual: error instanceof Error ? error.message : String(error),
          screenshot: await screenshot(page, "bug-import-dry-run-failed"),
          risk: "Staff may be blocked from validating import spreadsheets.",
        });
      });
      if (process.env.SMOKE_ALLOW_TEST_PAYMENT === "1") {
        await runPaymentWritePath(page, request, ids.testStudent ?? null, findings).catch(async (error) => {
          findings.push({
            severity: "P0",
            title: "Payment Desk TEST write-path failed during smoke",
            surface: "/protected/payments",
            expected: "A ₹100 Cash payment can be posted only for a TEST-prefixed student in TEST-2026-27.",
            actual: error instanceof Error ? error.message : String(error),
            screenshot: await screenshot(page, "bug-payment-write-path-exception"),
            risk: "The cashier critical path is not proven safe.",
          });
        });
      }
    }
  } else {
    const bottomNav = await page.locator("nav").filter({ hasText: /home|students|collect|transactions/i }).count().catch(() => 0);
    if (bottomNav === 0) {
      findings.push({
        severity: "P2",
        title: `Mobile/tablet bottom navigation not detected on ${testInfo.project.name}`,
        surface: "/protected",
        expected: "Mobile primary/bottom navigation is present and tappable.",
        actual: "No nav element containing expected mobile labels was detected.",
        screenshot: await screenshot(page, `bug-bottom-nav-${testInfo.project.name}`),
        suspectedFile: "components/admin/mobile-bottom-nav.tsx",
        risk: "Mobile staff may lose core navigation.",
      });
    }
  }

  await appendResult({ type: "summary", project: testInfo.project.name, discovered: ids, coverage, findings });
  expect(coverage.length).toBeGreaterThan(0);
});
