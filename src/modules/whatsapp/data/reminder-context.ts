/**
 * Everything three callers need before they can name a single family.
 *
 * The send screen, the collection-lists screen and the collection-lists export
 * all have to answer the same question — *which families does this query string
 * describe* — and they have to answer it identically. This module exists so
 * there is ONE answer.
 *
 * That is not a hypothetical. This feature has already shipped two copies of a
 * filter parse that disagreed (the action once hardcoded `1100 / [1,2] / 1`
 * instead of reading the constants) and two copies of a slot mapping that
 * quoted different values in the preview and the send. A third and fourth copy
 * of the setup below, in a screen and a download, is how a teacher's sheet ends
 * up naming families the send screen never showed.
 *
 * The order matters and is not obvious:
 *
 * 1. `drainPendingFinancialRefresh` BEFORE quoting money — the matview is
 *    refreshed on a two-minute cron, and inside that window a family who just
 *    had a discount applied is quoted the pre-discount figure.
 * 2. `preDueWindowDays` is parsed BEFORE the calendar, because the calendar
 *    depends on it. A cheap second parse beats a calendar built on the wrong
 *    window.
 * 3. The calendar is passed INTO `loadReminderAudience`. Without it nothing is
 *    overdue, the courtesy templates have no "next" fact, and the tiles open
 *    on installment 1 alone.
 * 4. `getFeePolicySummary({ useAdmin: true })` — a headless caller without that
 *    flag resolves every RTE / Staff Child / 3rd Child student to no discount at
 *    all, and fails quiet rather than loud.
 */
import "server-only";

import { getFeePolicySummary } from "@/modules/fees/data/policy";
import {
  buildInstallmentCalendar,
  defaultInstallmentsFor,
  type InstallmentCalendar,
} from "@/modules/whatsapp/domain/installment-calendar";
import {
  drainPendingFinancialRefresh,
  istToday,
  loadReminderAudience,
  parseReminderFilters,
  type ReminderAudience,
  type ReminderFilters,
} from "@/modules/whatsapp/domain/fee-reminders";
import { loadLastUsedNoticeSettings } from "@/modules/whatsapp/data/reminder-settings";
import { formatDdMmYyyy } from "@/platform/helpers/date";

export type ReminderContext = {
  filters: ReminderFilters;
  calendar: InstallmentCalendar;
  audience: ReminderAudience;
  /** What the LEDGER charges per installment, before the office overrides it. */
  ledgerLateFee: number;
};

/** One value out of a query string, or null when it is absent. */
export type ParamReader = (key: string) => string | null;

/**
 * Builds a reader over Next's `searchParams` object.
 *
 * A repeated key joins with a comma rather than taking the first value. The
 * installment control is four checkboxes sharing one name, so the browser sends
 * `installments=1&installments=2`; taking `[0]` would read "1" and build an
 * audience of families who owe on installment 1 regardless of installment 2 —
 * a different set of parents, quietly. The comma is the format
 * `parseReminderFilters` already accepts, so the two forms of the same choice
 * land on the same filters. `filtersFromForm` does the same on the other side.
 */
export function readerFor(params: Record<string, string | string[] | undefined>): ParamReader {
  return (key: string) => {
    const value = params[key];
    if (Array.isArray(value)) return value.length > 0 ? value.join(",") : null;
    return value ?? null;
  };
}

export async function resolveReminderContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  sessionLabel: string,
  read: ParamReader,
): Promise<ReminderContext> {
  // Free unless a fee change is actually queued (~386ms when one is), and it
  // keeps the figure on screen equal to the one a send would re-derive.
  await drainPendingFinancialRefresh(supabase);

  const policy = await getFeePolicySummary({ useAdmin: true }).catch(() => null);

  // The date slot opens on something sensible but is the office's choice.
  // Deliberately NOT `next_due_date`: carry-forward rows are dated 2026-04-01,
  // before Installment 1, so that column reports the carry-forward line for
  // every family still carrying one.
  const upcoming = (policy?.installmentSchedule ?? [])
    .map((entry) => entry.dueDate)
    .filter((due): due is string => Boolean(due) && due >= istToday())
    .sort()[0];

  const ledgerLateFee = Number(policy?.lateFeeFlatAmount ?? 0);
  const remembered = await loadLastUsedNoticeSettings(supabase, sessionLabel);

  const windowDays = parseReminderFilters(read, sessionLabel).preDueWindowDays;
  const calendar = buildInstallmentCalendar({
    schedule: policy?.installmentSchedule ?? [],
    today: istToday(),
    windowDays,
  });

  const filters = parseReminderFilters(
    read,
    sessionLabel,
    remembered?.lastDate || formatDdMmYyyy(upcoming ?? null),
    remembered?.lateFeeAmount ?? ledgerLateFee,
    // 5. What the tiles open on: every installment past its due date. The
    //    calendar's answer, not a constant, so October's screen knows about
    //    installment 3.
    defaultInstallmentsFor(calendar),
    remembered?.lateFeeBasis ?? null,
    {
      // 6. What the SCHOOL charges, not what was last typed. `ledger` mode
      //    quotes this to a family the ledger has not charged yet, which is
      //    exactly who a forward-looking notice is warning.
      policyLateFeeAmount: ledgerLateFee,
    },
  );

  const audience = await loadReminderAudience(supabase, filters, calendar);

  return { filters, calendar, audience, ledgerLateFee };
}
