"use server";

import { revalidatePath } from "next/cache";

import { recordActivity } from "@/lib/activity/events";
import { insertDefaulterContact } from "@/lib/defaulters/contacts";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaffPermission } from "@/lib/supabase/session";
import {
  configuredCampaignName,
  isAisensyConfigured,
  sendAisensyCampaignMessage,
} from "@/lib/whatsapp/aisensy";
import {
  istToday,
  loadReminderAudience,
  parseReminderFilters,
  resolveCurrentSessionLabel,
  type ReminderCandidate,
  type ReminderFilters,
} from "@/lib/whatsapp/fee-reminders";
import { toWhatsappDestination } from "@/lib/whatsapp/phone";
import {
  buildReminderParams,
  FEE_REMINDER_TEMPLATE_DEADLINE,
} from "@/lib/whatsapp/reminder-template";

const PAGE_PATH = "/protected/admin-tools/whatsapp-reminders";

export type SendRemindersState = {
  status: "idle" | "success" | "partial" | "error";
  message?: string;
  sent?: number;
  failed?: number;
  alreadySentToday?: number;
  failures?: Array<{ admissionNo: string; studentName: string; error: string }>;
};

/** Concurrent provider calls. Fast enough for a few hundred, not a burst. */
const SEND_CONCURRENCY = 6;

function filtersFromForm(formData: FormData, sessionLabel: string): ReminderFilters {
  return parseReminderFilters((key) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : null;
  }, sessionLabel);
}

export async function sendRemindersAction(
  _prev: SendRemindersState,
  formData: FormData,
): Promise<SendRemindersState> {
  let staffId: string | null = null;
  try {
    const staff = await requireStaffPermission("settings:write");
    staffId = (staff?.id as string | undefined) ?? null;
  } catch {
    return { status: "error", message: "Permission denied." };
  }

  if (!isAisensyConfigured()) {
    return { status: "error", message: "AISENSY_API_KEY is not configured on the server." };
  }
  const campaignName = configuredCampaignName();
  if (!campaignName) {
    return { status: "error", message: "AISENSY_CAMPAIGN is not configured on the server." };
  }

  const today = istToday();
  if (today > FEE_REMINDER_TEMPLATE_DEADLINE) {
    return {
      status: "error",
      message:
        `The approved template hardcodes ${FEE_REMINDER_TEMPLATE_DEADLINE} as the deadline and today is ${today}. ` +
        "Sending it now would tell parents to beat a date that has passed. Get a replacement template approved first.",
    };
  }

  const selected = new Set(formData.getAll("studentId").map(String).filter(Boolean));
  if (selected.size === 0) {
    return { status: "error", message: "No students selected." };
  }

  const supabase = createAdminClient();

  let sessionLabel: string;
  let candidates: ReminderCandidate[];
  try {
    sessionLabel = await resolveCurrentSessionLabel(supabase);
    const audience = await loadReminderAudience(supabase, filtersFromForm(formData, sessionLabel));
    // Re-derived server-side rather than read off the form. The amount a parent
    // is quoted must come from the ledger at send time, not from a number that
    // was rendered into a checkbox some minutes ago — and a student who has
    // paid since the page loaded drops out here rather than being messaged.
    candidates = audience.candidates.filter((candidate) => selected.has(candidate.studentId));
  } catch (caught) {
    return {
      status: "error",
      message: caught instanceof Error ? caught.message : "Could not rebuild the recipient list.",
    };
  }

  if (candidates.length === 0) {
    return {
      status: "error",
      message:
        "None of the selected students are still eligible — they may have paid, or been flagged no-call, since this page loaded. Reload and try again.",
    };
  }

  let sent = 0;
  let failed = 0;
  let alreadySentToday = 0;
  const failures: NonNullable<SendRemindersState["failures"]> = [];
  const sentStudentIds: string[] = [];

  for (let index = 0; index < candidates.length; index += SEND_CONCURRENCY) {
    const batch = candidates.slice(index, index + SEND_CONCURRENCY);
    const outcomes = await Promise.all(
      batch.map((candidate) =>
        sendOne({ supabase, candidate, campaignName, sessionLabel, today, staffId }),
      ),
    );
    for (let position = 0; position < outcomes.length; position += 1) {
      const outcome = outcomes[position];
      if (outcome.kind === "sent") {
        sent += 1;
        sentStudentIds.push(batch[position].studentId);
      } else if (outcome.kind === "already") {
        alreadySentToday += 1;
      } else {
        failed += 1;
        failures.push({
          admissionNo: batch[position].admissionNo,
          studentName: batch[position].studentName,
          error: outcome.error,
        });
      }
    }
  }

  // The office's contact history, so a reminder shows on the student's profile
  // and the defaulters cadence knows the family was reached today. Best-effort:
  // the message has already gone, and a logging hiccup must not be reported as
  // a failed send.
  for (const studentId of sentStudentIds) {
    try {
      await insertDefaulterContact({
        studentId,
        sessionLabel,
        channel: "whatsapp",
        outcome: "other",
        note: `WhatsApp fee reminder sent (${campaignName})`,
      });
    } catch (caught) {
      console.warn("[whatsapp-reminders] contact log failed", caught);
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
        provider: "aisensy",
        campaignName,
        count: sent,
        failed,
        sessionLabel,
      },
    });
  } catch (caught) {
    console.warn("[whatsapp-reminders] activity log failed", caught);
  }

  try {
    revalidatePath(PAGE_PATH);
  } catch (caught) {
    console.warn("[whatsapp-reminders] revalidate failed", caught);
  }

  const summary = [
    `${sent} sent`,
    failed > 0 ? `${failed} failed` : null,
    alreadySentToday > 0 ? `${alreadySentToday} already messaged today` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    status: failed > 0 ? "partial" : "success",
    message: summary,
    sent,
    failed,
    alreadySentToday,
    failures: failures.slice(0, 20),
  };
}

type SendOutcome = { kind: "sent" } | { kind: "already" } | { kind: "failed"; error: string };

async function sendOne(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  candidate: ReminderCandidate;
  campaignName: string;
  sessionLabel: string;
  today: string;
  staffId: string | null;
}): Promise<SendOutcome> {
  const { supabase, candidate, campaignName, sessionLabel, today, staffId } = args;
  const templateParams = buildReminderParams(candidate);

  // Claim the day BEFORE calling the provider. Two staff members working the
  // same list at the same time collide on the unique index here, and the loser
  // never reaches AiSensy — rather than both passing a check-then-send.
  const { data: claim, error: claimError } = await supabase
    .from("whatsapp_reminder_sends")
    .insert({
      student_id: candidate.studentId,
      session_label: sessionLabel,
      sent_on: today,
      campaign_name: campaignName,
      destination: candidate.destination,
      due_amount: candidate.dueAmount,
      template_params: templateParams,
      status: "pending",
      sent_by: staffId,
    })
    .select("id")
    .single();

  if (claimError) {
    if (claimError.code === "23505") return { kind: "already" };
    return { kind: "failed", error: `Could not claim send slot: ${claimError.message}` };
  }

  const result = await sendAisensyCampaignMessage({
    campaignName,
    destination: candidate.destination,
    userName: candidate.parentName,
    templateParams,
    source: "veerpatta-fees-app/admin-tools",
  });

  await supabase
    .from("whatsapp_reminder_sends")
    .update({
      status: result.ok ? "sent" : "failed",
      provider_message_id: result.ok ? result.messageId : null,
      error_message: result.ok ? null : result.error,
      updated_at: new Date().toISOString(),
    })
    .eq("id", claim.id);

  return result.ok ? { kind: "sent" } : { kind: "failed", error: result.error };
}

export type TestSendState = {
  status: "idle" | "success" | "error";
  /** One-line human summary. The only field the original UI read. */
  message?: string;
  /**
   * The provider's HTTP status. 0 means the request never completed — a network
   * failure, which is NOT the same as a 4xx AiSensy actually answered with.
   * Absent when the call was refused here before it was ever made (permission,
   * no API key, unusable number), which is itself the diagnosis.
   */
  httpStatus?: number;
  /** `submitted_message_id` — an acceptance receipt, not proof of delivery. */
  messageId?: string | null;
  /** E.164 exactly as posted, after `toWhatsappDestination`. */
  destination?: string;
  campaignName?: string;
  /** The four slot values as sent, in template order. */
  templateParams?: string[];
  /** AiSensy's own error string, verbatim and unwrapped. */
  providerError?: string;
};

/**
 * One message to a number the office controls, using values the caller chose.
 *
 * Deliberately not written to `whatsapp_reminder_sends`: a test is not a
 * reminder to that family, and logging it would claim the student's day and
 * quietly exclude them from the real send. There is no Supabase call anywhere
 * in this function, and that is the whole guarantee — do not add one.
 *
 * Also deliberately free of the `FEE_REMINDER_TEMPLATE_DEADLINE` guard that
 * `sendRemindersAction` carries. A test to a staff phone after the deadline is
 * exactly what you want while a replacement template is in approval: it costs
 * one message and reaches no parent. The screen passes this a `canTest` that
 * omits `templateExpired` for the same reason.
 */
export async function sendTestReminderAction(
  _prev: TestSendState,
  formData: FormData,
): Promise<TestSendState> {
  try {
    await requireStaffPermission("settings:write");
  } catch {
    return { status: "error", message: "Permission denied." };
  }

  if (!isAisensyConfigured()) {
    return { status: "error", message: "AISENSY_API_KEY is not configured on the server." };
  }
  const campaignName = configuredCampaignName();
  if (!campaignName) {
    return { status: "error", message: "AISENSY_CAMPAIGN is not configured on the server." };
  }

  const destination = toWhatsappDestination(formData.get("testPhone") as string | null);
  if (!destination) {
    return {
      status: "error",
      message: "Enter a valid 10-digit Indian mobile number.",
      campaignName,
    };
  }

  const templateParams = buildReminderParams({
    parentName: (formData.get("parentName") as string | null) || "अभिभावक",
    studentName: (formData.get("studentName") as string | null) || "Test Student",
    studentClass: (formData.get("studentClass") as string | null) || "Class 5",
    dueAmount: Number(formData.get("dueAmount")) || 9100,
  });

  const result = await sendAisensyCampaignMessage({
    campaignName,
    destination,
    userName: templateParams[0],
    templateParams,
    source: "veerpatta-fees-app/admin-tools-test",
  });

  // Everything the provider told us, passed through rather than summarised, so
  // staff can tell a rejected campaign name from a bad number without opening
  // the AiSensy dashboard.
  const sent = { destination, campaignName, templateParams } as const;

  return result.ok
    ? {
        status: "success",
        message: `AiSensy accepted it for ${destination}. Check that phone.`,
        httpStatus: result.status,
        messageId: result.messageId,
        ...sent,
      }
    : {
        status: "error",
        message: `AiSensy refused it (HTTP ${result.status}).`,
        httpStatus: result.status,
        providerError: result.error,
        ...sent,
      };
}
