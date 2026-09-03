/**
 * Which of a family's stored numbers actually answers.
 *
 * Lives in `platform/` rather than in `defaulters/`, where it was written,
 * because two modules now need it and only one of them could import the other.
 * `defaulters/ui` already imports `whatsapp/domain/render`, so a
 * `whatsapp -> defaulters` import would close a cycle that
 * `npm run quality:architecture` counts and that the module-cycle list only
 * grows by accident.
 *
 * Pure, and deliberately knows nothing about calls or messages: it is handed
 * per-number statistics and returns a label. The defaulters call queue derives
 * those stats from `defaulter_contacts`; the WhatsApp reminders use the same
 * answer to pick which parent to message, which is the whole reason it moved.
 *
 * `@/modules/defaulters/domain/cadence` re-exports both of these, so every
 * existing caller and its tests are untouched.
 */

/** Responsiveness stats for a single stored number within the session. */
export type PhoneResponsiveness = {
  /** The phone label, e.g. "Father" or "Mother". */
  label: string;
  /** Total attempts recorded against this number. */
  attempts: number;
  /** Attempts whose outcome was `reached`. */
  reached: number;
  /** Trailing run of `no_answer` outcomes ending at the most recent attempt. */
  noAnswerStreak: number;
  /** ISO timestamp of the most recent `reached` against this number, or null. */
  lastReachedAt: string | null;
};

/**
 * Picks the best number to try next from per-number responsiveness. Pure.
 *
 * Priority:
 *   1. The number with the most recent `reached` outcome (someone picked up).
 *   2. Otherwise the highest answer-rate number with at least one attempt.
 *   3. Otherwise the number with the shortest no-answer streak.
 * Ties fall back to the supplied `preferredOrder` (e.g. Father before Mother).
 *
 * Returns null when there is no per-number signal at all — which is the normal
 * state for a family nobody has rung yet, and is why callers fall back to
 * father-then-mother rather than treating null as "unreachable".
 */
export function suggestPhoneLabel(
  perNumber: Record<string, PhoneResponsiveness> | undefined,
  preferredOrder: readonly string[] = ["Father", "Mother"],
): string | null {
  if (!perNumber) return null;
  const stats = Object.values(perNumber).filter((s) => s.attempts > 0);
  if (stats.length === 0) return null;

  const orderIndex = (label: string) => {
    const idx = preferredOrder.indexOf(label);
    return idx === -1 ? preferredOrder.length : idx;
  };

  // 1) Most recent reached wins.
  const reachedStats = stats.filter((s) => s.lastReachedAt);
  if (reachedStats.length > 0) {
    return reachedStats.sort((a, b) => {
      const at = a.lastReachedAt ?? "";
      const bt = b.lastReachedAt ?? "";
      if (at !== bt) return bt.localeCompare(at);
      return orderIndex(a.label) - orderIndex(b.label);
    })[0].label;
  }

  // 2) Best answer-rate; 3) shortest no-answer streak; then preferred order.
  return stats.sort((a, b) => {
    const ar = a.reached / a.attempts;
    const br = b.reached / b.attempts;
    if (ar !== br) return br - ar;
    if (a.noAnswerStreak !== b.noAnswerStreak) {
      return a.noAnswerStreak - b.noAnswerStreak;
    }
    return orderIndex(a.label) - orderIndex(b.label);
  })[0].label;
}
