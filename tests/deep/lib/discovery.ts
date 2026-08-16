import type { APIRequestContext, Page } from "@playwright/test";

import { TEST_SESSION, withSession } from "./identity";

/**
 * The subjects a run works on, discovered from the app's own endpoints.
 *
 * Nothing is hard-coded to a database id. The ids move between environments —
 * the local dev server and the Vercel deployment read the same Supabase today,
 * but that is a coincidence of configuration, not a contract — so every id is
 * looked up through a URL a staff member could also visit.
 *
 * The named scenarios come from `docs/qa/smoke-test-data.md`. They are SR
 * numbers, not ids, and each was chosen because it is the only student in the
 * session that exercises a particular rule. `TEST-CL10-002` is the one that
 * matters most: ₹0 fees and a ₹1,000 late fee, so it must be `paid`, must not
 * be a defaulter, and must still show ₹1,000 owed. Three separate bugs have
 * lived in that gap.
 */

export type DiscoveredStudent = {
  id: string;
  admissionNo: string;
  fullName: string;
};

/** SR numbers with a documented, load-bearing scenario. */
export const SCENARIO_STUDENTS = {
  /** Left, still owes ₹55,500, has an EMI plan. */
  leftOwingWithEmi: "TEST-12S-003",
  /** Inactive, owes ₹40,000 — posting and editing refused, record visible. */
  inactiveOwing: "TEST-11C-002",
  /** Graduated, nothing owed. */
  graduatedClear: "TEST-CL2-004",
  /** Never paid, ₹39,500 due, 2 overdue — and all 25 info fields filled. */
  neverPaidFullInfo: "TEST-CL7-002",
  /** Part-paid: ₹13,750 of ₹50,500. */
  partlyPaid: "TEST-11S-002",
  /** Paid more than due — credit on file. */
  inCredit: "TEST-NUR-001",
  /** RTE, ₹0 due — the fully-clear case. */
  rteZeroDue: "TEST-NUR-004",
  /** ₹0 fees + ₹1,000 late fee. Must read `paid`, must NOT be a defaulter. */
  lateFeeOnly: "TEST-CL10-002",
  /** The second late-fee-only student, kept for the export subtotal check. */
  lateFeeOnlyTwo: "TEST-CL8-004",
  /** Two late fees accrued on top of ₹6,125 of fees. */
  twoLateFees: "TEST-JKG-003",
  /** Partially waived late fee, on an EMI plan. */
  partialWaiverOnEmi: "TEST-CL4-002",
  /** ₹15,000 tuition override — the partial-write regression student. */
  tuitionOverride: "TEST-CL6-004",
  /** Staff Child + 3rd Child: the max-2 rule, lowest candidate wins. */
  twoDiscountPolicies: "TEST-CL7-003",
  /** No phone at all — share and call must be hidden, not broken. */
  noPhone: "TEST-NUR-005",
} as const;

export type ScenarioKey = keyof typeof SCENARIO_STUDENTS;

export type DiscoveredSubjects = {
  session: string;
  testSessionAvailable: boolean;
  /** Every TEST- student the index returned, by admission number. */
  byAdmissionNo: Map<string, DiscoveredStudent>;
  /** The documented scenarios that were actually found. */
  scenarios: Partial<Record<ScenarioKey, DiscoveredStudent>>;
  missingScenarios: ScenarioKey[];
  /** A safe default write subject: TEST-prefixed, present, has dues. */
  writeSubject: DiscoveredStudent | null;
  familyGroupId: string | null;
  receiptId: string | null;
  receiptNumber: string | null;
  promotionRunId: string | null;
  classIds: string[];
};

type IndexPayload = {
  students?: Array<{ id?: string; admissionNo?: string; fullName?: string }>;
};

export async function discoverSubjects(
  request: APIRequestContext,
  page: Page,
): Promise<DiscoveredSubjects> {
  const subjects: DiscoveredSubjects = {
    session: TEST_SESSION,
    testSessionAvailable: false,
    byAdmissionNo: new Map(),
    scenarios: {},
    missingScenarios: [],
    writeSubject: null,
    familyGroupId: null,
    receiptId: null,
    receiptNumber: null,
    promotionRunId: null,
    classIds: [],
  };

  await page.goto(withSession("/protected/dashboard"), { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => null);
  subjects.testSessionAvailable =
    (await page.getByText(TEST_SESSION).count().catch(() => 0)) > 0;

  const indexResponse = await request.get(
    `/protected/students/index?purpose=paymentDesk&session=${encodeURIComponent(TEST_SESSION)}`,
  );

  if (indexResponse.ok()) {
    const payload = (await indexResponse.json()) as IndexPayload;
    for (const row of payload.students ?? []) {
      if (!row.id || !row.admissionNo) continue;
      subjects.byAdmissionNo.set(row.admissionNo.toUpperCase(), {
        id: row.id,
        admissionNo: row.admissionNo,
        fullName: row.fullName ?? "",
      });
    }
  }

  for (const [key, admissionNo] of Object.entries(SCENARIO_STUDENTS) as [
    ScenarioKey,
    string,
  ][]) {
    const found = subjects.byAdmissionNo.get(admissionNo.toUpperCase());
    if (found) subjects.scenarios[key] = found;
    else subjects.missingScenarios.push(key);
  }

  // The write subject is deliberately the never-paid student with real dues:
  // a ₹100 payment against them allocates cleanly and leaves the other
  // scenarios' documented balances untouched.
  subjects.writeSubject =
    subjects.scenarios.neverPaidFullInfo ??
    subjects.scenarios.partlyPaid ??
    [...subjects.byAdmissionNo.values()].find((student) =>
      student.admissionNo.toUpperCase().startsWith("TEST-"),
    ) ??
    null;

  const anchor = subjects.writeSubject ?? [...subjects.byAdmissionNo.values()][0] ?? null;
  if (anchor) {
    await page.goto(withSession(`/protected/students/${anchor.id}`), {
      waitUntil: "domcontentloaded",
    });
    const familyHref = await page
      .locator('a[href*="/protected/students/family/"]')
      .first()
      .getAttribute("href")
      .catch(() => null);
    subjects.familyGroupId =
      familyHref?.match(/\/protected\/students\/family\/([^/?#]+)/)?.[1] ?? null;
  }

  const receiptsResponse = await request.get(
    `/protected/transactions/data?view=receipts&session=${encodeURIComponent(TEST_SESSION)}&query=SVP`,
  );
  if (receiptsResponse.ok()) {
    const payload = (await receiptsResponse.json()) as { rows?: Array<Record<string, unknown>> };
    const rows = payload.rows ?? [];
    const row =
      rows.find((candidate) => /SVP/i.test(String(candidate.receiptNumber ?? ""))) ?? rows[0];
    subjects.receiptId = (row?.receiptId ?? row?.id ?? null) as string | null;
    subjects.receiptNumber = (row?.receiptNumber ?? null) as string | null;
  }

  await page.goto(withSession("/protected/admin-tools/promotion"), {
    waitUntil: "domcontentloaded",
  });
  const promotionHref = await page
    .locator('a[href*="/protected/admin-tools/promotion/"]')
    .first()
    .getAttribute("href")
    .catch(() => null);
  subjects.promotionRunId =
    promotionHref?.match(/\/protected\/admin-tools\/promotion\/([^/?#]+)/)?.[1] ?? null;

  await page.goto(withSession("/protected/students"), { waitUntil: "domcontentloaded" });
  subjects.classIds = await page
    .locator('select[name="classId"] option[value]')
    .evaluateAll((options) =>
      options
        .map((option) => (option as HTMLOptionElement).value)
        .filter((value) => /^[0-9a-f-]{36}$/i.test(value)),
    )
    .catch(() => []);

  return subjects;
}

/** Serialises to JSON for the run manifest; a Map does not survive it. */
export function serialiseSubjects(subjects: DiscoveredSubjects) {
  return {
    ...subjects,
    byAdmissionNo: Object.fromEntries(subjects.byAdmissionNo),
  };
}
