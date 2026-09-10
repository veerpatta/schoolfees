import { formatDdMmYyyy } from "@/platform/helpers/date";
import { formatRupeesPlain } from "@/platform/helpers/currency";
import {
  lateFeePhrase,
  type LateFeeBasis,
  type LateFeeSource,
} from "@/modules/whatsapp/domain/late-fee";

/**
 * The per-student WhatsApp campaigns: twelve fee situations × two languages.
 *
 * All twenty-four are Live — six `_v2` since 22 Aug 2026, eight `_v3` since
 * 2026-09-04, ten `_v4` since 2026-09-08. A descriptor for a template Meta has
 * not approved carries `approved: false` until its AiSensy campaign is Live.
 *
 * One place where a notice's campaign name, slot order, param builder and
 * Meta-submitted sample sit together, so they cannot drift apart. The written
 * contract is `docs/modules/whatsapp-campaign-registry.md` — slot orders here
 * are copied from it, and it wins if the two ever disagree.
 *
 * The BODIES are not here. They live in `./campaign-bodies`, which no `ui/` or
 * `src/app` file may import: this module is client-reachable (the picker, the
 * workspace and the test panel need names, slot orders and samples), and
 * twenty-four bodies in two languages would be kilobytes of text the browser
 * never renders, against a route ceiling that only ratchets down. The send
 * screen's preview and the test panel's preview are both rendered on the
 * server.
 *
 * Deliberately free of `server-only`, and it must never value-import
 * `../data/aisensy` — that is both a `server-only` edge that fails the build
 * and a `domain-is-not-pure` violation.
 *
 * Campaign name equals template name in every case, so one string drives both.
 * All are category UTILITY at ~₹0.145 a message. Meta re-categorises silently
 * — `vpps_waiver_offer_hinglish` went UTILITY → MARKETING fourteen minutes
 * after submission on promotional wording, a 7.5× cost move — so none of these
 * sells anything, and every send is logged with its `campaign_name` so the bill
 * can be reconciled per campaign.
 */

export type NoticeSituation =
  | "fee_due"
  | "balance"
  | "prevyear"
  | "upcoming"
  | "upcoming_final"
  | "late_fee_applied"
  | "promise_lapsed"
  | "late_fee_waiver"
  | "waiver_last_call"
  | "overdue_final"
  | "promise_due"
  | "exam_clearance";
export type NoticeLanguage = "hi" | "en";

/**
 * Chip order on the screen: the calendar's own sequence, courtesy to firm to
 * charged to forgiven, with the promise pair together and the two that stand
 * apart (exams, last session) at the end.
 */
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
    value: "overdue_final",
    label: "Overdue final",
    hint: "Fees still pending on an installment whose date has passed, named with a final date",
  },
  {
    value: "late_fee_applied",
    label: "Late fee applied",
    hint: "A due date has passed and the ledger is charging a late fee",
  },
  {
    value: "late_fee_waiver",
    label: "Waiver window",
    hint: "The ledger's late fee is set aside if the fees arrive by the date on the message",
  },
  {
    value: "waiver_last_call",
    label: "Waiver last call",
    hint: "The same families, on the last day the waiver holds",
  },
  {
    value: "promise_due",
    label: "Promise due",
    hint: "The date the family gave is today or tomorrow — what was agreed, read back",
  },
  {
    value: "promise_lapsed",
    label: "Promise lapsed",
    hint: "The date the family gave has passed and nothing has come in",
  },
  {
    value: "exam_clearance",
    label: "Exam clearance",
    hint: "Anyone still owing on the selected installments, before the examinations",
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

export const DEFAULT_SITUATION: NoticeSituation = "fee_due";
export const DEFAULT_LANGUAGE: NoticeLanguage = "hi";

/**
 * The notices whose late fee is the LEDGER's figure, per family, rather than
 * the lever the office sets per run.
 *
 * On these the screen disables the late-fee control, `describeLateFeeDrift`
 * has nothing to warn about, and the context line names the installments the
 * ledger says carry the fee. Read from `v_workbook_installment_balances`, never
 * re-derived: the view is the only thing that knows about waivers and the
 * accrual rule at once.
 */
export const LEDGER_QUOTED_SITUATIONS = [
  "late_fee_applied",
  "late_fee_waiver",
  "waiver_last_call",
] as const satisfies readonly NoticeSituation[];

export function isLedgerQuotedSituation(situation: string): boolean {
  return (LEDGER_QUOTED_SITUATIONS as readonly string[]).includes(situation);
}

/**
 * The notices that print NO run-wide date, so the date guard has nothing to
 * check and the screen has no date field to show.
 *
 * `late_fee_applied` has no date slot at all — the fee is charged, not
 * threatened. `promise_due` has one, but it is each family's OWN promised date
 * from the contact log, never the office's pick for the run.
 */
export const RUN_DATE_FREE_SITUATIONS = [
  "late_fee_applied",
  "promise_due",
] as const satisfies readonly NoticeSituation[];

export function isRunDateFreeSituation(situation: string): boolean {
  return (RUN_DATE_FREE_SITUATIONS as readonly string[]).includes(situation);
}

/**
 * How far ahead `promise_due` looks: the promised date is today or tomorrow.
 * Any earlier and the family is inside a promise the office chose to trust;
 * any later and it is `promise_lapsed`'s business.
 */
export const PROMISE_DUE_LOOKAHEAD_DAYS = 1;

/**
 * `SITUATION_FILTERS`, `SITUATION_RULE` and `NOT_THIS_NOTICE` lived here until
 * 2026-09-08.
 *
 * All three answered the same question — "which families is this notice about,
 * and which controls therefore matter" — and the answer was a property of the
 * notice. It is not one any more: `domain/audience.ts` decides who is on the
 * list, and the notice decides only what the message says. `SITUATION_FILTERS`
 * in particular HID the installment, paid-so-far and minimum controls on any
 * notice whose rule ignored them, which was honest while the notice gated the
 * audience and a cage the moment it stopped.
 *
 * What replaced each of them:
 *
 * - `SITUATION_FILTERS` → nothing. Every filter shows on every template.
 * - `SITUATION_RULE` → a sentence composed from the FILTERS, on the send page.
 * - `NOT_THIS_NOTICE` → "did not match these filters", one wording for all.
 * - The audiences themselves → `presetFor`, as one-tap starting points — and
 *   on 2026-09-10 those went too, along with `TEMPLATE_INSTALLMENTS` and the
 *   per-notice `contextInstallments`. The audience is the installment tiles
 *   now, and slot {{4}} names the tiles the office selected on every notice.
 *
 * The per-notice table that remains is `NOTICE_FACTS` in `domain/audience.ts`:
 * which of a template's SLOTS need a fact the family may not have. That is a
 * genuine property of a message, and it is what the chips warn about now.
 */

export const SITUATION_VALUES: readonly string[] = NOTICE_SITUATIONS.map((s) => s.value);
export const LANGUAGE_VALUES: readonly string[] = NOTICE_LANGUAGES.map((l) => l.value);

export function isNoticeSituation(value: unknown): value is NoticeSituation {
  return typeof value === "string" && SITUATION_VALUES.includes(value);
}

export function isNoticeLanguage(value: unknown): value is NoticeLanguage {
  return typeof value === "string" && LANGUAGE_VALUES.includes(value);
}

/**
 * Everything any of the slot sets can need. Each builder takes only what its
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
  /**
   * {{6}} on every notice, already DD-MM-YYYY. Settle-by date on prevyear; the
   * waive-by date in slot 7 on the two waiver notices; the family's OWN
   * promised date on `promise_due`.
   */
  lastDate?: string;
  /** prevyear {{4}} — the session the debt came from, e.g. "2025-26". */
  prevSessionLabel?: string;
  /** prevyear {{5}} */
  prevYearBalance?: number;
  /**
   * {{7}} on every shared-skeleton notice. Composed by `domain/late-fee.ts`
   * from an amount and a basis — never typed free-hand, and never empty:
   * WhatsApp rejects an empty parameter.
   */
  lateFeePhrase?: string;
  /**
   * `late_fee_applied` {{6}}, and {{6}} on the two waiver notices — the late
   * fee the LEDGER has already charged, read from
   * `v_workbook_installment_balances.late_fee_pending`. Never re-derived in
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
  /** `promise_due` {{4}} — the day the office spoke with the family, DD-MM-YYYY. */
  promiseRecordedDate?: string;
};

export type CampaignDescriptor = {
  situation: NoticeSituation;
  language: NoticeLanguage;
  /** Campaign name, which is also the template name. */
  campaignName: string;
  /** Slot names in order. Its length IS the slot count AiSensy enforces. */
  slotOrder: readonly string[];
  buildParams(values: NoticeValues): string[];
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
   * Explicit on every descriptor rather than defaulted, so adding one cannot
   * inherit approval by omission.
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
 * ONE slot skeleton for most campaigns.
 *
 * v1 had three shapes, of 6, 6 and 5. v2 collapsed them: slots 1-3 and 7 mean
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
 * The first notice that does not fit the skeleton.
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

/**
 * The third shape, for the two waiver notices.
 *
 * Fees and the ledger's late fee in two slots, then the waive-by DATE in slot
 * 7 where every other notice carries a late-fee phrase. There is no phrase
 * because the fee is a fact on the account, not a lever the office sets — and
 * no total, because the whole point is that the family need not pay it.
 */
export const WAIVER_SKELETON = [
  "parentName",
  "studentName",
  "studentClass",
  "contextLine",
  "feesPending",
  "lateFeeApplied",
  "date",
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
 * The courtesy and firm pre-due notices, the overdue final notice and the exam
 * clearance notice all reuse the fee_due slot shape exactly.
 *
 * They ask for the same seven things about the same kind of debt; what differs
 * is the wording around them, which lives in the body and not in a slot.
 * Sharing the builder is what stops them drifting into different slot orders
 * for what a parent reads as the same message in a different tone.
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
 * The two waiver notices: the ledger's two figures, then the waive-by date.
 *
 * Shared between `late_fee_waiver` and `waiver_last_call` exactly as
 * `upcomingParams` is shared between the courtesy and firm pre-due notices, so
 * the two cannot drift into different orders for what a parent reads as the
 * same message on two days.
 */
export function waiverParams(v: NoticeValues): string[] {
  const fees = Math.max(0, Math.round(Number(v.amountDue ?? 0)));
  const lateFee = Math.max(0, Math.round(Number(v.lateFeeApplied ?? 0)));
  return [
    v.parentName,
    v.studentName,
    shortClassLabel(v.studentClass),
    v.installmentPhrase ?? "",
    formatRupeesPlain(fees),
    formatRupeesPlain(lateFee),
    v.lastDate ?? "",
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

/**
 * `promise_due` reads the promise back BEFORE the date: slot 4 is the day the
 * office spoke with the family, slot 6 the date they gave. `noticeValuesFrom`
 * puts the family's own promised date in `lastDate` for this notice, so the
 * run's date never reaches the message.
 */
export function promiseDueParams(v: NoticeValues, language: NoticeLanguage): string[] {
  return [
    v.parentName,
    v.studentName,
    shortClassLabel(v.studentClass),
    v.promiseRecordedDate ?? "",
    money(v.amountDue),
    v.lastDate ?? "",
    lateFee(v, language),
  ];
}

/* ----------------------------------------------------------------- registry */

/**
 * Samples exactly as submitted to Meta, so the test panel opens on something
 * real and every slot is exercised.
 *
 * Per LANGUAGE, not per situation. v1 shared one sample object between hi and
 * en, so the Hindi panel opened on English text and the Hindi slot values were
 * never seen before a real send.
 *
 * `studentClass` stays `"Class 2"` / `"Nursery"` rather than the doc's
 * transliteration: the sample must be what this app would really send, and
 * `shortClassLabel` does not transliterate. See its comment.
 *
 * A FULL record over `NoticeSituation`, on purpose: a situation added without a
 * sample fails typecheck here rather than shipping a campaign whose test panel
 * opens on nothing.
 */
const SAMPLES: Record<NoticeSituation, Record<NoticeLanguage, NoticeValues>> = {
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
  upcoming: {
    en: {
      parentName: "Ramesh Lal Gurjar",
      studentName: "Aaradhya Gurjar",
      studentClass: "Class 2",
      installmentPhrase: "Installment 3",
      amountDue: 9125,
      lastDate: "20-10-2026",
      lateFeePhrase: "Rs. 1,000 per installment", // @allow-raw-money-format: the literal sample submitted to Meta
    },
    hi: {
      parentName: "रमेश लाल गुर्जर",
      studentName: "आराध्या गुर्जर",
      studentClass: "Class 2",
      installmentPhrase: "किश्त 3",
      amountDue: 9125,
      lastDate: "20-10-2026",
      lateFeePhrase: "रु. 1,000 प्रति किश्त",
    },
  },
  upcoming_final: {
    en: {
      parentName: "Ramesh Lal Gurjar",
      studentName: "Aaradhya Gurjar",
      studentClass: "Class 2",
      installmentPhrase: "Installment 3",
      amountDue: 9125,
      lastDate: "20-10-2026",
      lateFeePhrase: "Rs. 1,000 per installment", // @allow-raw-money-format: the literal sample submitted to Meta
    },
    hi: {
      parentName: "रमेश लाल गुर्जर",
      studentName: "आराध्या गुर्जर",
      studentClass: "Class 2",
      installmentPhrase: "किश्त 3",
      amountDue: 9125,
      lastDate: "20-10-2026",
      lateFeePhrase: "रु. 1,000 प्रति किश्त",
    },
  },
  late_fee_applied: {
    // The three figures are a real shape from the ledger: fees, the flat ₹1,000
    // the policy charges once a date passes, and their sum. A sample where the
    // total did not add up would be the first thing a reviewer at Meta noticed.
    en: {
      parentName: "Ramesh Lal Gurjar",
      studentName: "Aaradhya Gurjar",
      studentClass: "Class 2",
      installmentPhrase: "Installment 2",
      amountDue: 9125,
      lateFeeApplied: 1000,
      totalToPay: 10125,
    },
    hi: {
      parentName: "रमेश लाल गुर्जर",
      studentName: "आराध्या गुर्जर",
      studentClass: "Class 2",
      installmentPhrase: "किश्त 2",
      amountDue: 9125,
      lateFeeApplied: 1000,
      totalToPay: 10125,
    },
  },
  promise_lapsed: {
    en: {
      parentName: "Ramesh Lal Gurjar",
      studentName: "Aaradhya Gurjar",
      studentClass: "Class 2",
      promisedDate: "28-08-2026",
      amountDue: 9125,
      lastDate: "10-09-2026",
      lateFeePhrase: "Rs. 1,000 per installment", // @allow-raw-money-format: the literal sample submitted to Meta
    },
    hi: {
      parentName: "रमेश लाल गुर्जर",
      studentName: "आराध्या गुर्जर",
      studentClass: "Class 2",
      promisedDate: "28-08-2026",
      amountDue: 9125,
      lastDate: "10-09-2026",
      lateFeePhrase: "रु. 1,000 प्रति किश्त",
    },
  },
  late_fee_waiver: {
    // The same ledger shape as `late_fee_applied`, with the waive-by date where
    // that notice prints the total.
    en: {
      parentName: "Ramesh Lal Gurjar",
      studentName: "Aaradhya Gurjar",
      studentClass: "Class 2",
      installmentPhrase: "Installment 2",
      amountDue: 9125,
      lateFeeApplied: 1000,
      lastDate: "20-09-2026",
    },
    hi: {
      parentName: "रमेश लाल गुर्जर",
      studentName: "आराध्या गुर्जर",
      studentClass: "Class 2",
      installmentPhrase: "किश्त 2",
      amountDue: 9125,
      lateFeeApplied: 1000,
      lastDate: "20-09-2026",
    },
  },
  waiver_last_call: {
    en: {
      parentName: "Ramesh Lal Gurjar",
      studentName: "Aaradhya Gurjar",
      studentClass: "Class 2",
      installmentPhrase: "Installment 2",
      amountDue: 9125,
      lateFeeApplied: 1000,
      lastDate: "20-09-2026",
    },
    hi: {
      parentName: "रमेश लाल गुर्जर",
      studentName: "आराध्या गुर्जर",
      studentClass: "Class 2",
      installmentPhrase: "किश्त 2",
      amountDue: 9125,
      lateFeeApplied: 1000,
      lastDate: "20-09-2026",
    },
  },
  overdue_final: {
    en: {
      parentName: "Ramesh Lal Gurjar",
      studentName: "Aaradhya Gurjar",
      studentClass: "Class 2",
      installmentPhrase: "Installment 2",
      amountDue: 9125,
      lastDate: "20-09-2026",
      lateFeePhrase: "Rs. 1,000 per installment", // @allow-raw-money-format: the literal sample submitted to Meta
    },
    hi: {
      parentName: "रमेश लाल गुर्जर",
      studentName: "आराध्या गुर्जर",
      studentClass: "Class 2",
      installmentPhrase: "किश्त 2",
      amountDue: 9125,
      lastDate: "20-09-2026",
      lateFeePhrase: "रु. 1,000 प्रति किश्त",
    },
  },
  promise_due: {
    en: {
      parentName: "Ramesh Lal Gurjar",
      studentName: "Aaradhya Gurjar",
      studentClass: "Class 2",
      promiseRecordedDate: "05-09-2026",
      amountDue: 9125,
      lastDate: "10-09-2026",
      lateFeePhrase: "Rs. 1,000 per installment", // @allow-raw-money-format: the literal sample submitted to Meta
    },
    hi: {
      parentName: "रमेश लाल गुर्जर",
      studentName: "आराध्या गुर्जर",
      studentClass: "Class 2",
      promiseRecordedDate: "05-09-2026",
      amountDue: 9125,
      lastDate: "10-09-2026",
      lateFeePhrase: "रु. 1,000 प्रति किश्त",
    },
  },
  exam_clearance: {
    en: {
      parentName: "Ramesh Lal Gurjar",
      studentName: "Aaradhya Gurjar",
      studentClass: "Class 2",
      installmentPhrase: "Installment 1 and 2",
      amountDue: 9125,
      lastDate: "15-09-2026",
      lateFeePhrase: "Rs. 1,000 per installment", // @allow-raw-money-format: the literal sample submitted to Meta
    },
    hi: {
      parentName: "रमेश लाल गुर्जर",
      studentName: "आराध्या गुर्जर",
      studentClass: "Class 2",
      installmentPhrase: "किश्त 1 एवं 2",
      amountDue: 9125,
      lastDate: "15-09-2026",
      lateFeePhrase: "रु. 1,000 प्रति किश्त",
    },
  },
};

/**
 * Every per-student campaign.
 *
 * `_v2` six, Live since 22 Aug: the un-suffixed six from 21 August are
 * superseded — no late-fee slot, and no settlement date on the prev-year notice
 * — and are left in AiSensy only because Meta blocks reusing a template name
 * for 30 days. The app must never point at them again.
 *
 * `_v3` eight, approved by Meta and Live in AiSensy on 2026-09-04: the four
 * calendar-driven notices in both languages.
 *
 * `_v4` ten, submitted to Meta on 2026-09-08 and approved the same day, each
 * with an API campaign of the same name set Live: the late-fee waiver pair,
 * the overdue final notice, the promise-due reminder and the exam clearance
 * notice. `approved` is pinned per name by `APPROVED_NAMES` in the test.
 */
const CAMPAIGNS: CampaignDescriptor[] = [
  {
    situation: "fee_due",
    language: "hi",
    campaignName: "vpps_app_fee_due_hi_v2",
    slotOrder: SLOT_SKELETON,
    buildParams: (v) => feeDueParams(v, "hi"),
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
    sample: SAMPLES.prevyear.en,
    approved: true,
    audience: "student",
  },

  {
    situation: "upcoming",
    language: "hi",
    campaignName: "vpps_app_upcoming_hi_v3",
    slotOrder: SLOT_SKELETON,
    buildParams: (v) => upcomingParams(v, "hi"),
    sample: SAMPLES.upcoming.hi,
    approved: true,
    audience: "student",
  },
  {
    situation: "upcoming",
    language: "en",
    campaignName: "vpps_app_upcoming_en_v3",
    slotOrder: SLOT_SKELETON,
    buildParams: (v) => upcomingParams(v, "en"),
    sample: SAMPLES.upcoming.en,
    approved: true,
    audience: "student",
  },
  {
    situation: "upcoming_final",
    language: "hi",
    campaignName: "vpps_app_upcoming_final_hi_v3",
    slotOrder: SLOT_SKELETON,
    buildParams: (v) => upcomingParams(v, "hi"),
    sample: SAMPLES.upcoming_final.hi,
    approved: true,
    audience: "student",
  },
  {
    situation: "upcoming_final",
    language: "en",
    campaignName: "vpps_app_upcoming_final_en_v3",
    slotOrder: SLOT_SKELETON,
    buildParams: (v) => upcomingParams(v, "en"),
    sample: SAMPLES.upcoming_final.en,
    approved: true,
    audience: "student",
  },
  {
    situation: "late_fee_applied",
    language: "hi",
    campaignName: "vpps_app_late_fee_applied_hi_v3",
    slotOrder: LATE_FEE_APPLIED_SKELETON,
    buildParams: lateFeeAppliedParams,
    sample: SAMPLES.late_fee_applied.hi,
    approved: true,
    audience: "student",
  },
  {
    situation: "late_fee_applied",
    language: "en",
    campaignName: "vpps_app_late_fee_applied_en_v3",
    slotOrder: LATE_FEE_APPLIED_SKELETON,
    buildParams: lateFeeAppliedParams,
    sample: SAMPLES.late_fee_applied.en,
    approved: true,
    audience: "student",
  },
  {
    situation: "promise_lapsed",
    language: "hi",
    campaignName: "vpps_app_promise_lapsed_hi_v3",
    slotOrder: SLOT_SKELETON,
    buildParams: (v) => promiseLapsedParams(v, "hi"),
    sample: SAMPLES.promise_lapsed.hi,
    approved: true,
    audience: "student",
  },
  {
    situation: "promise_lapsed",
    language: "en",
    campaignName: "vpps_app_promise_lapsed_en_v3",
    slotOrder: SLOT_SKELETON,
    buildParams: (v) => promiseLapsedParams(v, "en"),
    sample: SAMPLES.promise_lapsed.en,
    approved: true,
    audience: "student",
  },

  /* The `_v4` ten, Live since 2026-09-08 — see the file header. */
  {
    situation: "late_fee_waiver",
    language: "hi",
    campaignName: "vpps_app_late_fee_waiver_hi_v4",
    slotOrder: WAIVER_SKELETON,
    buildParams: waiverParams,
    sample: SAMPLES.late_fee_waiver.hi,
    approved: true,
    audience: "student",
  },
  {
    situation: "late_fee_waiver",
    language: "en",
    campaignName: "vpps_app_late_fee_waiver_en_v4",
    slotOrder: WAIVER_SKELETON,
    buildParams: waiverParams,
    sample: SAMPLES.late_fee_waiver.en,
    approved: true,
    audience: "student",
  },
  {
    situation: "waiver_last_call",
    language: "hi",
    campaignName: "vpps_app_waiver_last_call_hi_v4",
    slotOrder: WAIVER_SKELETON,
    buildParams: waiverParams,
    sample: SAMPLES.waiver_last_call.hi,
    approved: true,
    audience: "student",
  },
  {
    situation: "waiver_last_call",
    language: "en",
    campaignName: "vpps_app_waiver_last_call_en_v4",
    slotOrder: WAIVER_SKELETON,
    buildParams: waiverParams,
    sample: SAMPLES.waiver_last_call.en,
    approved: true,
    audience: "student",
  },
  {
    situation: "overdue_final",
    language: "hi",
    campaignName: "vpps_app_overdue_final_hi_v4",
    slotOrder: SLOT_SKELETON,
    buildParams: (v) => upcomingParams(v, "hi"),
    sample: SAMPLES.overdue_final.hi,
    approved: true,
    audience: "student",
  },
  {
    situation: "overdue_final",
    language: "en",
    campaignName: "vpps_app_overdue_final_en_v4",
    slotOrder: SLOT_SKELETON,
    buildParams: (v) => upcomingParams(v, "en"),
    sample: SAMPLES.overdue_final.en,
    approved: true,
    audience: "student",
  },
  {
    situation: "promise_due",
    language: "hi",
    campaignName: "vpps_app_promise_due_hi_v4",
    slotOrder: SLOT_SKELETON,
    buildParams: (v) => promiseDueParams(v, "hi"),
    sample: SAMPLES.promise_due.hi,
    approved: true,
    audience: "student",
  },
  {
    situation: "promise_due",
    language: "en",
    campaignName: "vpps_app_promise_due_en_v4",
    slotOrder: SLOT_SKELETON,
    buildParams: (v) => promiseDueParams(v, "en"),
    sample: SAMPLES.promise_due.en,
    approved: true,
    audience: "student",
  },
  {
    situation: "exam_clearance",
    language: "hi",
    campaignName: "vpps_app_exam_clearance_hi_v4",
    slotOrder: SLOT_SKELETON,
    buildParams: (v) => upcomingParams(v, "hi"),
    sample: SAMPLES.exam_clearance.hi,
    approved: true,
    audience: "student",
  },
  {
    situation: "exam_clearance",
    language: "en",
    campaignName: "vpps_app_exam_clearance_en_v4",
    slotOrder: SLOT_SKELETON,
    buildParams: (v) => upcomingParams(v, "en"),
    sample: SAMPLES.exam_clearance.en,
    approved: true,
    audience: "student",
  },
];

/**
 * Every registered per-student campaign, approved or not.
 *
 * The contract test walks this rather than the approved list so a pending
 * descriptor still has its slot count and order checked. Since the bodies moved
 * to `./campaign-bodies` a pending descriptor costs the browser a name, a slot
 * order and a sample — which is exactly what the picker needs to show its chip
 * disabled and say which campaign is not Live yet.
 */
export const ALL_CAMPAIGNS: readonly CampaignDescriptor[] = CAMPAIGNS;

/** The sendable descriptors. */
export const APPROVED_CAMPAIGNS: readonly CampaignDescriptor[] = CAMPAIGNS.filter(
  (entry) => entry.approved,
);

/**
 * The descriptor for a notice regardless of approval, or null when none is
 * registered. For tests, the preview and the test panel. Never a path to
 * sending: use `campaignFor`.
 */
export function describeCampaign(
  situation: NoticeSituation,
  language: NoticeLanguage,
): CampaignDescriptor | null {
  return (
    CAMPAIGNS.find((entry) => entry.situation === situation && entry.language === language) ??
    null
  );
}

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
  return describeCampaign(situation, language)?.campaignName ?? null;
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
  const found = describeCampaign(situation, language);
  if (found?.approved) return found;

  // Written but not approved: a different failure with a different fix, so it
  // says so rather than reading as a missing registry entry.
  if (found) {
    throw new Error(
      `The ${situation} notice is awaiting Meta approval: ${found.campaignName} is written but not Live yet. It cannot be sent until the template is approved in AiSensy and the app's campaign registry marks it approved.`,
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
   * Optional because only the ledger-quoted notices read it, and zero rather
   * than undefined for a family with no late fee — the notice would not be
   * about them either way, but a missing figure must not render as an empty
   * money slot.
   */
  lateFeeApplied?: number;
  /**
   * The installments actually carrying that late fee — the ledger-quoted
   * notices' context line names THESE, not the run's active set. On 2026-09-04
   * the calendar's active pair was [1, 2]; a family late only on installment 2
   * must not be told "Installment 1 and 2".
   */
  lateFeeInstallments?: number[];
  /**
   * The passed installments this family still owes fees on — `overdue_final`
   * names these, for the same reason.
   */
  overdueInstallments?: number[];
  /** The date this family gave, ISO. `promise_lapsed` and `promise_due` read it. */
  promisedOn?: string | null;
  /** The IST date the office spoke with the family, ISO. Only `promise_due` reads it. */
  promiseContactedOn?: string | null;
};

export type NoticeSettings = {
  situation: NoticeSituation;
  language: NoticeLanguage;
  /** The selected tiles. Slot {{4}} names exactly these, on every notice. */
  installments: number[];
  /**
   * The Last-year tile. Slot {{4}} names the previous session instead of an
   * installment, because that balance has no installment to name.
   */
  lastYear?: boolean;
  lastDate: string;
  lateFeeAmount: number;
  lateFeeBasis: LateFeeBasis;
  /**
   * Which of the two late-fee modes this run is in — see `LateFeeSource`.
   *
   * Optional so a caller written before 2026-09-10 keeps the behaviour it had:
   * absent means the template decides, which is exactly what
   * `isLedgerQuotedSituation` used to do on its own.
   */
  lateFeeSource?: LateFeeSource;
  /**
   * What the SCHOOL'S POLICY charges per installment, from the live fee policy.
   *
   * Only read in `ledger` mode, and only for a family the ledger has not
   * charged yet: a fee-due notice is warning about a fee that has not accrued,
   * so quoting the family's own ₹0 would tell them no late fee applies. Never
   * the remembered `lateFeeAmount`, which is whatever was last typed.
   */
  policyLateFeeAmount?: number;
};

/**
 * Slot {{4}} — the context line.
 *
 * Names the tiles the office selected, on EVERY notice. Until 2026-09-10 the
 * ledger-quoted notices named the rows carrying a late fee and `overdue_final`
 * named the passed rows, so the same slot could describe a different set of
 * installments than the amount beside it. Now the fees, the late fee and the
 * line naming them are all derived from the one selection, so they describe
 * the same rows by construction. The Last-year tile has no installment to
 * name, so it names the session instead.
 *
 * An EMPTY selection is unreachable from the screen — the parser never yields
 * one without `lastYear` — but a caller that builds settings by hand can still
 * pass `[]`, and `installmentPhrase([])` falls back to a hardcoded "Installment
 * 1 and 2" rather than rendering empty. So an empty set follows the family's
 * own overdue rows, which is at least the money the amount was summed over.
 */
function contextLine(subject: NoticeSubject, settings: NoticeSettings): string {
  if (settings.lastYear) return sessionPhrase(subject.prevSessionLabel, settings.language);
  if (settings.installments.length === 0 && subject.overdueInstallments?.length) {
    return installmentPhrase(subject.overdueInstallments, settings.language);
  }
  return installmentPhrase(settings.installments, settings.language);
}

/**
 * Is this run quoting the ledger, or an amount somebody typed?
 *
 * `lateFeeSource` absent means "however this template behaved before the two
 * modes existed" — the three ledger-quoted notices read the ledger, everything
 * else used the typed lever. Every pre-2026-09-10 link and saved campaign lands
 * here, and lands on what it always did.
 */
function resolveLateFeeSource(settings: NoticeSettings): LateFeeSource {
  if (settings.lateFeeSource) return settings.lateFeeSource;
  return isLedgerQuotedSituation(settings.situation) ? "ledger" : "custom";
}

/**
 * The NUMERIC late-fee slot — what `late_fee_applied` and the waiver pair print
 * as "late fee on your account".
 *
 * In `ledger` mode this is the family's own `late_fee_pending`, read from the
 * view and passed through untouched. In `custom` mode it is the office's typed
 * amount, the same for everybody, which is a claim about the account that the
 * counter will not honour — `describeLateFeeDrift` says so in its own words.
 */
function lateFeeNumberFor(subject: NoticeSubject, settings: NoticeSettings): number {
  if (resolveLateFeeSource(settings) === "custom") {
    return Math.max(0, Math.round(Number(settings.lateFeeAmount) || 0));
  }
  return subject.lateFeeApplied ?? 0;
}

/**
 * Slot {{7}} — the late-fee PHRASE the forward-looking notices carry.
 *
 * `custom` is the old behaviour: the typed amount and basis, worded by
 * `lateFeePhrase`.
 *
 * `ledger` states what the school actually charges. For a family already
 * carrying a fee that is their own figure as one flat charge — the ledger has
 * decided it, so a "per installment" rate would be describing something else.
 * For a family who has not accrued one, it is the POLICY rate per installment,
 * because that is precisely what the notice is warning them about; quoting
 * their own ₹0 would tell them no late fee applies, which is the opposite.
 */
/**
 * What slot {{7}} says in **`ledger` mode** — the ONE definition.
 *
 * Exported because the send path and the screen's "What a parent reads" line
 * both need it, and for one deploy they each had their own copy: the message
 * correctly said "not charged" on a carry-forward balance while the preview
 * beside it still promised Rs 1,000 per installment. The office reads the
 * preview to decide, so the copy that was wrong was the one that mattered.
 *
 * `charged` is this family's own figure. Omit it for the run-level preview,
 * which cannot know one family from another and states the school's rate.
 */
export function ledgerLateFeePhrase(args: {
  situation: NoticeSituation;
  language: NoticeLanguage;
  /** This family's `late_fee_pending`. Omitted for a run-level preview. */
  charged?: number;
  /** What the school's policy charges per installment. */
  policyLateFeeAmount: number;
  /** Used only when no policy was threaded through — see below. */
  fallbackAmount: number;
  fallbackBasis: LateFeeBasis;
}): string {
  // A carry-forward balance NEVER accrues a late fee — those rows carry a rate
  // of 0 deliberately — so the honest ledger answer is "not charged", and it is
  // what Meta approved this template's sample as ("Not applicable on this
  // amount"). Quoting the policy rate would threaten a charge the ledger will
  // never make, and `describeLateFeeDrift` cannot warn about it: it returns
  // early in ledger mode, because nothing is typed.
  if (args.situation === "prevyear") return lateFeePhrase(0, "none", args.language);

  // The ledger has already decided this family's amount, so a "per installment"
  // rate would be describing a different thing.
  const charged = Math.max(0, Math.round(Number(args.charged) || 0));
  if (charged > 0) return lateFeePhrase(charged, "flat", args.language);

  const policy = Math.max(0, Math.round(Number(args.policyLateFeeAmount) || 0));
  // A caller that did not thread the policy through falls back to the typed
  // amount rather than to "not charged" — silently telling a parent no late fee
  // applies is the worse of the two failures.
  return policy > 0
    ? lateFeePhrase(policy, "per_installment", args.language)
    : lateFeePhrase(args.fallbackAmount, args.fallbackBasis, args.language);
}

function lateFeePhraseFor(subject: NoticeSubject, settings: NoticeSettings): string {
  if (resolveLateFeeSource(settings) === "custom") {
    return lateFeePhrase(settings.lateFeeAmount, settings.lateFeeBasis, settings.language);
  }

  return ledgerLateFeePhrase({
    situation: settings.situation,
    language: settings.language,
    charged: subject.lateFeeApplied ?? 0,
    policyLateFeeAmount: settings.policyLateFeeAmount ?? 0,
    fallbackAmount: settings.lateFeeAmount,
    fallbackBasis: settings.lateFeeBasis,
  });
}

export function noticeValuesFrom(
  subject: NoticeSubject,
  settings: NoticeSettings,
): NoticeValues {
  return {
    parentName: subject.parentName,
    studentName: subject.studentName,
    studentClass: subject.studentClass,
    installmentPhrase: contextLine(subject, settings),
    amountDue: subject.dueAmount,
    receivedSoFar: subject.totalPaid,
    balanceDue: subject.balanceDue,
    // `promise_due` prints the family's OWN date, never the run's. Every other
    // notice prints what the office picked.
    lastDate:
      settings.situation === "promise_due"
        ? formatDdMmYyyy(subject.promisedOn ?? null)
        : settings.lastDate,
    prevSessionLabel: subject.prevSessionLabel ?? "",
    prevYearBalance: subject.prevYearBalance,
    lateFeePhrase: lateFeePhraseFor(subject, settings),
    // The numeric late-fee slot, which only the ledger-quoted notices carry.
    lateFeeApplied: lateFeeNumberFor(subject, settings),
    totalToPay: subject.dueAmount + lateFeeNumberFor(subject, settings),
    promisedDate: formatDdMmYyyy(subject.promisedOn ?? null),
    promiseRecordedDate: formatDdMmYyyy(subject.promiseContactedOn ?? null),
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

/**
 * "Previous session 2025-26" / "पिछला सत्र 2025-26" — what slot {{4}} says on
 * a Last-year audience, where there is no installment to name.
 *
 * Never empty: WhatsApp rejects an empty parameter, so a family whose
 * carry-forward row carries no source label still gets the words.
 */
export function sessionPhrase(
  sessionLabel: string | null | undefined,
  language: NoticeLanguage = "en",
): string {
  const words = language === "hi" ? "पिछला सत्र" : "Previous session";
  const label = String(sessionLabel ?? "").trim();
  return label ? `${words} ${label}` : words;
}
