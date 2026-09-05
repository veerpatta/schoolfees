import "server-only";

import { DEFAULT_QUIET_HOURS } from "@/modules/whatsapp/domain/send-guards";

/**
 * Everything the pure guards need to know that only the database can answer.
 *
 * Kept apart from `domain/send-guards` on purpose: the RULES are pure and
 * exhaustively tested, and this is the IO that feeds them. Both the send action
 * and the cron call this, so neither can accidentally evaluate a different set
 * of facts.
 *
 * Every read here is best-effort. A guard that cannot load its data must not
 * block the office from sending — it falls back to the value that permits, and
 * says nothing, rather than refusing on a query error.
 */

export type GuardFacts = {
  hourIst: number;
  weekdayIst: number;
  quietHours: { start: number; end: number };
  counterOpenOnLastDate: boolean | null;
  closedReason: string | null;
  runMessageCap: number | null;
  monthMessageCap: number | null;
  messagesSentThisMonth: number | null;
  campaignProven: boolean | null;
};

/** IST hour and weekday, from the school's clock rather than the server's. */
function istNow(now: Date): { hour: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const weekdayName = parts.find((part) => part.type === "weekday")?.value ?? "";
  return {
    hour: Number(parts.find((part) => part.type === "hour")?.value ?? 12),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayName),
  };
}

async function readNumberSetting(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  key: string,
): Promise<number | null> {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    const parsed = Number(data?.value);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function loadGuardFacts(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  /** The date the notice names, ISO. Null when it prints none. */
  lastDateIso: string | null;
  campaignName: string;
  /** False skips the first-use guard entirely (the cron sends only saved, already-run campaigns). */
  requireProvenCampaign: boolean;
  now?: Date;
}): Promise<GuardFacts> {
  const now = args.now ?? new Date();
  const { hour, weekday } = istNow(now);

  const [quietStart, quietEnd, runCap, monthCap] = await Promise.all([
    readNumberSetting(args.supabase, "whatsapp_quiet_hours_start"),
    readNumberSetting(args.supabase, "whatsapp_quiet_hours_end"),
    readNumberSetting(args.supabase, "whatsapp_run_message_cap"),
    readNumberSetting(args.supabase, "whatsapp_month_message_cap"),
  ]);

  // Is the counter open on the date the notice names? Null when nothing is
  // known, which the guard reads as open — a missing holiday list must not stop
  // the office sending.
  let counterOpenOnLastDate: boolean | null = null;
  let closedReason: string | null = null;
  if (args.lastDateIso) {
    try {
      const { data } = await args.supabase
        .from("school_holidays")
        .select("label, counter_open")
        .eq("holiday_date", args.lastDateIso)
        .maybeSingle();
      if (data) {
        counterOpenOnLastDate = data.counter_open === true;
        if (!counterOpenOnLastDate) closedReason = String(data.label ?? "");
      }
    } catch {
      counterOpenOnLastDate = null;
    }
  }

  // How many messages have gone this month, for the budget.
  let messagesSentThisMonth: number | null = null;
  try {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const { count } = await args.supabase
      .from("whatsapp_reminder_sends")
      .select("id", { count: "exact", head: true })
      .gte("sent_on", monthStart)
      // Only what was actually billed. A `covered_by_sibling` row costs nothing
      // and must not eat the budget.
      .eq("status", "sent");
    messagesSentThisMonth = typeof count === "number" ? count : null;
  } catch {
    messagesSentThisMonth = null;
  }

  // Has this campaign EVER gone out cleanly — to a family, or as a test?
  //
  // This used to ask for a successful test in the last 24 hours, every day,
  // for a campaign the office had sent to a hundred families the morning
  // before. The slot-order mistake it exists to catch is caught the first time
  // a campaign is used, not the hundredth, so one clean send of either kind
  // proves it for good.
  let campaignProven: boolean | null = null;
  if (args.requireProvenCampaign) {
    try {
      const [tested, sent] = await Promise.all([
        args.supabase
          .from("whatsapp_test_sends")
          .select("id")
          .eq("campaign_name", args.campaignName)
          .eq("succeeded", true)
          .limit(1),
        args.supabase
          .from("whatsapp_reminder_sends")
          .select("id")
          .eq("campaign_name", args.campaignName)
          .eq("status", "sent")
          .limit(1),
      ]);
      campaignProven =
        (Array.isArray(tested.data) && tested.data.length > 0) ||
        (Array.isArray(sent.data) && sent.data.length > 0);
    } catch {
      // Unreadable means "do not nag". The guard is a safety net, not a gate,
      // and failing it closed on a query error would block a legitimate run.
      campaignProven = null;
    }
  }

  return {
    hourIst: hour,
    weekdayIst: weekday,
    quietHours: {
      start: quietStart ?? DEFAULT_QUIET_HOURS.start,
      end: quietEnd ?? DEFAULT_QUIET_HOURS.end,
    },
    counterOpenOnLastDate,
    closedReason,
    runMessageCap: runCap,
    monthMessageCap: monthCap,
    messagesSentThisMonth,
    campaignProven,
  };
}

/**
 * Record a test send.
 *
 * Deliberately its OWN table. A row in `whatsapp_reminder_sends` claims a
 * student's day, and the unique index would then drop that family out of the
 * real run — which is why the standing rule is that a test never writes there.
 * This lets a test be recorded without breaking it.
 */
export async function recordTestSend(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  campaignName: string;
  destination: string;
  succeeded: boolean;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  staffId: string | null;
}): Promise<void> {
  try {
    await args.supabase.from("whatsapp_test_sends").insert({
      campaign_name: args.campaignName,
      destination: args.destination,
      succeeded: args.succeeded,
      provider_message_id: args.providerMessageId ?? null,
      error_message: args.errorMessage ?? null,
      sent_by: args.staffId,
    });
  } catch (caught) {
    // Best-effort: the test message has already gone, and failing to log it must
    // not be reported to staff as a failed test.
    console.warn("[whatsapp-reminders] test send log failed", caught);
  }
}
