import "server-only";

import { isLateFeeBasis, type LateFeeBasis } from "@/modules/whatsapp/domain/late-fee";

/**
 * The two `app_settings` rows the reminders screen reads before it draws.
 *
 * Both are best-effort reads: a settings table that cannot be read must leave
 * the office with a working screen on its defaults, never a blank one.
 */

/**
 * Siblings on one phone get ONE message — the family template where one
 * exists, the spokesperson's notice otherwise — unless this row says `'false'`.
 *
 * On by default, and with no row at all, because that is what the owner chose
 * on 2026-09-05 after the first run under it: 93 children ticked, 75 phones
 * messaged once each, 18 children named inside a sibling's message rather
 * than getting their own. The switch exists so going back to one message per
 * child is a settings row, not a deploy. An unreadable row reads as on.
 */
export const ONE_MESSAGE_PER_FAMILY_KEY = "whatsapp_one_message_per_family";

export async function oneMessagePerFamilyEnabled(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", ONE_MESSAGE_PER_FAMILY_KEY)
      .maybeSingle();
    return String(data?.value ?? "").toLowerCase() !== "false";
  } catch {
    return true;
  }
}

/**
 * What the office last put on a message, so the screen opens on it tomorrow.
 *
 * The date and the late fee are the two things on this screen that the office
 * chooses rather than the ledger deriving, and they choose the same ones for
 * days at a time — "pay by Saturday, Rs. 2,000 per installment" ran unchanged
 * from the 1st to the 5th. Opening on the calendar's default every morning
 * meant retyping both before every send, and once forgetting.
 *
 * Per session, because a settle-by date belongs to a year.
 */
export type LastUsedNoticeSettings = {
  /** DD-MM-YYYY, as typed. */
  lastDate: string;
  lateFeeAmount: number;
  lateFeeBasis: LateFeeBasis;
};

export function lastUsedNoticeSettingsKey(sessionLabel: string): string {
  return `whatsapp_last_used_notice_settings:${sessionLabel}`;
}

const DD_MM_YYYY = /^\d{2}-\d{2}-\d{4}$/;

/** Null when nothing has been remembered yet, or the row is unreadable. */
export async function loadLastUsedNoticeSettings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  sessionLabel: string,
): Promise<LastUsedNoticeSettings | null> {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", lastUsedNoticeSettingsKey(sessionLabel))
      .maybeSingle();
    return parseLastUsedNoticeSettings(data?.value);
  } catch {
    return null;
  }
}

/**
 * Exported for the unit test: a hand-edited or half-written row must fall back
 * field by field rather than take the screen down.
 */
export function parseLastUsedNoticeSettings(raw: unknown): LastUsedNoticeSettings | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const value = parsed as Record<string, unknown>;
  const lastDate = typeof value.lastDate === "string" && DD_MM_YYYY.test(value.lastDate) ? value.lastDate : "";
  const amount = Number(value.lateFeeAmount);
  const lateFeeAmount = Number.isFinite(amount) && amount >= 0 ? amount : Number.NaN;
  const lateFeeBasis = isLateFeeBasis(value.lateFeeBasis) ? value.lateFeeBasis : null;
  if (!lastDate && Number.isNaN(lateFeeAmount) && !lateFeeBasis) return null;
  return {
    lastDate,
    lateFeeAmount: Number.isNaN(lateFeeAmount) ? 0 : lateFeeAmount,
    lateFeeBasis: lateFeeBasis ?? "per_installment",
  };
}

/** Best-effort: a failed write must never be reported as a failed send. */
export async function rememberLastUsedNoticeSettings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  sessionLabel: string,
  settings: LastUsedNoticeSettings,
): Promise<void> {
  try {
    await supabase.from("app_settings").upsert({
      key: lastUsedNoticeSettingsKey(sessionLabel),
      value: JSON.stringify({
        lastDate: settings.lastDate,
        lateFeeAmount: settings.lateFeeAmount,
        lateFeeBasis: settings.lateFeeBasis,
      }),
      updated_at: new Date().toISOString(),
    });
  } catch (caught) {
    console.warn("[whatsapp-reminders] could not remember the notice settings", caught);
  }
}
