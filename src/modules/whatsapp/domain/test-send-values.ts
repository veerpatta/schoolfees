import {
  describeCampaign,
  isRunDateFreeSituation,
  ledgerLateFeePhrase,
  noticeValuesFrom,
  type NoticeLanguage,
  type NoticeSettings,
  type NoticeSituation,
  type NoticeSubject,
  type NoticeValues,
} from "@/modules/whatsapp/domain/campaigns";
import { lateFeePhrase } from "@/modules/whatsapp/domain/late-fee";

/**
 * The one place the positional slot skeleton meets the named `NoticeValues`.
 *
 * The test panel posts fields named after the slot skeleton — `contextLine`,
 * `amount`, `date` — and slots 4, 5 and 6 mean something different on every
 * notice. Before this file, the panel's preview and the action's send each
 * carried their own copy of that mapping, and both covered three of the seven
 * notices: the other four fell into the previous-session branch and would have
 * posted a session label where the installment should be. Two copies that must
 * agree are one copy that cannot disagree.
 *
 * Pure and free of `server-only`: the panel runs this in the browser to render
 * the preview as staff type, and the action runs the same function on the
 * server to build what is sent.
 */

/** Which `NoticeValues` key each situation-specific slot carries. */
export const SLOT_VALUE_KEYS: Record<
  NoticeSituation,
  Readonly<Record<string, keyof NoticeValues>>
> = {
  fee_due: { contextLine: "installmentPhrase", amount: "amountDue", date: "lastDate" },
  upcoming: { contextLine: "installmentPhrase", amount: "amountDue", date: "lastDate" },
  upcoming_final: { contextLine: "installmentPhrase", amount: "amountDue", date: "lastDate" },
  balance: { contextLine: "receivedSoFar", amount: "balanceDue", date: "lastDate" },
  prevyear: { contextLine: "prevSessionLabel", amount: "prevYearBalance", date: "lastDate" },
  // Slot 4 is the date the FAMILY gave, as text — not money.
  promise_lapsed: { contextLine: "promisedDate", amount: "amountDue", date: "lastDate" },
  // The one notice off the shared skeleton: three money slots and no date.
  late_fee_applied: {
    contextLine: "installmentPhrase",
    feesPending: "amountDue",
    lateFeeApplied: "lateFeeApplied",
    totalToPay: "totalToPay",
  },
  // The waiver pair: two ledger figures, then the waive-by date in slot 7.
  late_fee_waiver: {
    contextLine: "installmentPhrase",
    feesPending: "amountDue",
    lateFeeApplied: "lateFeeApplied",
    date: "lastDate",
  },
  waiver_last_call: {
    contextLine: "installmentPhrase",
    feesPending: "amountDue",
    lateFeeApplied: "lateFeeApplied",
    date: "lastDate",
  },
  overdue_final: { contextLine: "installmentPhrase", amount: "amountDue", date: "lastDate" },
  // Slot 4 is the day the office SPOKE with the family, as text; slot 6 is the
  // date the family gave, which `noticeValuesFrom` puts in `lastDate`.
  promise_due: { contextLine: "promiseRecordedDate", amount: "amountDue", date: "lastDate" },
  exam_clearance: { contextLine: "installmentPhrase", amount: "amountDue", date: "lastDate" },
};

export type OpeningSettings = NoticeSettings;

/**
 * The values the test panel opens on, for a notice and a language.
 *
 * The real top row where we have one, projected through the SAME
 * `noticeValuesFrom` the send uses; the campaign's own Meta-submitted sample
 * where we do not, with the screen's date and late-fee phrase laid over it.
 * Both are true-shaped for that template.
 *
 * Shared by the page (which renders the opening preview on the server) and the
 * panel (which fills its fields from the same values), so the preview the
 * office first sees is rendered from exactly the fields it can then edit.
 *
 * On a notice that prints no run date the screen's date is NOT laid over the
 * sample: `promise_due` prints the family's own date, and the sample carries
 * one that agrees with its "spoken on" line.
 */
export function openingNoticeValues(
  settings: OpeningSettings,
  sample: NoticeSubject | null,
): NoticeValues {
  const { situation, language } = settings;
  if (sample) return noticeValuesFrom(sample, settings);
  const campaign = describeCampaign(situation, language);
  const metaSample: NoticeValues = campaign?.sample ?? {
    parentName: "",
    studentName: "",
    studentClass: "",
  };
  return {
    ...metaSample,
    lastDate:
      !isRunDateFreeSituation(situation) && settings.lastDate
        ? settings.lastDate
        : metaSample.lastDate,
    // Follows the MODE, like the sample branch above and like the send. In
    // ledger mode there is no family to read a charged fee from here, so it
    // states the school's rate — which is what `ledgerLateFeePhrase` does with
    // `charged` omitted.
    lateFeePhrase:
      settings.lateFeeSource === "ledger"
        ? ledgerLateFeePhrase({
            situation,
            language: language as NoticeLanguage,
            policyLateFeeAmount: settings.policyLateFeeAmount ?? 0,
            fallbackAmount: settings.lateFeeAmount,
            fallbackBasis: settings.lateFeeBasis,
          })
        : lateFeePhrase(settings.lateFeeAmount, settings.lateFeeBasis, language as NoticeLanguage),
  };
}

/** Slots 1-3 and 7 mean the same thing on every notice. */
const SHARED_SLOT_KEYS: Readonly<Record<string, keyof NoticeValues>> = {
  parentName: "parentName",
  studentName: "studentName",
  studentClass: "studentClass",
  lateFeePhrase: "lateFeePhrase",
};

/** The `NoticeValues` keys that hold rupees. Everything else is text. */
const MONEY_KEYS: ReadonlySet<keyof NoticeValues> = new Set<keyof NoticeValues>([
  "amountDue",
  "receivedSoFar",
  "balanceDue",
  "prevYearBalance",
  "lateFeeApplied",
  "totalToPay",
]);

function keyFor(situation: NoticeSituation, slot: string): keyof NoticeValues | null {
  return SLOT_VALUE_KEYS[situation][slot] ?? SHARED_SLOT_KEYS[slot] ?? null;
}

/**
 * Is this slot money on this notice? Derived from the table above rather than
 * kept as a second list, so the panel's number inputs cannot drift from what
 * the values actually are.
 */
export function isMoneySlot(situation: NoticeSituation, slot: string): boolean {
  const key = keyFor(situation, slot);
  return key !== null && MONEY_KEYS.has(key);
}

/**
 * Named values → one string per slot name. The panel's opening state.
 *
 * Money is rendered as a bare number (no grouping) because it is going into a
 * `type="number"` input; `formatRupeesPlain` happens later, in `buildParams`.
 */
export function slotFormFromValues(
  situation: NoticeSituation,
  values: NoticeValues,
): Record<string, string> {
  const form: Record<string, string> = {};
  for (const [slot, key] of [
    ...Object.entries(SHARED_SLOT_KEYS),
    ...Object.entries(SLOT_VALUE_KEYS[situation]),
  ]) {
    const value = values[key];
    form[slot] = value === undefined || value === null ? "" : String(value);
  }
  return form;
}

/**
 * Slot strings → named values, falling back to `sample` slot by slot.
 *
 * Blank text falls back, and so does money that is not a positive number: a
 * field the office cleared, or typed "abc" into, should test the campaign's own
 * Meta-submitted sample rather than send `0` to a staff phone and prove nothing.
 */
export function noticeValuesFromSlots(
  situation: NoticeSituation,
  form: Readonly<Record<string, string | null | undefined>>,
  sample: NoticeValues,
): NoticeValues {
  const values: NoticeValues = {
    parentName: sample.parentName,
    studentName: sample.studentName,
    studentClass: sample.studentClass,
  };

  for (const [slot, key] of [
    ...Object.entries(SHARED_SLOT_KEYS),
    ...Object.entries(SLOT_VALUE_KEYS[situation]),
  ]) {
    const raw = String(form[slot] ?? "").trim();
    if (MONEY_KEYS.has(key)) {
      const parsed = Number(raw);
      const fallback = sample[key];
      const chosen =
        raw !== "" && Number.isFinite(parsed) && parsed > 0
          ? parsed
          : typeof fallback === "number"
            ? fallback
            : 0;
      (values as Record<string, unknown>)[key] = chosen;
    } else {
      const fallback = sample[key];
      (values as Record<string, unknown>)[key] =
        raw !== "" ? raw : typeof fallback === "string" ? fallback : "";
    }
  }

  return values;
}
