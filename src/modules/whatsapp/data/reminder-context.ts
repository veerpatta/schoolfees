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
 * 4. `getFeePolicyForSession(sessionLabel, { useAdmin: true })` — a headless caller without that
 *    flag resolves every RTE / Staff Child / 3rd Child student to no discount at
 *    all, and fails quiet rather than loud.
 */
import "server-only";

import { getFeePolicyForSession } from "@/modules/fees/data/policy";
import {
  buildInstallmentCalendar,
  defaultInstallmentsFor,
  derivedLastDateIso,
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
import { RUN_DATE_FREE_SITUATIONS } from "@/modules/whatsapp/domain/campaigns";
import { loadLastUsedNoticeSettings } from "@/modules/whatsapp/data/reminder-settings";
import { formatDdMmYyyy, isoFromDdMmYyyy } from "@/platform/helpers/date";

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

/**
 * What the one-tap reminder sheet needs to fill its date box.
 *
 * The bulk screen resolves this as part of `resolveReminderContext`, off the
 * whole audience. The student page and the student list must not pay for an
 * audience they are not showing, so this is the cheap half: the fee calendar,
 * and the date it says a notice sent today should name.
 *
 * The SAME `derivedLastDateIso` the send action falls back to, deliberately —
 * the box a staffer reads and the date a send resolves must be one answer, or
 * the message quotes a day the screen never showed.
 *
 * `YYYY-MM-DD` throughout, because a native `<input type="date">` speaks only
 * that. `parseReminderFilters` normalises both spellings on the way back in.
 */
export async function resolveReminderDateDefaults(sessionLabel: string): Promise<{
  lastDate: string;
  today: string;
  runDateFreeSituations: readonly string[];
}> {
  const today = istToday();
  const policy = await getFeePolicyForSession(sessionLabel).catch(() => null);
  const calendar = buildInstallmentCalendar({
    schedule: policy?.installmentSchedule ?? [],
    today,
  });
  return {
    lastDate: derivedLastDateIso(calendar, today) ?? "",
    today,
    runDateFreeSituations: RUN_DATE_FREE_SITUATIONS,
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

  // FOR THIS SESSION, not the school's live one. `getFeePolicySummary` resolves
  // through `getActiveSessionLabel`, so a screen opened on TEST-2026-27 built
  // its calendar, its installment tiles and its late-fee figure from 2026-27's
  // policy — the wrong due dates and the wrong money, under the right label.
  const policy = await getFeePolicyForSession(sessionLabel, { useAdmin: true }).catch(
    () => null,
  );

  const today = istToday();
  const ledgerLateFee = Number(policy?.lateFeeFlatAmount ?? 0);
  const remembered = await loadLastUsedNoticeSettings(supabase, sessionLabel);

  const windowDays = parseReminderFilters(read, sessionLabel).preDueWindowDays;
  const calendar = buildInstallmentCalendar({
    schedule: policy?.installmentSchedule ?? [],
    today,
    windowDays,
  });

  /**
   * What the date box opens on — still the office's choice, just never an
   * unusable one.
   *
   * The date the office last sent on is the best opening guess WHILE IT IS
   * STILL AHEAD. Once it has gone it is the worst one: `describeDateGuard`
   * blocks a notice naming a date parents cannot meet, so a remembered
   * 20-09-2026 opened every send on 21 September refused, with no clue that the
   * pre-filled box was the reason. A convenience must not be able to become a
   * blocker.
   *
   * The fallback is `derivedLastDateIso`, the same one a send with no date at
   * all resolves to — one answer to "what date should this notice name", so the
   * screen and the action cannot pick different ones. It is deliberately NOT
   * `next_due_date` from the ledger: carry-forward rows are dated 2026-04-01,
   * before Installment 1, so that column reports the carry-forward line for
   * every family still carrying one.
   */
  const rememberedIso = isoFromDdMmYyyy(remembered?.lastDate ?? null);
  const openingLastDate =
    rememberedIso && rememberedIso >= today
      ? remembered!.lastDate
      : formatDdMmYyyy(derivedLastDateIso(calendar, today));

  const filters = parseReminderFilters(
    read,
    sessionLabel,
    openingLastDate,
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
