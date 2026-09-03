"use server";

import { insertDefaulterContacts } from "@/modules/defaulters/data/contacts";
import { createAdminClient } from "@/platform/supabase/admin";
import { requireStaffPermission } from "@/platform/supabase/session";
import { isAisensyConfigured, sendAisensyCampaignMessage } from "@/modules/whatsapp/data/aisensy";
import { getFeePolicySummary } from "@/modules/fees/data/policy";
import {
  buildInstallmentCalendar,
} from "@/modules/whatsapp/domain/installment-calendar";
import {
  drainPendingFinancialRefresh,
  istToday,
  loadReminderAudience,
  parseReminderFilters,
  resolveCurrentSessionLabel,
  type ReminderCandidate,
  type ReminderFilters,
} from "@/modules/whatsapp/domain/fee-reminders";
import { addDays, CADENCE_VALUES } from "@/modules/whatsapp/domain/reminder-cadence";
import { toWhatsappDestination } from "@/modules/whatsapp/domain/phone";
import { loadGuardFacts, recordTestSend } from "@/modules/whatsapp/data/guard-context";
import {
  evaluateSendGuards,
  resolveGuards,
} from "@/modules/whatsapp/domain/send-guards";
import {
  campaignFor,
  campaignNameFor,
  isCampaignApproved,
  DEFAULT_LANGUAGE,
  DEFAULT_SITUATION,
  isNoticeLanguage,
  isNoticeSituation,
  type CampaignDescriptor,
  type NoticeValues,
} from "@/modules/whatsapp/domain/campaigns";
import { isoFromDdMmYyyy } from "@/platform/helpers/date";
import { executeReminderRun } from "@/modules/whatsapp/data/run-sender";

export type SendRemindersState = {
  /**
   * The judgements standing in the way of this run, when it was refused for
   * one. The screen turns each into a tick-box; agreeing to all of them plus a
   * reason lets the run through, and both land on the run record.
   */
  guards?: Array<{ code: string; message: string }>;
  status: "idle" | "success" | "partial" | "error";
  message?: string;
  sent?: number;
  failed?: number;
  alreadySentToday?: number;
  failures?: Array<{ admissionNo: string; studentName: string; error: string }>;
};


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
    // The very same calendar the screen built, from the very same policy and
    // window. The audience rebuild below is what actually decides who is
    // messaged, so a calendar this action could not see would send the courtesy
    // notice to a different set of families than the office ticked — the exact
    // failure the situation and the filters travel in the form to prevent.
    const policy = await getFeePolicySummary({ useAdmin: true }).catch(() => null);
    const calendar = buildInstallmentCalendar({
      schedule: policy?.installmentSchedule ?? [],
      today,
      windowDays: filters.preDueWindowDays,
    });
    const audience = await loadReminderAudience(supabase, filters, calendar);
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

  // Every pre-send guard, from the one list the cron reads too.
  //
  // `domain/send-guards` owns them because there are now two ways to start a
  // run, and "the scheduled runner applies every guard the manual path applies"
  // is only true by construction if there is one list. The date rule is in
  // there: every forward-looking notice needs a date parents can still meet, and
  // `late_fee_applied` needs none at all because it prints none.
  const lastDateIso = isoFromDdMmYyyy(filters.lastDate);
  // The facts only the database can answer — quiet hours, the holiday list, the
  // budget, whether this campaign was tested today. Best-effort throughout: a
  // guard that cannot load its data falls back to the value that permits.
  const facts = await loadGuardFacts({
    supabase,
    lastDateIso,
    campaignName: campaignNameFor(filters.situation, filters.language) ?? "",
    requireRecentTest: true,
  });

  const guards = evaluateSendGuards({
    providerReady: isAisensyConfigured(),
    campaignApproved: isCampaignApproved(filters.situation, filters.language),
    situation: filters.situation,
    lastDateIso,
    lastDateLabel: filters.lastDate,
    today,
    recipientCount: candidates.length,
    ...facts,
  });

  // What the admin ticked, and why. An override is only honoured when both are
  // present — the point is that the decision lands on the run, not that it is
  // easy to get past.
  const overrideCodes = formData.getAll("overrideGuard").map(String).filter(Boolean);
  const overrideReason = String(formData.get("overrideReason") ?? "").trim();
  const resolved = resolveGuards(
    guards,
    overrideCodes.length > 0 ? { codes: overrideCodes, reason: overrideReason } : null,
  );
  if (!resolved.allowed) {
    return {
      status: "error",
      message: resolved.message ?? "This run was refused.",
      // So the screen can render the tick-boxes for exactly what is in the way.
      guards: guards.overridable.map((finding) => ({
        code: finding.code,
        message: finding.message,
      })),
    };
  }

  // Safe after the approval guard above: `campaignFor` throws for an unapproved
  // notice, and `campaign_unapproved` has already returned by here.
  const campaignName = campaignFor(filters.situation, filters.language).campaignName;

  // The whole run — opening the record, grouping into families, sending, closing
  // and logging — lives in `data/run-sender`, because there are two ways to
  // start one: this action, and the scheduled cron. One executor is what makes
  // "the cron applies every guard the manual path applies" true by construction
  // rather than by remembering.
  // Whichever saved campaign the office loaded, or null for an ad-hoc send.
  // Both are real runs; only one has a name attached.
  const campaignId = (formData.get("campaignId") as string | null)?.trim() || null;

  // A held-back family is money the school does not chase, so the field is
  // admin-only and re-checked here rather than trusted from the form.
  let canHoldOut = false;
  try {
    await requireStaffPermission("settings:write");
    canHoldOut = true;
  } catch {
    canHoldOut = false;
  }
  const holdoutPercent = Math.min(
    50,
    Math.max(0, Number(formData.get("holdoutPercent") ?? 0) || 0),
  );

  const outcome = await executeReminderRun({
    supabase,
    candidates,
    filters,
    sessionLabel,
    today,
    lastDateIso,
    campaignName,
    campaignId,
    staffId,
    source: "manual",
    // Admin-only, off by default, and never persisted: a holdout is a decision
    // about THIS run. The form only renders the field for an admin, and this
    // re-reads the permission rather than trusting that.
    holdoutPercent: canHoldOut ? holdoutPercent : 0,
    overriddenGuards: resolved.overridden,
    overrideReason: resolved.overridden.length > 0 ? overrideReason : null,
    logContacts: insertDefaulterContacts,
    scheduledFor: null,
  });

  const { sent, failed, alreadySentToday, failures, heldOut } = outcome;

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
    heldOut > 0 ? `${heldOut} held back for comparison` : null,
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

export type CadenceState = {
  status: "idle" | "success" | "error";
  message?: string;
};

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
  // Held, because the test is RECORDED against whoever ran it — the
  // untested-campaign guard reads that record before letting a run reach real
  // families.
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

  // Recorded in its OWN table, never in the send log.
  //
  // A row in the send log claims a student's day, and the unique index would
  // then drop that family out of the real run — which is why "a test never
  // writes to the send log" is a standing rule, pinned by
  // tests/ui/whatsapp-reminders-screen.test.ts. `recordTestSend` writes to
  // `whatsapp_test_sends`, which has no student_id and no day to claim, so the
  // untested-campaign guard can read it without breaking that rule.
  //
  // (The send log is deliberately not named in this function: the test asserts
  // on the source text, and naming it here would defeat the check.)
  await recordTestSend({
    supabase: createAdminClient(),
    campaignName,
    destination,
    succeeded: result.ok,
    providerMessageId: result.ok ? result.messageId : null,
    errorMessage: result.ok ? null : result.error,
    staffId,
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
