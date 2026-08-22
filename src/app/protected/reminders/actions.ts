"use server";

import { recordActivity } from "@/modules/activity/data/events";
import { insertDefaulterContacts } from "@/modules/defaulters/data/contacts";
import { createAdminClient } from "@/platform/supabase/admin";
import { requireStaffPermission } from "@/platform/supabase/session";
import { isAisensyConfigured, sendAisensyCampaignMessage } from "@/modules/whatsapp/data/aisensy";
import {
  drainPendingFinancialRefresh,
  istToday,
  noticeValuesFor,
  loadReminderAudience,
  parseReminderFilters,
  resolveCurrentSessionLabel,
  type ReminderCandidate,
  type ReminderFilters,
} from "@/modules/whatsapp/domain/fee-reminders";
import { addDays, CADENCE_VALUES } from "@/modules/whatsapp/domain/reminder-cadence";
import { toWhatsappDestination } from "@/modules/whatsapp/domain/phone";
import {
  campaignFor,
  DEFAULT_LANGUAGE,
  DEFAULT_SITUATION,
  isNoticeLanguage,
  isNoticeSituation,
  type CampaignDescriptor,
  type NoticeValues,
} from "@/modules/whatsapp/domain/campaigns";
import { isoFromDdMmYyyy } from "@/platform/helpers/date";
import { closeRun, openRun } from "@/modules/whatsapp/data/campaign-store";
import { lateFeePhrase } from "@/modules/whatsapp/domain/late-fee";

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
  const today = istToday();

  const selected = new Set(formData.getAll("studentId").map(String).filter(Boolean));
  if (selected.size === 0) {
    return { status: "error", message: "No students selected." };
  }

  const supabase = createAdminClient();

  let sessionLabel: string;
  let filters: ReminderFilters;
  let candidates: ReminderCandidate[];
  try {
    sessionLabel = await resolveCurrentSessionLabel(supabase);
    // A discount applied a minute ago may still be sitting in the refresh queue.
    // Drain it first, so the amount quoted below is the one the ledger holds now.
    await drainPendingFinancialRefresh(supabase);
    filters = filtersFromForm(formData, sessionLabel);
    const audience = await loadReminderAudience(supabase, filters);
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

  // The six approved templates take their date as a variable, so nothing expires
  // — but a date already in the past would tell a parent to beat a deadline that
  // has gone. This is the live replacement for the old fixed-deadline guard.
  // Every v2 notice carries a date, including prevyear — it gained a settle-by
  // date precisely because a late-fee line with no date says nothing.
  const lastDateIso = isoFromDdMmYyyy(filters.lastDate);
  if (!lastDateIso || lastDateIso < today) {
    return {
      status: "error",
      message: !lastDateIso
        ? "Pick a last date for this notice before sending."
        : `The last date on this notice is ${filters.lastDate}, which has already passed. Pick a date parents can still meet.`,
    };
  }

  let campaign: CampaignDescriptor;
  try {
    campaign = campaignFor(filters.situation, filters.language);
  } catch (caught) {
    return {
      status: "error",
      message: caught instanceof Error ? caught.message : "No campaign for that notice.",
    };
  }
  const campaignName = campaign.campaignName;

  if (candidates.length === 0) {
    return {
      status: "error",
      message:
        "None of the selected students are still eligible — they may have paid, or been flagged no-call, since this page loaded. Reload and try again.",
    };
  }

  // Opened BEFORE the first message. A crash halfway through then leaves a run
  // that says what was attempted, rather than no record at all — and `run_id` is
  // stamped on each send as it is claimed, so the rows are grouped even if this
  // action never reaches its own end.
  //
  // `campaignId` is whichever saved campaign the office loaded, or null for an
  // ad-hoc send. Both are real runs; only one has a name attached.
  const campaignId = (formData.get("campaignId") as string | null)?.trim() || null;
  const runId = await openRun(supabase, {
    campaignId,
    sessionLabel,
    campaignName,
    situation: filters.situation,
    language: filters.language,
    filters: {
      maxTotalPaid: filters.maxTotalPaid,
      minDueAmount: filters.minDueAmount,
      installments: filters.installments,
      classId: filters.classId,
      includeRte: filters.includeRte,
    },
    lastDate: lastDateIso,
    // The phrase as it went out, not the amount and basis it came from: the
    // campaign is editable and what a parent read is not.
    lateFeePhrase: lateFeePhrase(filters.lateFeeAmount, filters.lateFeeBasis, filters.language),
    selectedCount: candidates.length,
    startedBy: staffId,
  });

  let sent = 0;
  let failed = 0;
  let alreadySentToday = 0;
  let moneyQuoted = 0;
  const failures: NonNullable<SendRemindersState["failures"]> = [];
  const sentStudentIds: string[] = [];

  for (let index = 0; index < candidates.length; index += SEND_CONCURRENCY) {
    const batch = candidates.slice(index, index + SEND_CONCURRENCY);
    const outcomes = await Promise.all(
      batch.map((candidate) =>
        sendOne({ supabase, candidate, campaign, filters, sessionLabel, today, staffId, runId }),
      ),
    );
    for (let position = 0; position < outcomes.length; position += 1) {
      const outcome = outcomes[position];
      if (outcome.kind === "sent") {
        sent += 1;
        moneyQuoted += batch[position].dueAmount;
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

  await closeRun(supabase, runId, { sent, failed, already: alreadySentToday, moneyQuoted });

  // The office's contact history, so a reminder shows on the student's profile
  // and the defaulters cadence knows the family was reached today. Best-effort:
  // the message has already gone, and a logging hiccup must not be reported as
  // a failed send.
  //
  // One round trip, not one per family. As a loop this was 141 sequential
  // queries running after every message had already been delivered — seconds of
  // spinner for work the parent had already received.
  try {
    await insertDefaulterContacts(
      sentStudentIds.map((studentId) => ({
        studentId,
        sessionLabel,
        channel: "whatsapp" as const,
        outcome: "other" as const,
        note: `WhatsApp fee reminder sent (${campaignName})`,
      })),
    );
  } catch (caught) {
    console.warn("[whatsapp-reminders] contact log failed", caught);
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

  // Deliberately NO revalidatePath here.
  //
  // The page is `export const revalidate = 0` — nothing about it is cached, so
  // there is nothing to invalidate. What revalidatePath DID do was force Next to
  // re-render this route and ship the whole 150-family payload as part of THIS
  // action's response, so `useFormStatus().pending` stayed true through a full
  // re-derivation of the audience. The office watched "Sending…" long after all
  // 141 messages had been delivered, and on a phone that reads as a hang.
  //
  // The client refreshes instead, from useActionFeedback, once it has the
  // result: the button releases, the toast names the count, and the list
  // re-reads a moment later.

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
  campaign: CampaignDescriptor;
  filters: ReminderFilters;
  sessionLabel: string;
  today: string;
  staffId: string | null;
  /** Null when the run record could not be opened; the send still happens. */
  runId: string | null;
}): Promise<SendOutcome> {
  const { supabase, candidate, campaign, filters, sessionLabel, today, staffId, runId } = args;
  const campaignName = campaign.campaignName;
  // Per-situation: 6 slots for fee_due and balance, 5 for prevyear. A count that
  // does not match is refused by AiSensy with "Template params does not match
  // the campaign", which is why the registry owns both the count and the order.
  const templateParams = campaign.buildParams(noticeValuesFor(candidate, filters));

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
      // Stamped on the claim, so the grouping survives even if this action dies
      // before it can close the run. NOT part of the unique index — that index
      // is what stops a family being messaged the same notice twice in one day,
      // and including run_id would let a second run that day repeat all of them.
      run_id: runId,
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

export type CadenceState = {
  status: "idle" | "success" | "error";
  message?: string;
};

/** Default length of a one-tap "not this time". */
const SNOOZE_DAYS = 7;

/**
 * Write a WhatsApp cadence / snooze without touching `no_call`.
 *
 * Update first, insert only if there was no row. A plain upsert would be wrong:
 * `student_collection_flags.no_call` DEFAULTS TO TRUE, so an insert that did not
 * name it would quietly drop the family from the Defaulters call queue — the
 * exact opposite of "message them less often, keep calling them".
 */
async function writeReminderFlags(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  studentId: string,
  sessionLabel: string,
  patch: { whatsapp_cadence?: string; whatsapp_snoozed_until?: string | null },
): Promise<void> {
  const { data: updated, error: updateError } = await supabase
    .from("student_collection_flags")
    .update(patch)
    .eq("student_id", studentId)
    .eq("session_label", sessionLabel)
    .select("id");

  if (updateError) throw new Error(updateError.message);
  if (updated && updated.length > 0) return;

  const { error: insertError } = await supabase.from("student_collection_flags").insert({
    student_id: studentId,
    session_label: sessionLabel,
    no_call: false, // never infer this — see above
    ...patch,
  });

  if (insertError) throw new Error(insertError.message);
}

/**
 * "Remind this family every run / weekly / fortnightly / monthly / never."
 *
 * WhatsApp only. The Defaulters call queue reads `no_call`, which this never
 * writes, so a family set to `monthly` still gets called on the usual cadence.
 */
export async function setReminderCadenceAction(
  _prev: CadenceState,
  formData: FormData,
): Promise<CadenceState> {
  try {
    await requireStaffPermission("settings:write");
  } catch {
    return { status: "error", message: "Permission denied." };
  }

  const studentId = String(formData.get("studentId") ?? "").trim();
  const cadence = String(formData.get("cadence") ?? "").trim();
  // Same list the database's check constraint enforces, from one source.
  if (!studentId || !CADENCE_VALUES.includes(cadence)) {
    return { status: "error", message: "Pick a family and a cadence." };
  }

  const supabase = createAdminClient();
  try {
    const sessionLabel = await resolveCurrentSessionLabel(supabase);
    // Changing the cadence clears any snooze: the office just made a fresh,
    // more considered decision about this family, and leaving a stale snooze
    // underneath it would silently outrank what they chose.
    await writeReminderFlags(supabase, studentId, sessionLabel, {
      whatsapp_cadence: cadence,
      whatsapp_snoozed_until: null,
    });
  } catch (caught) {
    return {
      status: "error",
      message: caught instanceof Error ? caught.message : "Could not save that.",
    };
  }

  // No revalidatePath — see sendRemindersAction. The control refreshes the
  // router itself once it has the answer.
  return { status: "success", message: "Reminder setting saved." };
}

/** One tap: hold this family back for a week, then let them return on their own. */
export async function snoozeReminderAction(
  _prev: CadenceState,
  formData: FormData,
): Promise<CadenceState> {
  try {
    await requireStaffPermission("settings:write");
  } catch {
    return { status: "error", message: "Permission denied." };
  }

  const studentId = String(formData.get("studentId") ?? "").trim();
  if (!studentId) return { status: "error", message: "No student." };

  const days = Number(formData.get("days")) || SNOOZE_DAYS;
  const until = addDays(istToday(), days);

  const supabase = createAdminClient();
  try {
    const sessionLabel = await resolveCurrentSessionLabel(supabase);
    await writeReminderFlags(supabase, studentId, sessionLabel, {
      whatsapp_snoozed_until: until,
    });
  } catch (caught) {
    return {
      status: "error",
      message: caught instanceof Error ? caught.message : "Could not snooze that family.",
    };
  }

  return { status: "success", message: `Held back until ${until}.` };
}

/** Undo: back to every run, no snooze. */
export async function resumeReminderAction(
  _prev: CadenceState,
  formData: FormData,
): Promise<CadenceState> {
  try {
    await requireStaffPermission("settings:write");
  } catch {
    return { status: "error", message: "Permission denied." };
  }

  const studentId = String(formData.get("studentId") ?? "").trim();
  if (!studentId) return { status: "error", message: "No student." };

  const supabase = createAdminClient();
  try {
    const sessionLabel = await resolveCurrentSessionLabel(supabase);
    await writeReminderFlags(supabase, studentId, sessionLabel, {
      whatsapp_cadence: "every_run",
      whatsapp_snoozed_until: null,
    });
  } catch (caught) {
    return {
      status: "error",
      message: caught instanceof Error ? caught.message : "Could not resume that family.",
    };
  }

  return { status: "success", message: "Back on the list." };
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
  const situation = String(formData.get("situation") ?? "");
  const language = String(formData.get("language") ?? "");
  let campaign: CampaignDescriptor;
  try {
    campaign = campaignFor(
      isNoticeSituation(situation) ? situation : DEFAULT_SITUATION,
      isNoticeLanguage(language) ? language : DEFAULT_LANGUAGE,
    );
  } catch (caught) {
    return {
      status: "error",
      message: caught instanceof Error ? caught.message : "No campaign for that notice.",
    };
  }
  const campaignName = campaign.campaignName;

  const destination = toWhatsappDestination(formData.get("testPhone") as string | null);
  if (!destination) {
    return {
      status: "error",
      message: "Enter a valid 10-digit Indian mobile number.",
      campaignName,
    };
  }

  // Fallbacks are the campaign's own Meta-submitted samples, so "leave it blank"
  // still produces a message with the right shape for that template.
  const text = (key: string, fallback: string) =>
    (formData.get(key) as string | null)?.trim() || fallback;
  const amount = (key: string, fallback: number | undefined) => {
    const raw = Number(formData.get(key));
    return Number.isFinite(raw) && raw > 0 ? raw : (fallback ?? 0);
  };
  const sample = campaign.sample;

  // The panel posts the SKELETON slot names — one 7-slot shape for all six
  // campaigns — and slots 4 and 5 mean something different per notice. This
  // mapping must agree with `asValues()` in the panel and with the per-situation
  // builders in `campaigns.ts`, or a test would prove the wrong message.
  const shared = {
    parentName: text("parentName", sample.parentName),
    studentName: text("studentName", sample.studentName),
    studentClass: text("studentClass", sample.studentClass),
    lastDate: text("date", sample.lastDate ?? ""),
    // Never empty: WhatsApp rejects an empty parameter, and the registry's
    // fallback wording is applied downstream if this somehow arrives blank.
    lateFeePhrase: text("lateFeePhrase", sample.lateFeePhrase ?? ""),
  };
  const slotAmount = amount("amount", undefined);
  const contextLine = formData.get("contextLine") as string | null;

  const values: NoticeValues =
    campaign.situation === "fee_due"
      ? {
          ...shared,
          installmentPhrase: contextLine?.trim() || (sample.installmentPhrase ?? ""),
          amountDue: slotAmount || (sample.amountDue ?? 0),
        }
      : campaign.situation === "balance"
        ? {
            ...shared,
            receivedSoFar: Number(contextLine) || (sample.receivedSoFar ?? 0),
            balanceDue: slotAmount || (sample.balanceDue ?? 0),
          }
        : {
            ...shared,
            prevSessionLabel: contextLine?.trim() || (sample.prevSessionLabel ?? ""),
            prevYearBalance: slotAmount || (sample.prevYearBalance ?? 0),
          };

  const templateParams = campaign.buildParams(values);

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
