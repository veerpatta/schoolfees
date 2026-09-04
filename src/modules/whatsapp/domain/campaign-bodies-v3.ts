import { formatRupeesPlain } from "@/platform/helpers/currency";
import { shortClassLabel, type NoticeLanguage } from "@/modules/whatsapp/domain/campaigns";

/**
 * The family and receipt campaigns — approved by Meta and Live in AiSensy on
 * 2026-09-04.
 *
 * Kept out of `campaigns.ts` for one reason, and it is a measured one. That
 * module is client-reachable — the send screen previews the per-student message
 * live as staff type — but nothing on any screen previews a family or receipt
 * body. Only `data/run-sender.ts` and `data/receipt-notice.ts` send these, on
 * the server. Ten bodies in Hindi and English would therefore be provably
 * unreachable text on every load of `/protected/reminders`, against a ceiling
 * in `quality/route-bundle-baseline.json` that only ratchets down.
 *
 * Nothing in `src/app` or `src/modules/**\/ui` may import this file;
 * `tests/ui/whatsapp-reminders-screen.test.ts` enforces it. Tests, `domain/`
 * and `data/` may.
 *
 * The eight per-student `_v3` notices started life here too, while they were
 * pending, and moved into `campaigns.ts` the day they went Live — because
 * `campaignFor` hands those out and the test panel previews them.
 *
 * `buildParams` and `renderPreview` sit on ONE descriptor, which is the
 * invariant that matters: what the office reads and what a parent receives
 * cannot quote different values.
 *
 * Bodies are copied from `docs/modules/whatsapp-campaign-registry.md`, which is
 * the ground truth submitted to Meta.
 */

const UPI = "upi://pay?pa=shriveerpattassecsch.68347408@hdfcbank";

/* ------------------------------------------------------- family notices (v3) */

/**
 * One phone, more than one child.
 *
 * Five slots, not seven. A family notice names the children and quotes ONE
 * total, so there is no per-child installment phrase and no per-child figure to
 * carry — which is the whole reason it exists. A parent with three children was
 * receiving three messages quoting three balances for one debt.
 *
 * Approved by Meta and Live in AiSensy on 2026-09-04. `sendFamily` sends these
 * for a phone carrying two or more children on `fee_due`, `balance` and
 * `upcoming`, and logs the siblings as `covered_by_sibling` under the same
 * campaign name. A one-child phone, and every family on `late_fee_applied`,
 * still gets the spokesperson's per-child notice — `domain/family-notice.ts`
 * says why the latter.
 */
export const FAMILY_SLOT_SKELETON = [
  "parentName",
  "childrenLine",
  "totalAmount",
  "date",
  "lateFeePhrase",
] as const;

/** Everything a family notice needs. `childrenLine` comes from `family-grouping`. */
export type FamilyNoticeValues = {
  parentName: string;
  /** "Aaradhya (2), Bhavya (5)" — built by `childrenLine()`, never here. */
  childrenLine: string;
  /** Every child's figure, summed. The one number a family notice quotes. */
  totalAmount: number;
  lastDate?: string;
  lateFeePhrase?: string;
};

function familyParams(v: FamilyNoticeValues, language: NoticeLanguage): string[] {
  const phrase = (v.lateFeePhrase ?? "").trim();
  return [
    v.parentName,
    v.childrenLine,
    formatRupeesPlain(Math.max(0, Math.round(Number(v.totalAmount) || 0))),
    v.lastDate ?? "",
    // Never empty: WhatsApp rejects an empty parameter, same rule as slot 7 on
    // the per-student notices.
    phrase || (language === "hi" ? "इस राशि पर लागू नहीं" : "Not applicable on this amount"),
  ];
}

function familyBody(args: {
  title: string;
  greeting: string;
  childrenLabel: string;
  totalLabel: string;
  dateLabel: string;
  lateFeeLabel: string;
  explanation: string;
  payLine: string;
  closing: string;
  office: string;
  values: FamilyNoticeValues;
  language: NoticeLanguage;
}): string {
  const [parent, children, total, date, fee] = familyParams(args.values, args.language);
  const rupees = args.language === "hi" ? "रु." : "Rs.";
  return [
    `*${args.title}*`,
    "",
    `${args.greeting} ${parent},`,
    "",
    `${args.childrenLabel}: ${children}`,
    `${args.totalLabel}: ${rupees} ${total}`, // @allow-raw-money-format: the currency word is part of the Meta-approved body
    `${args.dateLabel}: ${date}`,
    `${args.lateFeeLabel}: ${fee}`,
    "",
    args.explanation,
    "",
    args.payLine,
    UPI,
    "",
    args.closing,
    "",
    args.office,
  ].join("\n");
}

const HI = {
  greeting: "प्रिय",
  childrenLabel: "विद्यार्थी",
  totalLabel: "कुल देय राशि",
  payLine: "फीस काउंटर पर अथवा इस UPI लिंक से जमा करें:",
  closing:
    "भुगतान करते समय विद्यार्थियों के नाम अवश्य लिखें तथा रसीद प्राप्त करें। यदि भुगतान हो चुका है तो इस संदेश को अनदेखा करें।",
  office: "जानकारी हेतु कार्यालय 9352205884 पर संपर्क करें।",
};

const EN = {
  greeting: "Dear",
  childrenLabel: "Students",
  totalLabel: "Total amount due",
  payLine: "Pay at the school fee counter or using this UPI link:",
  closing:
    "Please write the students' names with the payment and collect a receipt. If you have already paid, kindly ignore this message.",
  office: "For any query, call the office on 9352205884.",
};

/**
 * One body builder per situation and language.
 *
 * Worded differently per situation rather than parameterised, because Meta
 * rejects a body that near-duplicates an approved one — the same reason the
 * three per-student situations read differently.
 */
const FAMILY_BODIES: Record<
  string,
  Record<NoticeLanguage, (v: FamilyNoticeValues) => string>
> = {
  fee_due: {
    en: (v) =>
      familyBody({
        ...EN,
        title: "Fee Notice — Shri Veer Patta Sr. Sec. School",
        dateLabel: "Last date",
        lateFeeLabel: "Late fee after the last date",
        explanation:
          "The amount above covers all the students named. Paying on or before the last date avoids the late fee.",
        values: v,
        language: "en",
      }),
    hi: (v) =>
      familyBody({
        ...HI,
        title: "फीस सूचना — श्री वीर पत्ता सी. सै. स्कूल",
        dateLabel: "अंतिम तिथि",
        lateFeeLabel: "अंतिम तिथि के बाद विलंब शुल्क",
        explanation:
          "उपरोक्त राशि सभी दर्शाए गए विद्यार्थियों की है। अंतिम तिथि तक जमा करने पर कोई विलंब शुल्क नहीं लगेगा।",
        values: v,
        language: "hi",
      }),
  },
  balance: {
    en: (v) =>
      familyBody({
        ...EN,
        title: "Fee Balance — Shri Veer Patta Sr. Sec. School",
        totalLabel: "Balance due in total",
        dateLabel: "Next date",
        lateFeeLabel: "Late fee after the next date",
        explanation:
          "Thank you for the payments received. The balance above is what remains across the students named, and clearing it by the next date avoids the late fee.",
        values: v,
        language: "en",
      }),
    hi: (v) =>
      familyBody({
        ...HI,
        title: "फीस शेष विवरण — श्री वीर पत्ता सी. सै. स्कूल",
        totalLabel: "कुल शेष बकाया",
        dateLabel: "अगली तिथि",
        lateFeeLabel: "अगली तिथि के बाद विलंब शुल्क",
        explanation:
          "प्राप्त भुगतान के लिए धन्यवाद। उपरोक्त शेष राशि दर्शाए गए सभी विद्यार्थियों की है। अगली तिथि तक जमा करने पर कोई विलंब शुल्क नहीं लगेगा।",
        values: v,
        language: "hi",
      }),
  },
  upcoming: {
    en: (v) =>
      familyBody({
        ...EN,
        title: "Fee Reminder — Shri Veer Patta Sr. Sec. School",
        totalLabel: "Amount due in total",
        dateLabel: "Last date",
        lateFeeLabel: "Late fee after the last date",
        explanation:
          "The next installment for the students named falls due shortly. Settling the total on or before the last date avoids the late fee.",
        values: v,
        language: "en",
      }),
    hi: (v) =>
      familyBody({
        ...HI,
        title: "फीस स्मरण — श्री वीर पत्ता सी. सै. स्कूल",
        totalLabel: "कुल देय राशि",
        dateLabel: "अंतिम तिथि",
        lateFeeLabel: "अंतिम तिथि के बाद विलंब शुल्क",
        explanation:
          "दर्शाए गए विद्यार्थियों की अगली किश्त शीघ्र ही देय है। अंतिम तिथि तक कुल राशि जमा करने पर कोई विलंब शुल्क नहीं लगेगा।",
        values: v,
        language: "hi",
      }),
  },
  late_fee_applied: {
    en: (v) =>
      familyBody({
        ...EN,
        title: "Late Fee Applied — Shri Veer Patta Sr. Sec. School",
        totalLabel: "Total to pay",
        dateLabel: "Date passed",
        lateFeeLabel: "Late fee included above",
        explanation:
          "The last date shown has passed and the late fee is now on this account. The total above covers all the students named.",
        values: v,
        language: "en",
      }),
    hi: (v) =>
      familyBody({
        ...HI,
        title: "विलंब शुल्क लागू — श्री वीर पत्ता सी. सै. स्कूल",
        totalLabel: "कुल देय",
        dateLabel: "निकल चुकी तिथि",
        lateFeeLabel: "उपरोक्त राशि में सम्मिलित विलंब शुल्क",
        explanation:
          "दर्शाई गई अंतिम तिथि निकल चुकी है तथा विलंब शुल्क इस खाते में जुड़ चुका है। उपरोक्त कुल राशि सभी दर्शाए गए विद्यार्थियों की है।",
        values: v,
        language: "hi",
      }),
  },
};

const FAMILY_SAMPLE: FamilyNoticeValues = {
  parentName: "Ramesh Lal Gurjar",
  childrenLine: "Aaradhya Gurjar (2), Bhavya Gurjar (5)",
  totalAmount: 22375,
  lastDate: "20-10-2026",
  lateFeePhrase: "Rs. 1,000 per installment", // @allow-raw-money-format: the literal sample submitted to Meta
};

const FAMILY_SAMPLE_HI: FamilyNoticeValues = {
  parentName: "रमेश लाल गुर्जर",
  childrenLine: "आराध्या गुर्जर (2), भव्या गुर्जर (5)",
  totalAmount: 22375,
  lastDate: "20-10-2026",
  lateFeePhrase: "रु. 1,000 प्रति किश्त",
};

export type FamilyCampaignDescriptor = {
  situation: string;
  language: NoticeLanguage;
  campaignName: string;
  slotOrder: readonly string[];
  buildParams(values: FamilyNoticeValues): string[];
  renderPreview(values: FamilyNoticeValues): string;
  sample: FamilyNoticeValues;
  approved: boolean;
  audience: "family";
};

/** The eight family notices, all approved and Live since 2026-09-04. */
export const FAMILY_CAMPAIGNS: readonly FamilyCampaignDescriptor[] = (
  ["fee_due", "balance", "upcoming", "late_fee_applied"] as const
).flatMap((situation) =>
  (["hi", "en"] as const).map((language) => ({
    situation,
    language,
    campaignName: `vpps_app_family_${situation}_${language}_v3`,
    slotOrder: FAMILY_SLOT_SKELETON,
    buildParams: (values: FamilyNoticeValues) => familyParams(values, language),
    renderPreview: FAMILY_BODIES[situation]![language],
    sample: language === "hi" ? FAMILY_SAMPLE_HI : FAMILY_SAMPLE,
    approved: true,
    audience: "family" as const,
  })),
);

/**
 * The family campaign for a notice, or null when there is none.
 *
 * Returns the descriptor regardless of approval, exactly as `describeCampaign`
 * does — approval is checked at the send, not the lookup, so the screen can say
 * "a family template exists but is not Live yet" rather than nothing.
 */
export function describeFamilyCampaign(
  situation: string,
  language: NoticeLanguage,
): FamilyCampaignDescriptor | null {
  return (
    FAMILY_CAMPAIGNS.find(
      (entry) => entry.situation === situation && entry.language === language,
    ) ?? null
  );
}


/* ------------------------------------------------------ receipt notice (v3) */

/**
 * "Your payment reached us."
 *
 * The only message in this system a family is pleased to receive, and the answer
 * to the office's most common inbound WhatsApp: did the money arrive. Sent after
 * a posting, never in a batch.
 *
 * Seven slots, and the last one is the REMAINING balance rather than a late-fee
 * phrase — a receipt is not a threat, and a parent who has just paid should be
 * told where that leaves them rather than what happens if they are late.
 */
export const RECEIPT_SLOT_SKELETON = [
  "parentName",
  "studentName",
  "studentClass",
  "receiptNumber",
  "amountPaid",
  "paymentDate",
  "remainingBalance",
] as const;

export type ReceiptNoticeValues = {
  parentName: string;
  studentName: string;
  studentClass: string;
  receiptNumber: string;
  amountPaid: number;
  /** DD-MM-YYYY. */
  paymentDate: string;
  /** What is still owed AFTER this payment, read from the ledger. */
  remainingBalance: number;
};

function receiptParams(v: ReceiptNoticeValues): string[] {
  return [
    v.parentName,
    v.studentName,
    shortClassLabel(v.studentClass),
    v.receiptNumber,
    formatRupeesPlain(Math.max(0, Math.round(Number(v.amountPaid) || 0))),
    v.paymentDate,
    // Zero is a real and welcome answer here — "nothing further is due" — so it
    // is printed rather than suppressed. The body words the line so 0 reads
    // correctly.
    formatRupeesPlain(Math.max(0, Math.round(Number(v.remainingBalance) || 0))),
  ];
}

function receiptBodyEn(v: ReceiptNoticeValues): string {
  const [p, s, c, receipt, amount, date, remaining] = receiptParams(v);
  return [
    "*Payment Received — Shri Veer Patta Sr. Sec. School*",
    "",
    `Dear ${p},`,
    "",
    `Student: ${s}`,
    `Class: ${c}`,
    `Receipt number: ${receipt}`,
    `Amount received: Rs. ${amount}`, // @allow-raw-money-format: verbatim from the English body submitted to Meta
    `Date: ${date}`,
    `Balance remaining: Rs. ${remaining}`, // @allow-raw-money-format: verbatim from the English body submitted to Meta
    "",
    "Thank you. Your payment has been recorded against the student named above. Please keep the printed receipt for your records.",
    "",
    "If any detail above does not match your receipt, call the office on 9352205884.",
  ].join("\n");
}

function receiptBodyHi(v: ReceiptNoticeValues): string {
  const [p, s, c, receipt, amount, date, remaining] = receiptParams(v);
  return [
    "*भुगतान प्राप्त — श्री वीर पत्ता सी. सै. स्कूल*",
    "",
    `प्रिय ${p},`,
    "",
    `विद्यार्थी: ${s}`,
    `कक्षा: ${c}`,
    `रसीद संख्या: ${receipt}`,
    `प्राप्त राशि: रु. ${amount}`,
    `दिनांक: ${date}`,
    `शेष राशि: रु. ${remaining}`,
    "",
    "धन्यवाद। आपका भुगतान उपरोक्त विद्यार्थी के खाते में दर्ज कर लिया गया है। कृपया मुद्रित रसीद सुरक्षित रखें।",
    "",
    "यदि उपरोक्त विवरण आपकी रसीद से भिन्न है तो कार्यालय 9352205884 पर संपर्क करें।",
  ].join("\n");
}

const RECEIPT_SAMPLE_EN: ReceiptNoticeValues = {
  parentName: "Ramesh Lal Gurjar",
  studentName: "Aaradhya Gurjar",
  studentClass: "Class 2",
  receiptNumber: "SVP-2026-27-1042",
  amountPaid: 9125,
  paymentDate: "03-09-2026",
  remainingBalance: 9125,
};

const RECEIPT_SAMPLE_HI: ReceiptNoticeValues = {
  ...RECEIPT_SAMPLE_EN,
  parentName: "रमेश लाल गुर्जर",
  studentName: "आराध्या गुर्जर",
};

export type ReceiptCampaignDescriptor = {
  language: NoticeLanguage;
  campaignName: string;
  slotOrder: readonly string[];
  buildParams(values: ReceiptNoticeValues): string[];
  renderPreview(values: ReceiptNoticeValues): string;
  sample: ReceiptNoticeValues;
  approved: boolean;
  audience: "student";
};

/**
 * Two receipt notices, both approved and Live since 2026-09-04 — and still
 * switched OFF, because `data/receipt-notice.ts` also requires
 * `app_settings.whatsapp_receipt_notice_enabled = 'true'`, which is seeded
 * `'false'`. Turning that on is a separate decision; it makes every posted
 * payment message the parent.
 */
export const RECEIPT_CAMPAIGNS: readonly ReceiptCampaignDescriptor[] = [
  {
    language: "hi",
    campaignName: "vpps_app_receipt_hi_v3",
    slotOrder: RECEIPT_SLOT_SKELETON,
    buildParams: receiptParams,
    renderPreview: receiptBodyHi,
    sample: RECEIPT_SAMPLE_HI,
    approved: true,
    audience: "student",
  },
  {
    language: "en",
    campaignName: "vpps_app_receipt_en_v3",
    slotOrder: RECEIPT_SLOT_SKELETON,
    buildParams: receiptParams,
    renderPreview: receiptBodyEn,
    sample: RECEIPT_SAMPLE_EN,
    approved: true,
    audience: "student",
  },
];

/** The receipt notice for a language, approved or not. */
export function describeReceiptCampaign(
  language: NoticeLanguage,
): ReceiptCampaignDescriptor | null {
  return RECEIPT_CAMPAIGNS.find((entry) => entry.language === language) ?? null;
}
