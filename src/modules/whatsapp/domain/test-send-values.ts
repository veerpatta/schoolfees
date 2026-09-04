import type { NoticeSituation, NoticeValues } from "@/modules/whatsapp/domain/campaigns";

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
};

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
