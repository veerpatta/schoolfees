"use server";

import { insertDefaulterContacts } from "@/modules/defaulters/data/contacts";
import { createAdminClient } from "@/platform/supabase/admin";
import { requireAnyStaffPermission, requireStaffPermission } from "@/platform/supabase/session";
import { renderNoticeBody } from "@/modules/whatsapp/domain/campaign-bodies";
import { isAisensyConfigured, sendAisensyCampaignMessage } from "@/modules/whatsapp/data/aisensy";
import { getFeePolicySummary } from "@/modules/fees/data/policy";
import {
  buildInstallmentCalendar,
  isFinalNoticeWindow,
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
  describeCampaign,
  isCampaignApproved,
  DEFAULT_LANGUAGE,
  DEFAULT_SITUATION,
  isNoticeLanguage,
  isNoticeSituation,
  type CampaignDescriptor,
} from "@/modules/whatsapp/domain/campaigns";
import { noticeValuesFromSlots } from "@/modules/whatsapp/domain/test-send-values";
import { REMINDER_QUERY_KEYS } from "@/modules/whatsapp/domain/audience";
import { searchSessionStudents } from "@/modules/whatsapp/data/student-lookup";
import { isoFromDdMmYyyy } from "@/platform/helpers/date";
import { executeReminderRun } from "@/modules/whatsapp/data/run-sender";
import {
  oneMessagePerFamilyEnabled,
  rememberLastUsedNoticeSettings,
} from "@/modules/whatsapp/data/reminder-settings";
import { redirect } from "next/navigation";

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


/**
 * A posted form as a `ParamReader`.
 *
 * `getAll(...).join(",")`, never `get(...)`: the installment control is four
 * checkboxes sharing one name, so a form posts `installments=1&installments=2`
 * and `get` would read "1" — an audience of families who owe on installment 1
 * regardless of installment 2, which is a different set of parents. Joining
 * with a comma lands on the same string the query-string form uses, so the two
 * readers stay interchangeable. `readerFor` does the same on the other side.
 */
function filtersFromForm(formData: FormData, sessionLabel: string): ReminderFilters {
  return parseReminderFilters((key) => {
    const values = formData.getAll(key).filter((value): value is string => typeof value === "string");
    return values.length > 0 ? values.join(",") : null;
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
  let finalWindowOpen: boolean | null = null;
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
    finalWindowOpen = calendar.next
      ? isFinalNoticeWindow(calendar.next.daysUntilDue)
      : null;
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
  // there: every forward-looking notice needs a date parents can still meet;
  // `late_fee_applied` needs none because it prints none, and `promise_due`
  // needs none because it prints each family's own.
  const lastDateIso = isoFromDdMmYyyy(filters.lastDate);
  // The facts only the database can answer — quiet hours, the holiday list, the
  // budget, whether this campaign has ever gone out. Best-effort throughout: a
  // guard that cannot load its data falls back to the value that permits.
  const facts = await loadGuardFacts({
    supabase,
    lastDateIso,
    campaignName: campaignNameFor(filters.situation, filters.language) ?? "",
    requireProvenCampaign: true,
  });

  const guards = evaluateSendGuards({
    providerReady: isAisensyConfigured(),
    campaignApproved: isCampaignApproved(filters.situation, filters.language),
    situation: filters.situation,
    lastDateIso,
    lastDateLabel: filters.lastDate,
    today,
    recipientCount: candidates.length,
    // Since the template stopped deciding the audience, a template can be
    // pointed at families who cannot fill its slots. Counted over the families
    // ACTUALLY selected, not the whole list.
    noticeFactGaps: candidates.filter((candidate) => candidate.missingFacts.length > 0).length,
    // The three-day rule for `upcoming_final`, moved out of the audience query
    // and in here where it belongs — it is a fact about the run, not a family.
    finalWindowOpen: finalWindowOpen,
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
    oneMessagePerFamily: await oneMessagePerFamilyEnabled(supabase),
  });

  const { sent, failed, alreadySentToday, failures, heldOut } = outcome;

  // What went on this message is what tomorrow's screen opens on. Best-effort,
  // after the send: the messages have gone whatever happens here.
  await rememberLastUsedNoticeSettings(supabase, sessionLabel, {
    lastDate: filters.lastDate,
    lateFeeAmount: filters.lateFeeAmount,
    lateFeeBasis: filters.lateFeeBasis,
  });

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

/**
 * Apply on the notice card: remember the date and the late fee, then land on
 * the same URL a GET would have.
 *
 * A plain GET form could not remember anything, and the office was retyping
 * "pay by Saturday, Rs. 2,000 per installment" every morning because the screen
 * opened on the calendar's default. The redirect keeps the notice linkable and
 * the back button honest — the same rule the picker's chips follow.
 */
export async function applyNoticeSettingsAction(formData: FormData): Promise<void> {
  // The canonical key list, from `domain/audience`. It used to be a copy kept
  // here, and a key added to the screen but not to the copy is a key that
  // silently resets the moment somebody presses Apply.
  const params = new URLSearchParams();
  for (const key of REMINDER_QUERY_KEYS) {
    const values = formData
      .getAll(key)
      .filter((value): value is string => typeof value === "string" && value.trim() !== "");
    // Same comma join as `filtersFromForm`, for the same reason: four
    // checkboxes share the `installments` name.
    if (values.length > 0) params.set(key, values.map((value) => value.trim()).join(","));
  }

  // Remembering is a write, so it needs the sending permission; viewing staff
  // still get their filtered list, just not a saved default.
  try {
    await requireStaffPermission("settings:write");
    const supabase = createAdminClient();
    const sessionLabel = await resolveCurrentSessionLabel(supabase);
    const filters = filtersFromForm(formData, sessionLabel);
    if (filters.lastDate) {
      await rememberLastUsedNoticeSettings(supabase, sessionLabel, {
        lastDate: filters.lastDate,
        lateFeeAmount: filters.lateFeeAmount,
        lateFeeBasis: filters.lateFeeBasis,
      });
    }
  } catch {
    // Best-effort: the list still applies.
  }

  redirect(`/protected/reminders?${params.toString()}`);
}

/**
 * Put one student on the list by hand, whatever the filters say.
 *
 * A server action rather than a typeahead, deliberately. `/protected/reminders`
 * has ~480 gzip bytes of headroom against its bundle ceiling, and a search box
 * that resolves on the server costs the browser nothing — the whole audience
 * builder is GET forms, links and this.
 *
 * An exact admission number adds that child straight away. Anything ambiguous
 * lands back on the screen with `?find=` and the matches rendered as Add links,
 * so the office picks a person rather than trusting a guess. Nobody is ever
 * added by a name that matched two children.
 *
 * Gated on `settings:view`, not `settings:write`: choosing who WOULD be
 * messaged is not sending, and staff who may print the collection list may
 * certainly build it.
 */
export async function addReminderStudentAction(formData: FormData): Promise<void> {
  const params = new URLSearchParams();
  for (const key of REMINDER_QUERY_KEYS) {
    const values = formData
      .getAll(key)
      .filter((value): value is string => typeof value === "string" && value.trim() !== "");
    if (values.length > 0) params.set(key, values.map((value) => value.trim()).join(","));
  }

  const query = String(formData.get("addStudent") ?? "").trim();
  if (!query) redirect(`/protected/reminders?${params.toString()}`);

  try {
    await requireAnyStaffPermission(["settings:view", "settings:write"]);
  } catch {
    redirect(`/protected/reminders?${params.toString()}`);
  }

  const supabase = createAdminClient();
  const sessionLabel = await resolveCurrentSessionLabel(supabase);
  const matches = await searchSessionStudents(supabase, sessionLabel, query);

  if (matches.length === 1) {
    const existing = (params.get("include") ?? "").split(",").filter(Boolean);
    params.set("include", [...new Set([...existing, matches[0].studentId])].join(","));
    // An added student is on the list; leaving the search term in the box would
    // re-offer the same person on the next render.
    params.delete("find");
  } else {
    // Zero or many. The screen renders the matches — or says there were none —
    // and the office picks.
    params.set("find", query);
  }

  redirect(`/protected/reminders?${params.toString()}`);
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
 * The test panel's preview, rendered on the server.
 *
 * The panel used to render this in the browser, which meant every per-student
 * template body — twenty-four of them in two languages — shipped in the client
 * bundle of a route with a gzip ceiling that only ratchets down, so that ONE of
 * them could be shown. The bodies now live in `domain/campaign-bodies`, which
 * no `ui/` file may import, and the panel asks here instead.
 *
 * Same mapping as the send (`noticeValuesFromSlots`) and same renderer as the
 * page's preview, so what staff read is what a test would post. Previews an
 * unapproved notice too: the office needs to read what is awaiting Meta.
 *
 * Read-only, and gated on `settings:view` like the page — never `settings:write`,
 * which is the SEND permission.
 */
export async function previewNoticeAction(input: {
  situation: string;
  language: string;
  form: Record<string, string>;
}): Promise<string | null> {
  try {
    await requireAnyStaffPermission(["settings:view", "settings:write"]);
  } catch {
    return null;
  }
  const situation = isNoticeSituation(input.situation) ? input.situation : DEFAULT_SITUATION;
  const language = isNoticeLanguage(input.language) ? input.language : DEFAULT_LANGUAGE;
  const campaign = describeCampaign(situation, language);
  if (!campaign) return null;
  const values = noticeValuesFromSlots(situation, input.form ?? {}, campaign.sample);
  return renderNoticeBody(situation, language, campaign.buildParams(values));
}

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

  // The panel posts the SKELETON slot names, and slots 4-6 mean something
  // different per notice. ONE mapping — `domain/test-send-values.ts` — turns
  // those into named values here and in the panel's preview, so the message
  // staff read and the message they send cannot differ. Fallbacks are the
  // campaign's own Meta-submitted sample, slot by slot, so "leave it blank"
  // still produces a message with the right shape for that template.
  const values = noticeValuesFromSlots(
    campaign.situation,
    Object.fromEntries(
      campaign.slotOrder.map((slot) => [slot, formData.get(slot) as string | null]),
    ),
    campaign.sample,
  );

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
