import "server-only";

import { DEFAULT_QUIET_HOURS } from "@/modules/whatsapp/domain/send-guards";
import { ONE_MESSAGE_PER_FAMILY_KEY } from "@/modules/whatsapp/data/reminder-settings";

/**
 * The operational knobs behind every parent-facing WhatsApp message, in one
 * place a person can read and change.
 *
 * Every one of these has always existed and every one was SQL-only. Turning
 * automatic receipts on meant hand-editing production; the quiet hours and both
 * budget caps were seeded once in a migration and never seen again; and
 * `whatsapp_one_message_per_family` had no row at all, so the only way to learn
 * its value was to read the code that defaults it.
 *
 * A control nobody can see is not a control. These are the six.
 */

export const WHATSAPP_SETTING_KEYS = {
  receiptNotice: "whatsapp_receipt_notice_enabled",
  reversalNotice: "whatsapp_reversal_notice_enabled",
  quietHoursStart: "whatsapp_quiet_hours_start",
  quietHoursEnd: "whatsapp_quiet_hours_end",
  runMessageCap: "whatsapp_run_message_cap",
  monthMessageCap: "whatsapp_month_message_cap",
  oneMessagePerFamily: ONE_MESSAGE_PER_FAMILY_KEY,
} as const;

export type WhatsappSettings = {
  /** Send the receipt PDF automatically when a payment is posted. */
  receiptNoticeEnabled: boolean;
  /** Tell a family when a payment of theirs is reversed. */
  reversalNoticeEnabled: boolean;
  /** IST hours. Nothing is sent before `start` or after `end`. */
  quietHoursStart: number;
  quietHoursEnd: number;
  /** A run larger than this needs an admin to name the overage. */
  runMessageCap: number;
  /** The monthly budget, in messages. */
  monthMessageCap: number;
  /** Siblings on one phone get one message. */
  oneMessagePerFamily: boolean;
  /**
   * What has been billed this calendar month, so the cap reads as a budget
   * rather than a number. Null when it could not be counted — which must NOT
   * be rendered as zero: "0 of 4,000 used" is a claim, and an unreadable count
   * is not one.
   */
  messagesSentThisMonth: number | null;
};

/** The values that apply when a row is absent. Deliberately the same ones the code defaults to. */
export const WHATSAPP_SETTING_DEFAULTS: Omit<WhatsappSettings, "messagesSentThisMonth"> = {
  // Both notices default OFF. A feature that starts messaging parents the
  // moment it deploys is not a feature, it is an incident.
  receiptNoticeEnabled: false,
  reversalNoticeEnabled: false,
  quietHoursStart: DEFAULT_QUIET_HOURS.start,
  quietHoursEnd: DEFAULT_QUIET_HOURS.end,
  runMessageCap: 250,
  monthMessageCap: 4000,
  // On, with no row at all — the owner's choice on 2026-09-05 after the first
  // run under it. See `reminder-settings.ts`.
  oneMessagePerFamily: true,
};

/**
 * Read all six, plus this month's usage.
 *
 * One query for the settings rather than six, because a settings screen that
 * makes six round trips to Mumbai to draw seven fields is a settings screen
 * people avoid opening.
 */
export async function loadWhatsappSettings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<WhatsappSettings> {
  const keys = Object.values(WHATSAPP_SETTING_KEYS);
  const values = new Map<string, string>();

  try {
    const { data } = await supabase.from("app_settings").select("key, value").in("key", keys);
    for (const row of (data ?? []) as Array<{ key: string; value: string }>) {
      values.set(row.key, String(row.value ?? ""));
    }
  } catch {
    // Falls through to defaults. A settings table that cannot be read must
    // leave a working screen on its documented defaults, never a blank one.
  }

  const bool = (key: string, fallback: boolean) => {
    const raw = values.get(key);
    if (raw === undefined) return fallback;
    return raw.toLowerCase() === "true";
  };
  const num = (key: string, fallback: number) => {
    const parsed = Number(values.get(key));
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  let messagesSentThisMonth: number | null = null;
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const { count } = await supabase
      .from("whatsapp_reminder_sends")
      .select("id", { count: "exact", head: true })
      .gte("sent_on", monthStart)
      // Only what was actually billed. A `covered_by_sibling` row costs nothing
      // and must not read as budget spent — the same predicate `loadGuardFacts`
      // uses, so the screen and the guard cannot disagree.
      .eq("status", "sent");
    messagesSentThisMonth = typeof count === "number" ? count : null;
  } catch {
    messagesSentThisMonth = null;
  }

  return {
    receiptNoticeEnabled: bool(
      WHATSAPP_SETTING_KEYS.receiptNotice,
      WHATSAPP_SETTING_DEFAULTS.receiptNoticeEnabled,
    ),
    reversalNoticeEnabled: bool(
      WHATSAPP_SETTING_KEYS.reversalNotice,
      WHATSAPP_SETTING_DEFAULTS.reversalNoticeEnabled,
    ),
    quietHoursStart: num(
      WHATSAPP_SETTING_KEYS.quietHoursStart,
      WHATSAPP_SETTING_DEFAULTS.quietHoursStart,
    ),
    quietHoursEnd: num(
      WHATSAPP_SETTING_KEYS.quietHoursEnd,
      WHATSAPP_SETTING_DEFAULTS.quietHoursEnd,
    ),
    runMessageCap: num(
      WHATSAPP_SETTING_KEYS.runMessageCap,
      WHATSAPP_SETTING_DEFAULTS.runMessageCap,
    ),
    monthMessageCap: num(
      WHATSAPP_SETTING_KEYS.monthMessageCap,
      WHATSAPP_SETTING_DEFAULTS.monthMessageCap,
    ),
    // `!== 'false'` rather than `=== 'true'`, matching
    // `oneMessagePerFamilyEnabled`: no row, and an unreadable row, both mean on.
    oneMessagePerFamily:
      (values.get(WHATSAPP_SETTING_KEYS.oneMessagePerFamily) ?? "").toLowerCase() !== "false",
    messagesSentThisMonth,
  };
}

export type WhatsappSettingsInput = Omit<WhatsappSettings, "messagesSentThisMonth">;

/**
 * Write all six back.
 *
 * Upsert per key, because `app_settings` is a key/value table and four of these
 * rows may not exist yet — `whatsapp_reversal_notice_enabled` is brand new and
 * `whatsapp_one_message_per_family` never had one.
 */
export async function saveWhatsappSettings(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  settings: WhatsappSettingsInput;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, settings } = args;

  const rows = [
    { key: WHATSAPP_SETTING_KEYS.receiptNotice, value: String(settings.receiptNoticeEnabled) },
    { key: WHATSAPP_SETTING_KEYS.reversalNotice, value: String(settings.reversalNoticeEnabled) },
    { key: WHATSAPP_SETTING_KEYS.quietHoursStart, value: String(settings.quietHoursStart) },
    { key: WHATSAPP_SETTING_KEYS.quietHoursEnd, value: String(settings.quietHoursEnd) },
    { key: WHATSAPP_SETTING_KEYS.runMessageCap, value: String(settings.runMessageCap) },
    { key: WHATSAPP_SETTING_KEYS.monthMessageCap, value: String(settings.monthMessageCap) },
    {
      key: WHATSAPP_SETTING_KEYS.oneMessagePerFamily,
      value: String(settings.oneMessagePerFamily),
    },
  ];

  const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
