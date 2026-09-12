import { describe, expect, it, beforeAll } from "vitest";
import fs from "node:fs";

import { sendAisensyCampaignMessage } from "@/modules/whatsapp/data/aisensy";
import {
  signDocumentUrl,
  storeNoticeDocument,
  parentFacingFilename,
} from "@/modules/whatsapp/data/document-store";
import { describeReceiptDocumentCampaign } from "@/modules/whatsapp/domain/campaign-bodies-v5";
import {
  describeFeeStatementCampaign,
  describeReversalCampaign,
} from "@/modules/whatsapp/domain/campaign-bodies-v5";
import { toWhatsappDestination } from "@/modules/whatsapp/domain/phone";
import { createAdminClient } from "@/platform/supabase/admin";

/**
 * The live end-to-end check for the document-carrying WhatsApp lane.
 *
 * It proves the four things a unit test structurally cannot:
 *
 *   1. The real PDF renderer produces bytes (fonts, logo, QR all resolve).
 *   2. The `parent-documents` bucket exists, accepts them, and signs them.
 *   3. **Meta can fetch that signed URL with no session** — the single
 *      assumption the whole design rests on, and the one that fails silently
 *      if the bucket is misconfigured.
 *   4. The three approved campaigns accept their exact parameter counts.
 *
 * It sends REAL WhatsApp messages, so it is inert unless asked:
 *
 *   SMOKE_WHATSAPP_TO=7976199548 \
 *     npx vitest run --config scripts/smoke/vitest.smoke.config.ts
 *
 * It never touches a student, a payment or a receipt. The ledger is not read
 * and nothing is written to `whatsapp_reminder_sends` — that table records what
 * a FAMILY was told, and a test row there would claim a parent was messaged and
 * would eat a day's uniqueness slot. The PDFs are rendered from literals under
 * a `SMOKE-` path in the bucket.
 */

/**
 * Load `.env.local` by hand.
 *
 * `dotenv` is not a dependency of this repo, and adding one so that a smoke
 * test can read a file is not a trade worth making. Next injects these
 * variables into the app; vitest does not.
 */
function loadEnvLocal(): void {
  let raw = "";
  try {
    raw = fs.readFileSync(".env.local", "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rest] = match;
    // Anything already exported wins, so a one-off override on the command
    // line is not silently replaced by the file.
    if (process.env[key]) continue;
    process.env[key] = rest.trim().replace(/^["']|["']$/g, "");
  }
}

loadEnvLocal();

const destinationRaw = process.env.SMOKE_WHATSAPP_TO ?? "";
const destination = toWhatsappDestination(destinationRaw);

const SESSION = "SMOKE";

/** A stable id, so re-running overwrites rather than littering the bucket. */
const SMOKE_ID = "smoke-document-lane";

describe.skipIf(!destination)("WhatsApp document lane, live", () => {
  let receiptPdf: Uint8Array;
  let statementPdf: Uint8Array;

  beforeAll(async () => {
    // Dynamic imports, exactly as the notices do them: a font or logo failure
    // surfaces here as a readable error instead of a module-load crash.
    const { renderReceiptPdf } = await import("@/modules/receipts/domain/receipt-pdf");
    const { renderFeeStatementPdf } = await import(
      "@/modules/students/domain/fee-statement-pdf"
    );

    receiptPdf = new Uint8Array(
      await renderReceiptPdf({
        receipt: SMOKE_RECEIPT,
        verifyUrl: "https://example.invalid/r/SMOKE-0001",
      }),
    );

    statementPdf = new Uint8Array(
      await renderFeeStatementPdf({
        students: [SMOKE_STATEMENT_STUDENT],
        sessionLabel: "2026-27",
        title: "Fee statement: SMOKE TEST",
      }),
    );
  });

  it("renders both parent documents to real PDF bytes", () => {
    // `%PDF` is the magic number. A renderer that half-failed tends to produce
    // an empty buffer rather than throwing, which would then upload happily and
    // arrive on a parent's phone as a file that will not open.
    expect(receiptPdf.byteLength).toBeGreaterThan(1000);
    expect(statementPdf.byteLength).toBeGreaterThan(1000);
    expect(Buffer.from(receiptPdf.subarray(0, 4)).toString()).toBe("%PDF");
    expect(Buffer.from(statementPdf.subarray(0, 4)).toString()).toBe("%PDF");
  });

  it("stores a document in the private bucket and signs it", async () => {
    const supabase = createAdminClient();
    const stored = await storeNoticeDocument({
      supabase,
      sessionLabel: SESSION,
      kind: "receipt",
      id: SMOKE_ID,
      pdf: receiptPdf,
    });

    expect(stored, "upload to parent-documents failed").not.toBeNull();
    expect(stored!.path).toBe(`SMOKE/receipt/${SMOKE_ID}.pdf`);
    expect(stored!.signedUrl).toContain("/parent-documents/");

    // The assumption the whole design rests on: Meta fetches this URL with no
    // headers and no session. If the bucket were public-read-denied or the
    // signature malformed, this is where it shows.
    const anonymous = await fetch(stored!.signedUrl);
    expect(anonymous.status, "Meta could not fetch the signed URL").toBe(200);
    expect(anonymous.headers.get("content-type")).toContain("application/pdf");

    // And the retry lane's half: a signature minted from the stored path alone,
    // which is all a failed row carries.
    //
    // NOT asserted as different from the first. Supabase signs deterministically
    // for the same path and TTL, so two signatures a moment apart are byte
    // identical — and that is fine: what a retry needs is a signature that
    // WORKS, not a novel one. Asserting inequality made this fail against a
    // perfectly good implementation.
    const reSigned = await signDocumentUrl({ supabase, path: stored!.path });
    expect(reSigned, "could not re-sign for a retry").toBeTruthy();
    const reFetched = await fetch(reSigned!);
    expect(reFetched.status, "a retry's fresh signature does not fetch").toBe(200);
  });

  it("sends the receipt notice with the receipt attached", async () => {
    const campaign = describeReceiptDocumentCampaign("hi");
    expect(campaign?.approved).toBe(true);

    const stored = await storeNoticeDocument({
      supabase: createAdminClient(),
      sessionLabel: SESSION,
      kind: "receipt",
      id: SMOKE_ID,
      pdf: receiptPdf,
    });
    expect(stored).not.toBeNull();

    const result = await sendAisensyCampaignMessage({
      campaignName: campaign!.campaignName,
      destination: destination!,
      userName: campaign!.sample.parentName,
      templateParams: campaign!.buildParams(campaign!.sample),
      source: "veerpatta-fees-app/smoke",
      media: {
        url: stored!.signedUrl,
        filename: parentFacingFilename({
          kind: "receipt",
          studentName: campaign!.sample.studentName,
          receiptNumber: campaign!.sample.receiptNumber,
        }),
      },
    });

    expect(result.ok ? null : result.error).toBeNull();
  });

  it("sends the fee statement with the statement attached", async () => {
    const campaign = describeFeeStatementCampaign("en");
    expect(campaign?.approved).toBe(true);

    const stored = await storeNoticeDocument({
      supabase: createAdminClient(),
      sessionLabel: SESSION,
      kind: "fee_statement",
      id: SMOKE_ID,
      pdf: statementPdf,
    });
    expect(stored).not.toBeNull();

    const result = await sendAisensyCampaignMessage({
      campaignName: campaign!.campaignName,
      destination: destination!,
      userName: campaign!.sample.parentName,
      templateParams: campaign!.buildParams(campaign!.sample),
      source: "veerpatta-fees-app/smoke",
      media: {
        url: stored!.signedUrl,
        filename: parentFacingFilename({
          kind: "fee_statement",
          studentName: campaign!.sample.studentName,
        }),
      },
    });

    expect(result.ok ? null : result.error).toBeNull();
  });

  it("sends the reversal notice, which carries no document", async () => {
    const campaign = describeReversalCampaign("en");
    expect(campaign?.approved).toBe(true);

    const result = await sendAisensyCampaignMessage({
      campaignName: campaign!.campaignName,
      destination: destination!,
      userName: campaign!.sample.parentName,
      templateParams: campaign!.buildParams(campaign!.sample),
      source: "veerpatta-fees-app/smoke",
    });

    expect(result.ok ? null : result.error).toBeNull();
  });
});

/* --------------------------------------------------------------- fixtures */

/**
 * A complete `ReceiptDetail`, invented rather than read.
 *
 * Every name here is visibly a test name and the admission number carries the
 * `TEST-` prefix the repo's rules require, so a PDF that escapes into a chat
 * cannot be mistaken for a real family's receipt.
 */
const SMOKE_RECEIPT = {
  id: "00000000-0000-4000-8000-000000000001",
  studentId: "00000000-0000-4000-8000-000000000002",
  receiptNumber: "SMOKE-0001",
  paymentDate: "2026-09-12",
  paymentMode: "cash" as const,
  totalAmount: 3000,
  referenceNumber: null,
  notes: null,
  receivedBy: "Smoke test",
  createdAt: "2026-09-12T12:00:00.000Z",
  createdByName: "Smoke test",
  studentFullName: "SMOKE TEST STUDENT",
  admissionNo: "TEST-SMOKE",
  fatherName: "SMOKE TEST PARENT",
  fatherPhone: null,
  motherPhone: null,
  familyGroupId: null,
  parentEmail: null,
  classLabel: "Class 2",
  sessionLabel: "2026-27",
  transportRouteLabel: "-",
  studentStatusLabel: "Old" as const,
  feeSummary: [],
  // The receipt renderer prints one row per allocation, so a receipt with no
  // breakdown is not a smaller receipt — it is a receipt of nothing.
  breakdown: [
    {
      paymentId: "00000000-0000-4000-8000-000000000003",
      installmentNo: 1,
      installmentLabel: "Installment 1",
      sessionLabel: "2026-27",
      dueDate: "2026-04-20",
      amount: 3000,
      originalAmount: 3000,
      adjustmentAmount: 0,
      effectiveAmount: 3000,
      notes: null,
      pendingBeforePosting: 12125,
      pendingAfterPosting: 9125,
    },
  ],
  totalDue: 12125,
  totalPaidBeforeReceipt: 0,
  totalPaidToDate: 3000,
  outstandingAfterReceipt: 9125,
  currentOutstanding: 9125,
  discountAmount: 0,
  lateFeeAmount: 0,
  lateFeeWaived: 0,
  installmentStatus: [],
  previousReceipts: [],
  conventionalDiscountAssignments: [],
  isVoided: false,
  reversedAmount: 0,
  voidReason: null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

const SMOKE_STATEMENT_STUDENT = {
  fullName: "SMOKE TEST STUDENT",
  admissionNo: "TEST-SMOKE",
  classLabel: "Class 2",
  fatherName: "SMOKE TEST PARENT",
  phones: [],
  summary: {
    rows: [],
    expectedGross: 12125,
    conventionalDiscount: 0,
    manualDiscount: 0,
    totalDiscount: 0,
    expectedNet: 12125,
    lateFeeCharged: 0,
    lateFeeWaiver: 0,
    discountCloseouts: 0,
    paid: 3000,
    pending: 9125,
  },
  installments: [
    {
      label: "Installment 1",
      dueDate: "2026-04-20",
      baseCharge: 3000,
      lateFee: 0,
      paid: 3000,
      pending: 0,
      status: "paid",
    },
    {
      label: "Installment 2",
      dueDate: "2026-07-20",
      baseCharge: 3041,
      lateFee: 0,
      paid: 0,
      pending: 3041,
      status: "pending",
    },
  ],
  receipts: [
    { number: "SMOKE-0001", date: "2026-09-12", modeLabel: "Cash", amount: 3000 },
  ],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;
