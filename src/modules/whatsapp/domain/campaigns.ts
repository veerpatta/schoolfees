import { formatDdMmYyyy } from "@/platform/helpers/date";
import { formatRupeesPlain } from "@/platform/helpers/currency";
import { lateFeePhrase, type LateFeeBasis } from "@/modules/whatsapp/domain/late-fee";

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

export type NoticeSituation =
  | "fee_due"
  | "balance"
  | "prevyear"
  | "upcoming"
  | "upcoming_final"
  | "late_fee_applied"
  | "promise_lapsed";
export type NoticeLanguage = "hi" | "en";

export const NOTICE_SITUATIONS = [
  {
    value: "upcoming",
    label: "Due soon",
    hint: "An installment falls due within the window, and nothing earlier is owed",
  },
  {
    value: "upcoming_final",
    label: "Final call",
    hint: "The same families, from three days out — the late fee named as imminent",
  },
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
    value: "late_fee_applied",
    label: "Late fee applied",
    hint: "A due date has passed and the ledger is charging a late fee",
  },
  {
    value: "promise_lapsed",
    label: "Promise lapsed",
    hint: "The date the family gave has passed and nothing has come in",
  },
  {
    value: "prevyear",
    label: "Previous session",
    hint: "Carried forward from last session, settled by its own date",
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

/**
 * Which eligibility filters actually change each notice's list, and what they
 * are called there.
 *
 * A control that does nothing is worse than no control: it reads as applied.
 * The installment dropdown sat on all three notices while only `fee_due`
 * honoured it, and 87 of the 258 families on the live balance list were fully
 * paid up on installments 1 and 2 — chased for installments 3 and 4, which were
 * not due for another two months.
 *
 * `null` means the notice ignores that filter, so the screen hides the control
 * and carries the value forward as a hidden input instead of dropping it — the
 * office's setting must survive a round trip through a notice that had no use
 * for it.
 */
export const SITUATION_FILTERS = {
  // The two courtesy notices are about ONE installment that has not fallen due
  // yet, picked by the calendar rather than the office. Offering a "paid so far"
  // threshold would imply it splits the audience, and it does not.
  upcoming: {
    paidSoFar: null,
    installments: null,
    minDue: "Due at least",
  },
  upcoming_final: {
    paidSoFar: null,
    installments: null,
    minDue: "Due at least",
  },
  // The ledger decides who is here: an installment past its date with a late fee
  // actually pending on it. Nothing about what was paid this year changes that.
  late_fee_applied: {
    paidSoFar: null,
    installments: null,
    minDue: "Fees pending at least",
  },
  // The promise decides who is here. Filtering it by installment would drop
  // families who promised against a bill this notice is not about.
  promise_lapsed: {
    paidSoFar: null,
    installments: null,
    minDue: "Promised at least",
  },
  fee_due: {
    // The threshold splits the two current-year notices; below it, only the
    // academic fee has landed and nothing real has been received.
    paidSoFar: "Paid so far, at most",
    // Every selected installment must be pending — nothing has been received,
    // so "1 and 2" means both.
    installments: "Installments pending",
    minDue: "Due at least",
  },
  balance: {
    paidSoFar: "Paid so far, over",
    // ANY of the selected — a family who cleared 1 and still owes 2 is exactly
    // who this notice is for.
    installments: "Still owing on",
    minDue: "Balance at least",
  },
  prevyear: {
    // Neither applies: this balance is last session's and has no installments,
    // and what was paid THIS year says nothing about it.
    paidSoFar: null,
    installments: null,
    minDue: "Carry-forward at least",
  },
} as const satisfies Record<
  NoticeSituation,
  { paidSoFar: string | null; installments: string | null; minDue: string }
>;

/** One line saying who this notice is about, shown under the filter grid. */
export const SITUATION_RULE: Record<NoticeSituation, string> = {
  upcoming:
    "An installment falls due inside the pre-due window with fees still on it, and nothing earlier is outstanding. A courtesy note, before any late fee.",
  upcoming_final:
    "The same families as Due soon, from three days out. The wording says the late fee starts the day after the date.",
  late_fee_applied:
    "An installment has passed its due date and the ledger is charging a late fee on it. The message quotes the fee, the late fee and the total separately — never added together.",
  promise_lapsed:
    "The family's last recorded contact was a promise to pay, that date has passed, and the money has not arrived.",
  fee_due: "Nothing received beyond the academic fee, and every selected installment still pending.",
  balance: "Something received, and still owing on at least one of the selected installments. The message quotes the whole balance.",
  // v2 gave this notice a settle-by date and a late-fee line. What stays true is
  // that the LEDGER never charges a late fee on carry-forward — the notice can
  // still quote one, which is what the drift warning is for.
  prevyear: "A balance carried forward from last session with something left on it. No installments; it carries its own settle-by date.",
};

/**
 * How to describe the families the SELECTED notice is not about.
 *
 * `installmentsClear` counts them, so the wording has to follow the notice: on
 * `prevyear`, "nothing pending on those installments" would be flatly wrong,
 * because that notice never looks at them.
 *
 * Read once, server-side, and passed to the workspace as a string — see the
 * `notThisNotice` prop.
 */
export const NOT_THIS_NOTICE: Record<NoticeSituation, string> = {
  upcoming: "nothing pending on the next installment, or already overdue on an earlier one",
  upcoming_final: "nothing pending on the next installment, or already overdue on an earlier one",
  fee_due: "already paid something, or nothing pending on those installments",
  balance: "nothing owing on those installments",
  late_fee_applied: "no late fee charged on any installment past its due date",
  promise_lapsed: "no lapsed promise on record, or nothing still owing against it",
  prevyear: "no balance carried forward from last session",
};

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
  /** fee_due {{4}} — e.g. "Installment 1 and 2" / "किश्त 1 एवं 2". */
  installmentPhrase?: string;
  /** fee_due {{5}} */
  amountDue?: number;
  /** balance {{4}} */
  receivedSoFar?: number;
  /** balance {{5}} */
  balanceDue?: number;
  /** {{6}} on every notice, already DD-MM-YYYY. Settle-by date on prevyear. */
  lastDate?: string;
  /** prevyear {{4}} — the session the debt came from, e.g. "2025-26". */
  prevSessionLabel?: string;
  /** prevyear {{5}} */
  prevYearBalance?: number;
  /**
   * {{7}} on every notice. Composed by `domain/late-fee.ts` from an amount and a
   * basis — never typed free-hand, and never empty: WhatsApp rejects an empty
   * parameter.
   */
  lateFeePhrase?: string;
  /**
   * `late_fee_applied` {{6}} — the late fee the LEDGER has already charged, read
   * from `v_workbook_installment_balances.late_fee_pending`. Never re-derived in
   * TypeScript, and never folded into {{5}}.
   */
  lateFeeApplied?: number;
  /**
   * `late_fee_applied` {{7}} — fees + late fee, the one figure that is a sum.
   *
   * Informational only: the builder DERIVES slot 7 from the two figures it has
   * just printed rather than reading this, so the three lines a parent reads
   * cannot disagree with each other. Carried on the type because the screen and
   * the test panel show the total alongside its parts.
   */
  totalToPay?: number;
  /** `promise_lapsed` {{4}} — the date the family gave, DD-MM-YYYY. */
  promisedDate?: string;
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
  /**
   * Has Meta approved this template AND is its AiSensy campaign Live?
   *
   * A descriptor lands here the moment its body is written, so the screen can
   * show the notice and say why it cannot be sent — but `campaignFor` refuses to
   * hand it out until an admin flips this on. Posting to a campaign that does
   * not exist yet returns `400 Campaign does not exist.`, which costs nothing
   * but tells a member of office staff nothing either.
   *
   * Explicit on all six live campaigns rather than defaulted, so adding a
   * seventh cannot inherit approval by omission.
   */
  approved: boolean;
  /**
   * Who the message is addressed to.
   *
   * `student` names one child and quotes that child's figures — every campaign
   * that exists today. `family` names the children on one phone and quotes
   * their total, which is what a parent with three children should receive
   * instead of three messages.
   *
   * Explicit rather than optional, like `approved`: a descriptor added without
   * deciding would default to addressing one child, and the failure — a family
   * quoted one sibling's balance as if it were the whole debt — is invisible
   * until a parent brings the message to the counter.
   */
  audience: "student" | "family";
};

/**
 * The templates print `कक्षा: {{3}}` / `Class: {{3}}`, and app labels are
 * `"Class 2"` — passing one straight through renders "Class: Class 2".
 *
 * Only a leading `Class ` is stripped. `Nursery`, `JKG`, `SKG` and the
 * `11 Science` family carry no prefix and must survive untouched; checked
 * against all 19 labels live in 2026-27.
 *
 * English either way, including in a Hindi message. The Meta sample transliterates
 * (`नर्सरी`), but a class label is a data value the office reads on every other
 * screen, and a hand-kept Hindi mapping goes stale the first time a class is
 * renamed.
 */
export function shortClassLabel(label: string): string {
  return String(label ?? "").replace(/^Class\s+/i, "").trim();
}

/* ------------------------------------------------------------- slot builders */

/**
 * ONE slot skeleton for all six campaigns.
 *
 * v1 had three shapes, of 6, 6 and 5. v2 collapses them: slots 1-3 and 7 mean
 * the same thing in every notice, and only 4, 5 and 6 carry situation-specific
 * content under a shared positional meaning — context line, money, date.
 *
 * The names below are the fee_due reading. `balance` puts "received so far" in
 * slot 4 and "balance due" in 5; `prevyear` puts the session label in 4 and the
 * carried balance in 5, and its slot 6 is a settle-by date rather than a due
 * date. The ORDER is what AiSensy enforces, not these names.
 */
export const SLOT_SKELETON = [
  "parentName",
  "studentName",
  "studentClass",
  "contextLine",
  "amount",
  "date",
  "lateFeePhrase",
] as const;

/**
 * The one notice that does not fit the skeleton.
 *
 * `late_fee_applied` needs three money slots — fees, late fee, total — and has
 * no room left for a date or a late-fee phrase, because the fee is no longer a
 * threat to describe: it has already been charged. Keeping it as a second named
 * skeleton rather than bending the first is what makes the difference visible in
 * `tests/unit/whatsapp-campaigns.test.ts` instead of hidden in a builder.
 */
export const LATE_FEE_APPLIED_SKELETON = [
  "parentName",
  "studentName",
  "studentClass",
  "contextLine",
  "feesPending",
  "lateFeeApplied",
  "totalToPay",
] as const;

/** Slot money is grouped digits with no symbol — the body supplies the currency word. */
function money(value: number | undefined): string {
  return formatRupeesPlain(value ?? 0);
}

/**
 * Slot 7 must never be empty — WhatsApp rejects an empty parameter, and an
 * un-composed phrase would take a whole run down at the provider. The fallback
 * is the approved "not applicable" wording, not a blank.
 */
function lateFee(v: NoticeValues, language: NoticeLanguage): string {
  const phrase = (v.lateFeePhrase ?? "").trim();
  if (phrase) return phrase;
  return language === "hi" ? "इस राशि पर लागू नहीं" : "Not applicable on this amount";
}

function feeDueParams(v: NoticeValues, language: NoticeLanguage): string[] {
  return [
    v.parentName,
    v.studentName,
    shortClassLabel(v.studentClass),
    v.installmentPhrase ?? "",
    money(v.amountDue),
    v.lastDate ?? "",
    lateFee(v, language),
  ];
}

function balanceParams(v: NoticeValues, language: NoticeLanguage): string[] {
  return [
    v.parentName,
    v.studentName,
    shortClassLabel(v.studentClass),
    money(v.receivedSoFar),
    money(v.balanceDue),
    v.lastDate ?? "",
    lateFee(v, language),
  ];
}

function prevYearParams(v: NoticeValues, language: NoticeLanguage): string[] {
  return [
    v.parentName,
    v.studentName,
    shortClassLabel(v.studentClass),
    v.prevSessionLabel ?? "",
    money(v.prevYearBalance),
    // v2 gave the previous-session notice a date it did not have. A late fee
    // with no date says nothing, which is why the two arrived together.
    v.lastDate ?? "",
    lateFee(v, language),
  ];
}

/**
 * The courtesy and firm pre-due notices reuse the fee_due slot shape exactly.
 *
 * They ask for the same seven things about the same kind of debt; what differs
 * is the wording around the late fee, which lives in the body and not in a slot.
 * Sharing the builder is what stops the two drifting into different slot orders
 * for what a parent reads as the same message twice.
 */
export function upcomingParams(v: NoticeValues, language: NoticeLanguage): string[] {
  return feeDueParams(v, language);
}

/**
 * `late_fee_applied` is the one notice that quotes three figures.
 *
 * Fees, late fee and total go in three separate slots because the ledger keeps
 * them separate: `pending_amount` is fees only, `late_fee_pending` is the late
 * fee, and only `total_pending` is the sum. A message that adds the first two
 * together would be the school's own screen disagreeing with its receipt.
 */
export function lateFeeAppliedParams(v: NoticeValues): string[] {
  const fees = Math.max(0, Math.round(Number(v.amountDue ?? 0)));
  const lateFee = Math.max(0, Math.round(Number(v.lateFeeApplied ?? 0)));
  return [
    v.parentName,
    v.studentName,
    shortClassLabel(v.studentClass),
    v.installmentPhrase ?? "",
    formatRupeesPlain(fees),
    formatRupeesPlain(lateFee),
    // ALWAYS derived from the two lines printed above it, never read from
    // `totalToPay`.
    //
    // The ledger's `total_pending` is `pending_amount + late_fee_pending` by
    // construction, so in every healthy case this is the same number. In an
    // unhealthy one it is the number that agrees with itself, and "the three
    // lines add up" is the single thing a parent checks before walking to the
    // counter to argue about it.
    formatRupeesPlain(fees + lateFee),
  ];
}

/**
 * `promise_lapsed` names the date the family gave back to them.
 *
 * Slot 4 is the promise, slot 6 the new date. That order is deliberate: the
 * message reads as a record of what was agreed before it asks for anything, and
 * it shares the skeleton with the other date-bearing notices so a builder swap
 * cannot silently reorder it.
 */
export function promiseLapsedParams(v: NoticeValues, language: NoticeLanguage): string[] {
  return [
    v.parentName,
    v.studentName,
    shortClassLabel(v.studentClass),
    v.promisedDate ?? "",
    money(v.amountDue),
    v.lastDate ?? "",
    lateFee(v, language),
  ];
}

/* ------------------------------------------------------------------- bodies */
/* Copied verbatim from docs/modules/whatsapp-campaign-registry.md. WhatsApp
   sends what Meta approved, not this text — a preview that does not match is
   worse than no preview, because staff trust it. */

const UPI = "upi://pay?pa=shriveerpattassecsch.68347408@hdfcbank";

function feeDueBodyEn(v: NoticeValues): string {
  const [p, s, c, phrase, amount, date, fee] = feeDueParams(v, "en");
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
    `Late fee after the last date: ${fee}`,
    "",
    "Paying on or before the last date avoids the late fee. After that date the late fee above is added to the amount.",
    "",
    "Pay at the school fee counter or using this UPI link:",
    UPI,
    "",
    "Please write the student's name with the payment and collect a receipt. If you have already paid, kindly ignore this message.",
    "",
    "For any query, call the office on 9352205884.",
  ].join("\n");
}

function feeDueBodyHi(v: NoticeValues): string {
  const [p, s, c, phrase, amount, date, fee] = feeDueParams(v, "hi");
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
    `अंतिम तिथि के बाद विलंब शुल्क: ${fee}`,
    "",
    "अंतिम तिथि तक फीस जमा करने पर कोई विलंब शुल्क नहीं लगेगा। उसके बाद उपरोक्त दर से विलंब शुल्क जोड़ा जाएगा।",
    "",
    "फीस काउंटर पर अथवा इस UPI लिंक से जमा करें:",
    UPI,
    "",
    "भुगतान करते समय विद्यार्थी का नाम अवश्य लिखें तथा रसीद प्राप्त करें। यदि भुगतान हो चुका है तो इस संदेश को अनदेखा करें।",
    "",
    "जानकारी हेतु कार्यालय 9352205884 पर संपर्क करें।",
  ].join("\n");
}

function balanceBodyEn(v: NoticeValues): string {
  const [p, s, c, received, balance, date, fee] = balanceParams(v, "en");
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
    `Late fee after the next date: ${fee}`,
    "",
    "Thank you for the payment received. Clearing the balance by the next date avoids the late fee.",
    "",
    "Pay at the fee counter or using this UPI link:",
    UPI,
    "",
    "If this differs from your own record, please call the office on 9352205884.",
  ].join("\n");
}

function balanceBodyHi(v: NoticeValues): string {
  const [p, s, c, received, balance, date, fee] = balanceParams(v, "hi");
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
    `अगली तिथि के बाद विलंब शुल्क: ${fee}`,
    "",
    "प्राप्त भुगतान के लिए धन्यवाद। शेष राशि अगली तिथि तक जमा करने पर कोई विलंब शुल्क नहीं लगेगा।",
    "",
    "फीस काउंटर पर अथवा इस UPI लिंक से जमा करें:",
    UPI,
    "",
    "यदि यह विवरण आपके रिकॉर्ड से भिन्न है तो कृपया कार्यालय 9352205884 पर संपर्क करें।",
  ].join("\n");
}

function prevYearBodyEn(v: NoticeValues): string {
  const [p, s, c, session, balance, date, fee] = prevYearParams(v, "en");
  return [
    "*Previous Session Balance — Shri Veer Patta Sr. Sec. School*",
    "",
    `Dear ${p},`,
    "",
    `Student: ${s}`,
    `Class: ${c}`,
    `Session: ${session}`,
    `Balance: Rs. ${balance}`, // @allow-raw-money-format: verbatim from the Meta-approved English body
    `Settle by: ${date}`,
    // A bare "Late fee:" on purpose, so the line reads correctly whether the
    // value is an amount or "not applicable".
    `Late fee: ${fee}`,
    "",
    "This amount is from the previous session and is separate from this year's installments. Please settle it by the date above.",
    "",
    "Visit the fee counter or use this UPI link:",
    UPI,
    "",
    "For a full statement, call the office on 9352205884.",
  ].join("\n");
}

function prevYearBodyHi(v: NoticeValues): string {
  const [p, s, c, session, balance, date, fee] = prevYearParams(v, "hi");
  return [
    "*पिछले सत्र का शेष — श्री वीर पत्ता सी. सै. स्कूल*",
    "",
    `प्रिय ${p},`,
    "",
    `विद्यार्थी: ${s}`,
    `कक्षा: ${c}`,
    `सत्र: ${session}`,
    `शेष राशि: रु. ${balance}`,
    `निपटान की अंतिम तिथि: ${date}`,
    `विलंब शुल्क: ${fee}`,
    "",
    "यह राशि पिछले सत्र की है और इस वर्ष की किश्तों से अलग है। कृपया उपरोक्त तिथि तक निपटान कर दें।",
    "",
    "फीस काउंटर पर आएं अथवा इस UPI लिंक का उपयोग करें:",
    UPI,
    "",
    "पूरा विवरण देखने हेतु कार्यालय 9352205884 पर संपर्क करें।",
  ].join("\n");
}

/* ----------------------------------------------------------------- registry */

/**
 * Samples exactly as submitted to Meta, so the test panel opens on something
 * real and every slot — including the new one — is exercised.
 *
 * Per LANGUAGE, not per situation. v1 shared one sample object between hi and
 * en, so the Hindi panel opened on English text and the Hindi slot values were
 * never seen before a real send.
 *
 * `studentClass` stays `"Class 2"` / `"Nursery"` rather than the doc's
 * transliteration: the sample must be what this app would really send, and
 * `shortClassLabel` does not transliterate. See its comment.
 */
/**
 * Samples for the SIX approved campaigns only.
 *
 * The pending eight keep theirs in `./campaign-bodies-v3` next to their bodies,
 * for the same bundle reason. Deliberately keyed by the three approved
 * situations rather than `NoticeSituation`: a partial `Record` over all seven
 * would let an approved campaign ship with no sample at all.
 */
const SAMPLES: Record<
  "fee_due" | "balance" | "prevyear",
  Record<NoticeLanguage, NoticeValues>
> = {
  fee_due: {
    en: {
      parentName: "Ramesh Lal Gurjar",
      studentName: "Aaradhya Gurjar",
      studentClass: "Class 2",
      installmentPhrase: "Installment 1 and 2",
      amountDue: 18250,
      lastDate: "25-08-2026",
      lateFeePhrase: "Rs. 1,000 per installment", // @allow-raw-money-format: the literal sample submitted to Meta
    },
    hi: {
      parentName: "रमेश लाल गुर्जर",
      studentName: "आराध्या गुर्जर",
      studentClass: "Class 2",
      installmentPhrase: "किश्त 1 एवं 2",
      amountDue: 18250,
      lastDate: "25-08-2026",
      lateFeePhrase: "रु. 1,000 प्रति किश्त",
    },
  },
  balance: {
    en: {
      parentName: "Ramesh Lal Gurjar",
      studentName: "Aaradhya Gurjar",
      studentClass: "Class 2",
      receivedSoFar: 6500,
      balanceDue: 11750,
      lastDate: "20-10-2026",
      lateFeePhrase: "Rs. 1,000 per installment", // @allow-raw-money-format: the literal sample submitted to Meta
    },
    hi: {
      parentName: "रमेश लाल गुर्जर",
      studentName: "आराध्या गुर्जर",
      studentClass: "Class 2",
      receivedSoFar: 6500,
      balanceDue: 11750,
      lastDate: "20-10-2026",
      lateFeePhrase: "रु. 1,000 प्रति किश्त",
    },
  },
  prevyear: {
    en: {
      parentName: "Pintu Singh Chundawat",
      studentName: "Bhavydeep Singh Chundawat",
      studentClass: "Nursery",
      prevSessionLabel: "2025-26",
      prevYearBalance: 20000,
      lastDate: "30-09-2026",
      lateFeePhrase: "Not applicable on this amount",
    },
    hi: {
      parentName: "पिंटू सिंह चुंडावत",
      studentName: "भव्यदीप सिंह चुंडावत",
      studentClass: "Nursery",
      prevSessionLabel: "2025-26",
      prevYearBalance: 20000,
      lastDate: "30-09-2026",
      lateFeePhrase: "इस राशि पर लागू नहीं",
    },
  },
};

/**
 * The six Live campaigns. `_v2` throughout: the un-suffixed six from 21 August
 * are superseded — no late-fee slot, and no settlement date on the prev-year
 * notice — and are left in AiSensy only because Meta blocks reusing a template
 * name for 30 days. The app must never point at them again.
 */
const CAMPAIGNS: CampaignDescriptor[] = [
  {
    situation: "fee_due",
    language: "hi",
    campaignName: "vpps_app_fee_due_hi_v2",
    slotOrder: SLOT_SKELETON,
    buildParams: (v) => feeDueParams(v, "hi"),
    renderPreview: feeDueBodyHi,
    sample: SAMPLES.fee_due.hi,
    approved: true,
    audience: "student",
  },
  {
    situation: "fee_due",
    language: "en",
    campaignName: "vpps_app_fee_due_en_v2",
    slotOrder: SLOT_SKELETON,
    buildParams: (v) => feeDueParams(v, "en"),
    renderPreview: feeDueBodyEn,
    sample: SAMPLES.fee_due.en,
    approved: true,
    audience: "student",
  },
  {
    situation: "balance",
    language: "hi",
    campaignName: "vpps_app_balance_hi_v2",
    slotOrder: SLOT_SKELETON,
    buildParams: (v) => balanceParams(v, "hi"),
    renderPreview: balanceBodyHi,
    sample: SAMPLES.balance.hi,
    approved: true,
    audience: "student",
  },
  {
    situation: "balance",
    language: "en",
    campaignName: "vpps_app_balance_en_v2",
    slotOrder: SLOT_SKELETON,
    buildParams: (v) => balanceParams(v, "en"),
    renderPreview: balanceBodyEn,
    sample: SAMPLES.balance.en,
    approved: true,
    audience: "student",
  },
  {
    situation: "prevyear",
    language: "hi",
    campaignName: "vpps_app_prevyear_hi_v2",
    slotOrder: SLOT_SKELETON,
    buildParams: (v) => prevYearParams(v, "hi"),
    renderPreview: prevYearBodyHi,
    sample: SAMPLES.prevyear.hi,
    approved: true,
    audience: "student",
  },
  {
    situation: "prevyear",
    language: "en",
    campaignName: "vpps_app_prevyear_en_v2",
    slotOrder: SLOT_SKELETON,
    buildParams: (v) => prevYearParams(v, "en"),
    renderPreview: prevYearBodyEn,
    sample: SAMPLES.prevyear.en,
    approved: true,
    audience: "student",
  },

];

/**
 * The notices whose bodies are written but which Meta has not approved.
 *
 * A NAME and a situation, nothing more. The full descriptors — bodies, samples
 * and all — live in `./campaign-bodies-v3`, which this file deliberately does
 * NOT import.
 *
 * The reason is the browser. This module is client-reachable, because the screen
 * previews the message live as staff type. But a preview is only ever rendered
 * for a campaign `campaignFor` returned, and `campaignFor` returns approved
 * campaigns only — so eight unapproved bodies in Hindi and English would be
 * ~2.4 KB gzip of provably dead text on every load of the send screen, against a
 * ceiling in `quality/route-bundle-baseline.json` that only ratchets down.
 *
 * What the client genuinely needs is this table: enough to show the chip,
 * disable it, and name the campaign an admin has to approve.
 */
const PENDING_CAMPAIGNS = [
  { situation: "upcoming", language: "hi", campaignName: "vpps_app_upcoming_hi_v3" },
  { situation: "upcoming", language: "en", campaignName: "vpps_app_upcoming_en_v3" },
  { situation: "upcoming_final", language: "hi", campaignName: "vpps_app_upcoming_final_hi_v3" },
  { situation: "upcoming_final", language: "en", campaignName: "vpps_app_upcoming_final_en_v3" },
  { situation: "late_fee_applied", language: "hi", campaignName: "vpps_app_late_fee_applied_hi_v3" },
  { situation: "late_fee_applied", language: "en", campaignName: "vpps_app_late_fee_applied_en_v3" },
  { situation: "promise_lapsed", language: "hi", campaignName: "vpps_app_promise_lapsed_hi_v3" },
  { situation: "promise_lapsed", language: "en", campaignName: "vpps_app_promise_lapsed_en_v3" },
] as const satisfies ReadonlyArray<{
  situation: NoticeSituation;
  language: NoticeLanguage;
  campaignName: string;
}>;


/**
 * The six sendable descriptors, with their bodies.
 *
 * `ALL_CAMPAIGNS` — the union including the pending eight — lives in
 * `./campaign-bodies-v3`, because assembling it here would pull those bodies
 * back into the client bundle.
 */
export const APPROVED_CAMPAIGNS: readonly CampaignDescriptor[] = CAMPAIGNS.filter(
  (entry) => entry.approved,
);

/**
 * Is there a sendable campaign for this notice in this language?
 *
 * The screen asks before rendering the chip enabled, so the office learns a
 * notice is not ready before pressing Send rather than from a provider error.
 */
export function isCampaignApproved(
  situation: NoticeSituation,
  language: NoticeLanguage,
): boolean {
  return CAMPAIGNS.some(
    (entry) =>
      entry.situation === situation && entry.language === language && entry.approved,
  );
}

/**
 * The campaign NAME for a notice, approved or not.
 *
 * The send log is keyed on the campaign name, so the screen needs one even for a
 * notice it cannot send — otherwise "already messaged today" would be answered
 * against an empty string and every family would read as un-messaged.
 *
 * Returns null for a combination that is not registered at all, which is a bug
 * rather than a Tuesday.
 */
export function campaignNameFor(
  situation: NoticeSituation,
  language: NoticeLanguage,
): string | null {
  const approved = CAMPAIGNS.find(
    (entry) => entry.situation === situation && entry.language === language,
  );
  if (approved) return approved.campaignName;
  const pending = PENDING_CAMPAIGNS.find(
    (entry) => entry.situation === situation && entry.language === language,
  );
  return pending?.campaignName ?? null;
}

/**
 * The one way to get from a notice + a language to a SENDABLE campaign.
 *
 * Throws rather than falling back, twice over. A lookup miss falling back would
 * quietly send through the wrong template — a parent reading a balance notice
 * for a fee they have not been billed. An unapproved campaign falling through
 * would post to a name AiSensy does not have, which is free but reaches nobody
 * while the run records an attempt.
 *
 * The two errors are worded differently on purpose: "no campaign" is a bug,
 * "awaiting approval" is a Tuesday.
 */
export function campaignFor(
  situation: NoticeSituation,
  language: NoticeLanguage,
): CampaignDescriptor {
  const found = CAMPAIGNS.find(
    (entry) => entry.situation === situation && entry.language === language && entry.approved,
  );
  if (found) return found;

  // Written but not approved: a different failure with a different fix, so it
  // says so rather than reading as a missing registry entry.
  const pending = PENDING_CAMPAIGNS.find(
    (entry) => entry.situation === situation && entry.language === language,
  );
  if (pending) {
    throw new Error(
      `The ${situation} notice is awaiting Meta approval. Approve ${pending.campaignName} in Admin Tools once it is Live in AiSensy.`,
    );
  }

  throw new Error(`No WhatsApp campaign is registered for ${situation} in ${language}.`);
}

/**
 * One family plus one set of screen settings, projected onto slot values.
 *
 * THE one place this mapping exists. It used to live twice — once in
 * `fee-reminders.ts` for the send and once inline in `reminders-workspace.tsx`
 * for the preview — and the copies drifted the moment slot 7 arrived: the
 * preview quoted "not applicable" while the send carried the real late fee, so
 * the screen showed staff a message that was not the one going out.
 *
 * The parameters are structural rather than `ReminderCandidate` / `ReminderFilters`
 * so this stays importable from the browser; those types live in a `server-only`
 * module and this file must not reach it.
 */
export type NoticeSubject = {
  parentName: string;
  studentName: string;
  studentClass: string;
  dueAmount: number;
  totalPaid: number;
  balanceDue: number;
  prevYearBalance: number;
  prevSessionLabel: string | null;
  /**
   * What the LEDGER has already charged in late fees on the passed installments,
   * from `v_workbook_installment_balances.late_fee_pending`.
   *
   * Optional because only `late_fee_applied` reads it, and zero rather than
   * undefined for a family with no late fee — the notice would not be about them
   * either way, but a missing figure must not render as an empty money slot.
   */
  lateFeeApplied?: number;
  /** The date this family gave, ISO. Only `promise_lapsed` reads it. */
  promisedOn?: string | null;
};

export type NoticeSettings = {
  situation: NoticeSituation;
  language: NoticeLanguage;
  installments: number[];
  lastDate: string;
  lateFeeAmount: number;
  lateFeeBasis: LateFeeBasis;
};

export function noticeValuesFrom(
  subject: NoticeSubject,
  settings: NoticeSettings,
): NoticeValues {
  return {
    parentName: subject.parentName,
    studentName: subject.studentName,
    studentClass: subject.studentClass,
    installmentPhrase: installmentPhrase(settings.installments, settings.language),
    amountDue: subject.dueAmount,
    receivedSoFar: subject.totalPaid,
    balanceDue: subject.balanceDue,
    lastDate: settings.lastDate,
    prevSessionLabel: subject.prevSessionLabel ?? "",
    prevYearBalance: subject.prevYearBalance,
    lateFeePhrase: lateFeePhrase(settings.lateFeeAmount, settings.lateFeeBasis, settings.language),
    // The ledger's figure, passed through untouched. `late_fee_applied` is the
    // one notice whose late fee is a fact rather than a lever, so it never goes
    // through `lateFeePhrase` and the screen does not let it be edited.
    lateFeeApplied: subject.lateFeeApplied ?? 0,
    totalToPay: subject.dueAmount + (subject.lateFeeApplied ?? 0),
    promisedDate: formatDdMmYyyy(subject.promisedOn ?? null),
  };
}

/**
 * "Installment 1 and 2" / "किश्त 1 एवं 2" — what the fee_due template's {{4}}
 * says, built from the installments actually selected rather than hardcoded.
 *
 * Language-aware, because the Hindi template's approved sample is
 * `किश्त 1 एवं 2`. Without this a Hindi message reads `किश्त: Installment 1 and 2`,
 * which is what v1 sent. Unlike the class label this is a phrase the app
 * composes, not a data value the office reads elsewhere, so there is nothing to
 * keep in step.
 */
export function installmentPhrase(
  installments: number[],
  language: NoticeLanguage = "en",
): string {
  const hindi = language === "hi";
  const word = hindi ? "किश्त" : "Installment";
  const and = hindi ? "एवं" : "and";

  const sorted = [...new Set(installments)].sort((a, b) => a - b);
  if (sorted.length === 0) return `${word} 1 ${and} 2`;
  if (sorted.length === 1) return `${word} ${sorted[0]}`;
  const last = sorted[sorted.length - 1];
  return `${word} ${sorted.slice(0, -1).join(", ")} ${and} ${last}`;
}
