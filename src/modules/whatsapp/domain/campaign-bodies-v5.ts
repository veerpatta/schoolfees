import { formatRupeesPlain } from "@/platform/helpers/currency";
import { shortClassLabel, type NoticeLanguage } from "@/modules/whatsapp/domain/campaigns";
import {
  RECEIPT_CAMPAIGNS,
  type ReceiptCampaignDescriptor,
  type ReceiptNoticeValues,
} from "@/modules/whatsapp/domain/campaign-bodies-v3";

/**
 * The three notices that carry a document, or announce that money moved
 * backwards.
 *
 * Submitted to Meta on 2026-09-12, all six approved the same day, and all six
 * AiSensy API campaigns created Live beside them. `approved` means BOTH — the
 * template is Live in Meta AND a campaign of that exact name exists — because a
 * descriptor that lies about either sends to a campaign that does not exist and
 * gets `400 Campaign does not exist.` back, which costs nothing and tells the
 * office nothing either.
 *
 * Same rule as `campaign-bodies-v3`: nothing in `src/app` or `src/modules` UI
 * may import this file. Only `data/` sends these, on the server, and no screen
 * previews them — so ten more bodies in two languages would be provably
 * unreachable bytes on every load of `/protected/reminders`, against a ceiling
 * that only ratchets down.
 *
 * `headerKind` is the one new idea here. A WhatsApp header is a SEPARATE
 * template component with its own media parameter, so a document header does
 * NOT consume a body slot — `templateParams` stays exactly as long as
 * `slotOrder`, which is the count AiSensy enforces exactly. Absent means
 * body-only, which is every one of the 34 templates that came before.
 */

/** A template component above the body. Only documents, so far. */
export type NoticeHeaderKind = "document";

/* ----------------------------------------------------------- receipt (v5) */

/**
 * The receipt notice, with the receipt attached.
 *
 * Built BY MAPPING the approved `_v3` descriptors rather than by retyping them,
 * and that is the whole fallback contract expressed as code: `buildParams` and
 * `renderPreview` are the same function references, so the two can never drift.
 * If the PDF cannot be rendered or uploaded, `sendReceiptNotice` falls back to
 * the `_v3` campaign with the SAME seven parameters and simply loses the
 * attachment. A document failure must degrade the message, never suppress it.
 *
 * It is also why the body was not reworded to mention the attachment: a
 * fallback that says "your receipt is attached" with nothing attached is worse
 * than one that never mentions it.
 */
export type ReceiptDocumentCampaignDescriptor = ReceiptCampaignDescriptor & {
  headerKind: NoticeHeaderKind;
  /** The body-only campaign to fall back to when there is no document. */
  fallbackCampaignName: string;
};

export const RECEIPT_DOCUMENT_CAMPAIGNS: readonly ReceiptDocumentCampaignDescriptor[] =
  RECEIPT_CAMPAIGNS.map((body) => ({
    ...body,
    campaignName: body.campaignName.replace(/_v3$/, "_v5"),
    fallbackCampaignName: body.campaignName,
    headerKind: "document" as const,
    // Approved by Meta and Live in AiSensy on 2026-09-12.
    approved: true,
  }));

/** The document-carrying receipt notice for a language, approved or not. */
export function describeReceiptDocumentCampaign(
  language: NoticeLanguage,
): ReceiptDocumentCampaignDescriptor | null {
  return RECEIPT_DOCUMENT_CAMPAIGNS.find((entry) => entry.language === language) ?? null;
}

export type { ReceiptNoticeValues };

/* ------------------------------------------------------ fee statement (v1) */

/**
 * "Here is everything, in one page."
 *
 * The answer to a parent who asks what they have paid and what is left — which
 * the office currently answers by reading four installment rows down a phone.
 * Five slots and a PDF: the body carries only what a parent needs to recognise
 * the message, and the document carries the detail.
 *
 * Sent on a staff tap, never automatically. It inherits the DAY index for free
 * (`receipt_id is null` since `20260912165421`), so a double-tap, or two staff
 * in two tabs, produces one statement per family per day.
 */
export const FEE_STATEMENT_SLOT_SKELETON = [
  "parentName",
  "studentName",
  "studentClass",
  "sessionLabel",
  "pendingAmount",
] as const;

export type FeeStatementNoticeValues = {
  parentName: string;
  studentName: string;
  studentClass: string;
  /** `2026-27`, printed verbatim. */
  sessionLabel: string;
  /** Fees pending. NOT the late fee — a late fee is not a fee. */
  pendingAmount: number;
};

function feeStatementParams(v: FeeStatementNoticeValues): string[] {
  return [
    v.parentName,
    v.studentName,
    shortClassLabel(v.studentClass),
    v.sessionLabel,
    // Zero is printed, not suppressed: "Fees pending: Rs. 0" beside an attached
    // statement is a complete and welcome answer.
    formatRupeesPlain(Math.max(0, Math.round(Number(v.pendingAmount) || 0))),
  ];
}

function feeStatementBodyEn(v: FeeStatementNoticeValues): string {
  const [p, s, c, session, pending] = feeStatementParams(v);
  return [
    "*Fee Statement — Shri Veer Patta Sr. Sec. School*",
    "",
    `Dear ${p},`,
    "",
    `Student: ${s}`,
    `Class: ${c}`,
    `Session: ${session}`,
    `Fees pending: Rs. ${pending}`, // @allow-raw-money-format: verbatim from the body submitted to Meta
    "",
    "Your full fee statement is attached. It lists every installment, what has been received, and what remains.",
    "",
    "For any correction, call the office on 9352205884.",
  ].join("\n");
}

function feeStatementBodyHi(v: FeeStatementNoticeValues): string {
  const [p, s, c, session, pending] = feeStatementParams(v);
  return [
    "*शुल्क विवरण — श्री वीर पत्ता सी. सै. स्कूल*",
    "",
    `प्रिय ${p},`,
    "",
    `विद्यार्थी: ${s}`,
    `कक्षा: ${c}`,
    `सत्र: ${session}`,
    `शेष शुल्क: रु. ${pending}`,
    "",
    "आपका पूरा शुल्क विवरण संलग्न है। इसमें प्रत्येक किस्त, प्राप्त राशि और शेष राशि दर्ज है।",
    "",
    "किसी सुधार के लिए कार्यालय 9352205884 पर संपर्क करें।",
  ].join("\n");
}

const FEE_STATEMENT_SAMPLE_EN: FeeStatementNoticeValues = {
  parentName: "Ramesh Lal Gurjar",
  studentName: "Aaradhya Gurjar",
  studentClass: "Class 2",
  sessionLabel: "2026-27",
  pendingAmount: 9125,
};

const FEE_STATEMENT_SAMPLE_HI: FeeStatementNoticeValues = {
  ...FEE_STATEMENT_SAMPLE_EN,
  parentName: "रमेश लाल गुर्जर",
  studentName: "आराध्या गुर्जर",
};

export type FeeStatementCampaignDescriptor = {
  language: NoticeLanguage;
  campaignName: string;
  slotOrder: readonly string[];
  buildParams(values: FeeStatementNoticeValues): string[];
  renderPreview(values: FeeStatementNoticeValues): string;
  sample: FeeStatementNoticeValues;
  approved: boolean;
  audience: "student";
  headerKind: NoticeHeaderKind;
};

export const FEE_STATEMENT_CAMPAIGNS: readonly FeeStatementCampaignDescriptor[] = [
  {
    language: "hi",
    campaignName: "vpps_app_fee_statement_hi_v1",
    slotOrder: FEE_STATEMENT_SLOT_SKELETON,
    buildParams: feeStatementParams,
    renderPreview: feeStatementBodyHi,
    sample: FEE_STATEMENT_SAMPLE_HI,
    // Approved by Meta and Live in AiSensy on 2026-09-12.
    approved: true,
    audience: "student",
    headerKind: "document",
  },
  {
    language: "en",
    campaignName: "vpps_app_fee_statement_en_v1",
    slotOrder: FEE_STATEMENT_SLOT_SKELETON,
    buildParams: feeStatementParams,
    renderPreview: feeStatementBodyEn,
    sample: FEE_STATEMENT_SAMPLE_EN,
    approved: true,
    audience: "student",
    headerKind: "document",
  },
];

/** The fee-statement notice for a language, approved or not. */
export function describeFeeStatementCampaign(
  language: NoticeLanguage,
): FeeStatementCampaignDescriptor | null {
  return FEE_STATEMENT_CAMPAIGNS.find((entry) => entry.language === language) ?? null;
}

/* ---------------------------------------------------------- reversal (v1) */

/**
 * "That payment came back off."
 *
 * A reversal is completely invisible to a family today. They believe they have
 * paid; the first they hear is a reminder, or a defaulter call. This is the
 * message that should have existed before either of those.
 *
 * Body-only, deliberately. There is no document to send — the receipt they hold
 * is now wrong, and attaching it would say the opposite of the message.
 *
 * Slot order is the SUBMITTED order — parent, student, receipt, amount, date,
 * balance — and it differs from the first draft, which put the date before the
 * amount. What Meta approved is what this must match: AiSensy enforces the
 * count, and the ORDER decides what the parent reads.
 */
export const REVERSAL_SLOT_SKELETON = [
  "parentName",
  "studentName",
  "receiptNumber",
  "amountReversed",
  "reversedOn",
  "remainingBalance",
] as const;

export type ReversalNoticeValues = {
  parentName: string;
  studentName: string;
  receiptNumber: string;
  /** The money taken back off the ledger. */
  amountReversed: number;
  /** DD-MM-YYYY. */
  reversedOn: string;
  /** Fees outstanding AFTER the reversal, read from the ledger. */
  remainingBalance: number;
};

function reversalParams(v: ReversalNoticeValues): string[] {
  return [
    v.parentName,
    v.studentName,
    v.receiptNumber,
    formatRupeesPlain(Math.max(0, Math.round(Number(v.amountReversed) || 0))),
    v.reversedOn,
    formatRupeesPlain(Math.max(0, Math.round(Number(v.remainingBalance) || 0))),
  ];
}

function reversalBodyEn(v: ReversalNoticeValues): string {
  const [p, s, receipt, amount, date, balance] = reversalParams(v);
  return [
    "*Payment reversed — Shri Veer Patta Sr. Sec. School*",
    "",
    `Dear ${p},`,
    "",
    `Student: ${s}`,
    `Receipt no: ${receipt}`,
    `Amount: Rs. ${amount}`, // @allow-raw-money-format: verbatim from the body submitted to Meta
    `Reversed on: ${date}`,
    "",
    `This payment has been reversed in our records and no longer counts towards the fees. The amount now outstanding is Rs. ${balance}.`, // @allow-raw-money-format: verbatim from the body submitted to Meta
    "",
    "If this is unexpected, please contact the office on 9352205884.",
  ].join("\n");
}

function reversalBodyHi(v: ReversalNoticeValues): string {
  const [p, s, receipt, amount, date, balance] = reversalParams(v);
  return [
    "*भुगतान निरस्त — श्री वीर पत्ता सी. सै. स्कूल*",
    "",
    `प्रिय ${p},`,
    "",
    `विद्यार्थी: ${s}`,
    `रसीद क्रमांक: ${receipt}`,
    `राशि: रु. ${amount}`,
    `निरस्त तिथि: ${date}`,
    "",
    `यह भुगतान हमारे रिकॉर्ड में निरस्त कर दिया गया है और अब शुल्क में नहीं गिना जाएगा। अब शेष राशि रु. ${balance} है।`,
    "",
    "यदि यह अप्रत्याशित है तो कृपया कार्यालय 9352205884 पर संपर्क करें।",
  ].join("\n");
}

const REVERSAL_SAMPLE_EN: ReversalNoticeValues = {
  parentName: "Ramesh Lal Gurjar",
  studentName: "Aaradhya Gurjar",
  receiptNumber: "SVP20260912-0001",
  amountReversed: 3000,
  reversedOn: "12-09-2026",
  remainingBalance: 9125,
};

const REVERSAL_SAMPLE_HI: ReversalNoticeValues = {
  ...REVERSAL_SAMPLE_EN,
  parentName: "रमेश लाल गुर्जर",
  studentName: "आराध्या गुर्जर",
};

export type ReversalCampaignDescriptor = {
  language: NoticeLanguage;
  campaignName: string;
  slotOrder: readonly string[];
  buildParams(values: ReversalNoticeValues): string[];
  renderPreview(values: ReversalNoticeValues): string;
  sample: ReversalNoticeValues;
  approved: boolean;
  audience: "student";
};

export const REVERSAL_CAMPAIGNS: readonly ReversalCampaignDescriptor[] = [
  {
    language: "hi",
    campaignName: "vpps_app_reversal_hi_v1",
    slotOrder: REVERSAL_SLOT_SKELETON,
    buildParams: reversalParams,
    renderPreview: reversalBodyHi,
    sample: REVERSAL_SAMPLE_HI,
    // Approved by Meta and Live in AiSensy on 2026-09-12.
    approved: true,
    audience: "student",
  },
  {
    language: "en",
    campaignName: "vpps_app_reversal_en_v1",
    slotOrder: REVERSAL_SLOT_SKELETON,
    buildParams: reversalParams,
    renderPreview: reversalBodyEn,
    sample: REVERSAL_SAMPLE_EN,
    approved: true,
    audience: "student",
  },
];

/** The reversal notice for a language, approved or not. */
export function describeReversalCampaign(
  language: NoticeLanguage,
): ReversalCampaignDescriptor | null {
  return REVERSAL_CAMPAIGNS.find((entry) => entry.language === language) ?? null;
}
