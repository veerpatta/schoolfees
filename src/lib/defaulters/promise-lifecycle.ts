import type { DefaulterContactSummary } from "@/lib/defaulters/cadence";
import type { PromiseStatus } from "@/lib/defaulters/types";

export type PromiseLifecycleInput = {
  summary: DefaulterContactSummary | null;
  lastPaymentDate: string | null;
  today: string;
};

/**
 * Resolves the latest promise-to-pay outcome from append-only contact history
 * and payment history. This does not mutate contact records.
 */
export function resolvePromiseStatus({
  summary,
  lastPaymentDate,
  today,
}: PromiseLifecycleInput): PromiseStatus | null {
  if (!summary || summary.lastOutcome !== "promised_pay") return null;
  const promiseDate = summary.snoozeUntil;
  const promisedOn = summary.lastContactedAt?.slice(0, 10) ?? null;
  if (!promiseDate || !promisedOn) return null;

  const paidSincePromise = Boolean(lastPaymentDate && lastPaymentDate >= promisedOn);
  if (paidSincePromise) return "kept";
  if (promiseDate < today) return "broken";
  return "pending";
}
