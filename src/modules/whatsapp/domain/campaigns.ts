import { formatRupeesPlain } from "@/platform/helpers/currency";

/**
 * The six approved WhatsApp campaigns: three fee situations × two languages.
 *
 * One place where a notice's campaign name, slot order, param builder and
 * preview body sit together, so they cannot drift apart. The written contract is
 * `docs/modules/whatsapp-campaign-registry.md` — slot orders and bodies here are
 * copied from it, and it wins if the two ever disagree.
 *
 * Deliberately free of `server-only`: the screen renders a live preview as staff
 * type, so the client bundle reaches this file. It must therefore never
 * value-import `../data/aisensy` — that is both a `server-only` edge that fails
 * the build and a `domain-is-not-pure` violation, whose budget in
 * `quality/architecture-baseline.json` only falls.
 *
 * Campaign name equals template name for all six, so one string drives both.
 * All six are category UTILITY at ~₹0.145 a message. Meta re-categorises
 * silently — `vpps_waiver_offer_hinglish` went UTILITY → MARKETING fourteen
 * minutes after submission on promotional wording, a 7.5× cost move — so none of
 * these sells anything, and every send is logged with its `campaign_name` so the
 * bill can be reconciled per campaign.
 */

export type NoticeSituation = "fee_due" | "balance" | "prevyear";
export type NoticeLanguage = "hi" | "en";

export const NOTICE_SITUATIONS = [
  {
    value: "fee_due",
    label: "Fee due",
    hint: "Nothing received yet for the selected installments",
  },
  {
    value: "balance",
    label: "Balance",
    hint: "Part paid, a balance still outstanding",
  },
  {
    value: "prevyear",
    label: "Previous session",
    hint: "Carried forward from last session, no late fee",
  },
] as const satisfies ReadonlyArray<{
  value: NoticeSituation;
  label: string;
  hint: string;
}>;

export const NOTICE_LANGUAGES = [
  { value: "hi", label: "हिंदी" },
  { value: "en", label: "English" },
] as const satisfies ReadonlyArray<{ value: NoticeLanguage; label: string }>;

/**
 * The installments the `fee_due` audience checks by default.
 *
 * Lives here, not with the audience, because it is a fact about what the message
 * says: the fee_due template names the installments in slot {{4}}, so the filter
 * and the phrase must come from one place.
 */
export const TEMPLATE_INSTALLMENTS = [1, 2] as const;

export const DEFAULT_SITUATION: NoticeSituation = "fee_due";
export const DEFAULT_LANGUAGE: NoticeLanguage = "hi";

export const SITUATION_VALUES: readonly string[] = NOTICE_SITUATIONS.map((s) => s.value);
export const LANGUAGE_VALUES: readonly string[] = NOTICE_LANGUAGES.map((l) => l.value);

export function isNoticeSituation(value: unknown): value is NoticeSituation {
  return typeof value === "string" && SITUATION_VALUES.includes(value);
}

export function isNoticeLanguage(value: unknown): value is NoticeLanguage {
  return typeof value === "string" && LANGUAGE_VALUES.includes(value);
}

/**
 * Everything any of the six slot sets can need. Each builder takes only what its
 * own template declares, so a value missing for another situation is harmless.
 */
export type NoticeValues = {
  parentName: string;
  studentName: string;
  /** Raw class label. The builders strip the `Class ` prefix themselves. */
  studentClass: string;
  /** fee_due {{4}} — e.g. "Installment 1 and 2". */
  installmentPhrase?: string;
  /** fee_due {{5}} */
  amountDue?: number;
  /** balance {{4}} */
  receivedSoFar?: number;
  /** balance {{5}} */
  balanceDue?: number;
  /** fee_due {{6}} / balance {{6}}, already DD-MM-YYYY. */
  lastDate?: string;
  /** prevyear {{4}} — the session the debt came from, e.g. "2025-26". */
  prevSessionLabel?: string;
  /** prevyear {{5}} */
  prevYearBalance?: number;
};

export type CampaignDescriptor = {
  situation: NoticeSituation;
  language: NoticeLanguage;
  /** Campaign name, which is also the template name. */
  campaignName: string;
  /** Slot names in order. Its length IS the slot count AiSensy enforces. */
  slotOrder: readonly string[];
  buildParams(values: NoticeValues): string[];
  renderPreview(values: NoticeValues): string;
  /** The values submitted to Meta, so the test panel opens on something real. */
  sample: NoticeValues;
};

/**
 * The templates print `कक्षा: {{3}}` / `Class: {{3}}`, and app labels are
 * `"Class 2"` — passing one straight through renders "Class: Class 2".
 *
 * Only a leading `Class ` is stripped. `Nursery`, `JKG`, `SKG` and the
 * `11 Science` family carry no prefix and must survive untouched; checked
 * against all 19 labels live in 2026-27.
 */
export function shortClassLabel(label: string): string {
  return String(label ?? "").replace(/^Class\s+/i, "").trim();
}

/** Slot money is grouped digits with no symbol — the body supplies `रु.` / `Rs.`. */
function money(value: number | undefined): string {
  return formatRupeesPlain(value ?? 0);
}

/* ------------------------------------------------------------- slot builders */

const FEE_DUE_SLOTS = [
  "parentName",
  "studentName",
  "studentClass",
  "installmentPhrase",
  "amountDue",
  "lastDate",
] as const;

const BALANCE_SLOTS = [
  "parentName",
  "studentName",
  "studentClass",
  "receivedSoFar",
  "balanceDue",
  "lastDate",
] as const;

const PREVYEAR_SLOTS = [
  "parentName",
  "studentName",
  "studentClass",
  "prevSessionLabel",
  "prevYearBalance",
] as const;

function feeDueParams(v: NoticeValues): string[] {
  return [
    v.parentName,
    v.studentName,
    shortClassLabel(v.studentClass),
    v.installmentPhrase ?? "",
    money(v.amountDue),
    v.lastDate ?? "",
  ];
}

function balanceParams(v: NoticeValues): string[] {
  return [
    v.parentName,
    v.studentName,
    shortClassLabel(v.studentClass),
    money(v.receivedSoFar),
    money(v.balanceDue),
    v.lastDate ?? "",
  ];
}

function prevYearParams(v: NoticeValues): string[] {
  return [
    v.parentName,
    v.studentName,
    shortClassLabel(v.studentClass),
    v.prevSessionLabel ?? "",
    money(v.prevYearBalance),
  ];
}

/* ------------------------------------------------------------------- bodies */
/* Copied verbatim from docs/modules/whatsapp-campaign-registry.md. WhatsApp
   sends what Meta approved, not this text — a preview that does not match is
   worse than no preview, because staff trust it. */

const UPI = "upi://pay?pa=shriveerpattassecsch.68347408@hdfcbank";

function feeDueBodyEn(v: NoticeValues): string {
  const [p, s, c, phrase, amount, date] = feeDueParams(v);
  return [
    "*Fee Notice — Shri Veer Patta Sr. Sec. School*",
    "",
    `Dear ${p},`,
    "",
    `Student: ${s}`,
    `Class: ${c}`,
    `Installment: ${phrase}`,
    `Amount due: Rs. ${amount}`, // @allow-raw-money-format: verbatim from the Meta-approved English body
    `Last date: ${date}`,
    "",
    "The above fees have not yet been received. You may pay at the school fee counter, or directly using this UPI link:",
    UPI,
    "",
    "Please write the student's name with the payment and collect a receipt from the office. If you have already paid, kindly ignore this message.",
    "",
    "For any query, call the office on 9352205884.",
  ].join("\n");
}

function feeDueBodyHi(v: NoticeValues): string {
  const [p, s, c, phrase, amount, date] = feeDueParams(v);
  return [
    "*फीस सूचना — श्री वीर पत्ता सी. सै. स्कूल*",
    "",
    `प्रिय ${p},`,
    "",
    `विद्यार्थी: ${s}`,
    `कक्षा: ${c}`,
    `किश्त: ${phrase}`,
    `देय राशि: रु. ${amount}`,
    `अंतिम तिथि: ${date}`,
    "",
    "उपरोक्त फीस अभी जमा नहीं हुई है। आप विद्यालय के फीस काउंटर पर जमा कर सकते हैं, अथवा इस UPI लिंक से सीधे भुगतान कर सकते हैं:",
    UPI,
    "",
    "भुगतान करते समय विद्यार्थी का नाम अवश्य लिखें तथा कार्यालय से रसीद प्राप्त करें। यदि आपने भुगतान कर दिया है तो इस संदेश को अनदेखा करें।",
    "",
    "जानकारी हेतु कार्यालय 9352205884 पर संपर्क करें।",
  ].join("\n");
}

function balanceBodyEn(v: NoticeValues): string {
  const [p, s, c, received, balance, date] = balanceParams(v);
  return [
    "*Fee Balance — Shri Veer Patta Sr. Sec. School*",
    "",
    `Dear ${p},`,
    "",
    `Student: ${s}`,
    `Class: ${c}`,
    `Received so far: Rs. ${received}`, // @allow-raw-money-format: verbatim from the Meta-approved English body
    `Balance due: Rs. ${balance}`, // @allow-raw-money-format: verbatim from the Meta-approved English body
    `Next date: ${date}`,
    "",
    "Thank you for the payment received. The balance may be paid at the fee counter or using this UPI link:",
    UPI,
    "",
    "If this differs from your own record, please call the office on 9352205884.",
  ].join("\n");
}

function balanceBodyHi(v: NoticeValues): string {
  const [p, s, c, received, balance, date] = balanceParams(v);
  return [
    "*फीस शेष विवरण — श्री वीर पत्ता सी. सै. स्कूल*",
    "",
    `प्रिय ${p},`,
    "",
    `विद्यार्थी: ${s}`,
    `कक्षा: ${c}`,
    `अब तक प्राप्त: रु. ${received}`,
    `शेष बकाया: रु. ${balance}`,
    `अगली तिथि: ${date}`,
    "",
    "प्राप्त भुगतान के लिए धन्यवाद। शेष राशि फीस काउंटर पर अथवा इस UPI लिंक से जमा की जा सकती है:",
    UPI,
    "",
    "यदि यह विवरण आपके रिकॉर्ड से भिन्न है तो कृपया कार्यालय 9352205884 पर संपर्क करें।",
  ].join("\n");
}

function prevYearBodyEn(v: NoticeValues): string {
  const [p, s, c, session, balance] = prevYearParams(v);
  return [
    "*Previous Session Balance — Shri Veer Patta Sr. Sec. School*",
    "",
    `Dear ${p},`,
    "",
    `Student: ${s}`,
    `Class: ${c}`,
    `Session: ${session}`,
    `Balance: Rs. ${balance}`, // @allow-raw-money-format: verbatim from the Meta-approved English body
    "",
    "This amount is from the previous session and is separate from this year's installments. No late fee is charged on it.",
    "",
    "To settle it, visit the fee counter or use this UPI link:",
    UPI,
    "",
    "For a full statement, call the office on 9352205884.",
  ].join("\n");
}

function prevYearBodyHi(v: NoticeValues): string {
  const [p, s, c, session, balance] = prevYearParams(v);
  return [
    "*पिछले सत्र का शेष — श्री वीर पत्ता सी. सै. स्कूल*",
    "",
    `प्रिय ${p},`,
    "",
    `विद्यार्थी: ${s}`,
    `कक्षा: ${c}`,
    `सत्र: ${session}`,
    `शेष राशि: रु. ${balance}`,
    "",
    "यह राशि पिछले सत्र की है और इस वर्ष की किश्तों से अलग है। इस पर कोई विलंब शुल्क नहीं लगता।",
    "",
    "निपटान हेतु फीस काउंटर पर आएं अथवा इस UPI लिंक का उपयोग करें:",
    UPI,
    "",
    "पूरा विवरण देखने हेतु कार्यालय 9352205884 पर संपर्क करें।",
  ].join("\n");
}

/* ----------------------------------------------------------------- registry */

/** Samples as submitted to Meta, so the test panel opens on something real. */
const FEE_DUE_SAMPLE: NoticeValues = {
  parentName: "Ramesh Lal Gurjar",
  studentName: "Aaradhya Gurjar",
  studentClass: "Class 2",
  installmentPhrase: "Installment 1 and 2",
  amountDue: 18250,
  lastDate: "25-08-2026",
};

const BALANCE_SAMPLE: NoticeValues = {
  parentName: "Ramesh Lal Gurjar",
  studentName: "Aaradhya Gurjar",
  studentClass: "Class 2",
  receivedSoFar: 6500,
  balanceDue: 11750,
  lastDate: "20-10-2026",
};

const PREVYEAR_SAMPLE: NoticeValues = {
  parentName: "Pintu Singh Chundawat",
  studentName: "Bhavydeep Singh Chundawat",
  studentClass: "Nursery",
  prevSessionLabel: "2025-26",
  prevYearBalance: 20000,
};

const CAMPAIGNS: CampaignDescriptor[] = [
  {
    situation: "fee_due",
    language: "hi",
    campaignName: "vpps_app_fee_due_hi",
    slotOrder: FEE_DUE_SLOTS,
    buildParams: feeDueParams,
    renderPreview: feeDueBodyHi,
    sample: FEE_DUE_SAMPLE,
  },
  {
    situation: "fee_due",
    language: "en",
    campaignName: "vpps_app_fee_due_en",
    slotOrder: FEE_DUE_SLOTS,
    buildParams: feeDueParams,
    renderPreview: feeDueBodyEn,
    sample: FEE_DUE_SAMPLE,
  },
  {
    situation: "balance",
    language: "hi",
    campaignName: "vpps_app_balance_hi",
    slotOrder: BALANCE_SLOTS,
    buildParams: balanceParams,
    renderPreview: balanceBodyHi,
    sample: BALANCE_SAMPLE,
  },
  {
    situation: "balance",
    language: "en",
    campaignName: "vpps_app_balance_en",
    slotOrder: BALANCE_SLOTS,
    buildParams: balanceParams,
    renderPreview: balanceBodyEn,
    sample: BALANCE_SAMPLE,
  },
  {
    situation: "prevyear",
    language: "hi",
    campaignName: "vpps_app_prevyear_hi",
    slotOrder: PREVYEAR_SLOTS,
    buildParams: prevYearParams,
    renderPreview: prevYearBodyHi,
    sample: PREVYEAR_SAMPLE,
  },
  {
    situation: "prevyear",
    language: "en",
    campaignName: "vpps_app_prevyear_en",
    slotOrder: PREVYEAR_SLOTS,
    buildParams: prevYearParams,
    renderPreview: prevYearBodyEn,
    sample: PREVYEAR_SAMPLE,
  },
];

export const ALL_CAMPAIGNS: readonly CampaignDescriptor[] = CAMPAIGNS;

/**
 * The campaign for one situation and language.
 *
 * Throws rather than falling back. A fallback here would mean silently sending
 * a different message than the office picked, at a real parent, and the four
 * slot counts are not interchangeable — a mismatch is refused by AiSensy with
 * "Template params does not match the campaign".
 */
export function campaignFor(
  situation: NoticeSituation,
  language: NoticeLanguage,
): CampaignDescriptor {
  const found = CAMPAIGNS.find(
    (entry) => entry.situation === situation && entry.language === language,
  );
  if (!found) {
    throw new Error(`No approved WhatsApp campaign for ${situation}/${language}.`);
  }
  return found;
}

/**
 * "Installment 1 and 2" / "Installment 3" — what the fee_due template's {{4}}
 * says, built from the installments actually selected rather than hardcoded.
 */
export function installmentPhrase(installments: number[]): string {
  const sorted = [...new Set(installments)].sort((a, b) => a - b);
  if (sorted.length === 0) return "Installment 1 and 2";
  if (sorted.length === 1) return `Installment ${sorted[0]}`;
  const last = sorted[sorted.length - 1];
  return `Installment ${sorted.slice(0, -1).join(", ")} and ${last}`;
}
