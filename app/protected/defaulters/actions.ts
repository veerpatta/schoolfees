"use server";

import { revalidatePath, updateTag } from "next/cache";

import { recordActivity } from "@/lib/activity/events";
import { snoozeIso } from "@/lib/defaulters/cadence";
import {
  insertDefaulterContact,
  type ContactChannel,
  type ContactOutcome,
} from "@/lib/defaulters/contacts";
import { requireStaffPermission } from "@/lib/supabase/session";

export type LogContactState = {
  status: "idle" | "success" | "error";
  message?: string;
};

const VALID_CHANNELS: ContactChannel[] = [
  "call",
  "whatsapp",
  "sms",
  "in_person",
  "email",
];
const VALID_OUTCOMES: ContactOutcome[] = [
  "reached",
  "no_answer",
  "promised_pay",
  "dispute",
  "other",
];

/**
 * Best-effort cache invalidation for the defaulters surface. Wrapped in
 * try/catch because `revalidateTag` should never crash the action even if
 * the cache backend hiccups — the user has already been told their log
 * was saved.
 */
function safeRevalidate(sessionLabel: string | null | undefined) {
  // Belt-and-braces: invalidate the cached financial query (which tags by
  // session) and the defaulters route. updateTag is preferred from server
  // actions (read-your-own-writes), revalidatePath catches any uncached
  // stragglers. Both calls are wrapped because a cache backend hiccup should
  // never crash the user's flow after the contact has already been saved.
  try {
    if (sessionLabel) updateTag(`session:${sessionLabel}`);
    updateTag("defaulter-contacts");
  } catch (caught) {
    console.warn("[defaulter-actions] updateTag failed", caught);
  }
  try {
    revalidatePath("/protected/defaulters");
  } catch (caught) {
    console.warn("[defaulter-actions] revalidatePath failed", caught);
  }
}

export async function logContactAction(
  _prevState: LogContactState,
  formData: FormData,
): Promise<LogContactState> {
  let staffId: string | null = null;
  try {
    const staff = await requireStaffPermission("defaulters:view");
    staffId = (staff?.id as string | undefined) ?? null;
  } catch {
    return { status: "error", message: "Permission denied." };
  }

  const studentId = formData.get("studentId") as string | null;
  const channel = formData.get("channel") as string | null;
  const outcome = formData.get("outcome") as string | null;
  const snoozeStr = formData.get("snoozeDays") as string | null;
  const promisedDate = (formData.get("promisedDate") as string | null)?.trim() || null;
  const note = (formData.get("note") as string | null)?.trim() || null;
  const sessionLabel = formData.get("sessionLabel") as string | null;
  const voiceNotePath = (formData.get("voiceNotePath") as string | null)?.trim() || null;

  if (!studentId || !channel || !outcome || !sessionLabel) {
    return { status: "error", message: "Missing required fields." };
  }
  if (!VALID_CHANNELS.includes(channel as ContactChannel)) {
    return { status: "error", message: "Invalid channel." };
  }
  if (!VALID_OUTCOMES.includes(outcome as ContactOutcome)) {
    return { status: "error", message: "Invalid outcome." };
  }

  // Promised-pay date takes priority over generic snooze; we store it in
  // snooze_until so the cadence engine resurfaces the student on that day.
  let snoozeUntil: string | null = null;
  if (outcome === "promised_pay" && promisedDate) {
    snoozeUntil = promisedDate;
  } else if (snoozeStr) {
    const days = Number(snoozeStr);
    if (Number.isFinite(days) && days > 0) snoozeUntil = snoozeIso(days);
  }

  try {
    await insertDefaulterContact({
      studentId,
      sessionLabel,
      channel: channel as ContactChannel,
      outcome: outcome as ContactOutcome,
      snoozeUntil,
      note,
      voiceNotePath,
    });
  } catch (caught) {
    console.error("[defaulter-actions] insert contact failed", caught);
    return {
      status: "error",
      message: caught instanceof Error ? caught.message : "Could not save contact.",
    };
  }

  try {
    await recordActivity({
      userId: staffId,
      kind: "defaulter_contacted",
      refId: studentId,
      payload: {
        channel,
        outcome,
        hasVoiceNote: Boolean(voiceNotePath),
        sessionLabel,
        promisedDate: snoozeUntil,
      },
    });
  } catch (caught) {
    console.warn("[defaulter-actions] activity record failed", caught);
  }

  safeRevalidate(sessionLabel);
  return { status: "success", message: "Contact logged." };
}

/* -------------------------------------------------------------------------- */
/* Quick-log: one-tap log from the card (no form, no sheet)                    */
/* -------------------------------------------------------------------------- */

export type QuickLogArgs = {
  studentId: string;
  sessionLabel: string;
  outcome: ContactOutcome;
  /** Channel hint — defaults to "call" for quick-log buttons. */
  channel?: ContactChannel;
  /** When outcome=promised_pay, the promised yyyy-mm-dd. */
  promisedDate?: string | null;
};

export type QuickLogResult = {
  ok: boolean;
  message?: string;
};

export async function quickLogContact(args: QuickLogArgs): Promise<QuickLogResult> {
  let staffId: string | null = null;
  try {
    const staff = await requireStaffPermission("defaulters:view");
    staffId = (staff?.id as string | undefined) ?? null;
  } catch {
    return { ok: false, message: "Permission denied." };
  }

  if (!args.studentId || !args.sessionLabel) {
    return { ok: false, message: "Missing student or session." };
  }
  if (!VALID_OUTCOMES.includes(args.outcome)) {
    return { ok: false, message: "Invalid outcome." };
  }
  const channel: ContactChannel = args.channel ?? "call";
  if (!VALID_CHANNELS.includes(channel)) {
    return { ok: false, message: "Invalid channel." };
  }

  const snoozeUntil = args.outcome === "promised_pay" ? args.promisedDate ?? null : null;

  try {
    await insertDefaulterContact({
      studentId: args.studentId,
      sessionLabel: args.sessionLabel,
      channel,
      outcome: args.outcome,
      snoozeUntil,
    });
  } catch (caught) {
    console.error("[defaulter-actions] quick-log insert failed", caught);
    return {
      ok: false,
      message: caught instanceof Error ? caught.message : "Could not save contact.",
    };
  }

  try {
    await recordActivity({
      userId: staffId,
      kind: "defaulter_contacted",
      refId: args.studentId,
      payload: {
        channel,
        outcome: args.outcome,
        quickLog: true,
        sessionLabel: args.sessionLabel,
        promisedDate: snoozeUntil,
      },
    });
  } catch (caught) {
    console.warn("[defaulter-actions] activity record failed", caught);
  }

  safeRevalidate(args.sessionLabel);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* WhatsApp send auto-log                                                       */
/* -------------------------------------------------------------------------- */

export type WhatsAppAutoLogArgs = {
  sessionLabel: string;
  studentIds: string[];
  templateName?: string | null;
};

export async function logWhatsAppSendAttempts(
  args: WhatsAppAutoLogArgs,
): Promise<QuickLogResult> {
  let staffId: string | null = null;
  try {
    const staff = await requireStaffPermission("defaulters:view");
    staffId = (staff?.id as string | undefined) ?? null;
  } catch {
    return { ok: false, message: "Permission denied." };
  }

  if (!args.sessionLabel || args.studentIds.length === 0) {
    return { ok: false, message: "Missing session or students." };
  }

  const note = args.templateName
    ? `WhatsApp sent (${args.templateName})`
    : "WhatsApp sent";

  let failures = 0;
  for (const studentId of args.studentIds) {
    try {
      await insertDefaulterContact({
        studentId,
        sessionLabel: args.sessionLabel,
        channel: "whatsapp",
        outcome: "other",
        note,
      });
    } catch (caught) {
      failures += 1;
      console.warn("[defaulter-actions] wa auto-log row failed", caught);
    }
  }

  try {
    await recordActivity({
      userId: staffId,
      kind: "defaulter_contacted",
      payload: {
        channel: "whatsapp",
        outcome: "other",
        wabulk: true,
        count: args.studentIds.length,
        sessionLabel: args.sessionLabel,
        templateName: args.templateName ?? null,
      },
    });
  } catch (caught) {
    console.warn("[defaulter-actions] activity record failed", caught);
  }

  safeRevalidate(args.sessionLabel);
  return {
    ok: failures === 0,
    message: failures === 0 ? undefined : `${failures} of ${args.studentIds.length} could not be logged.`,
  };
}
