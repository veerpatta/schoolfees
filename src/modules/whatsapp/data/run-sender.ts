import "server-only";

import { recordActivity } from "@/modules/activity/data/events";
import { sendAisensyCampaignMessage } from "@/modules/whatsapp/data/aisensy";
import { closeRun, openRun } from "@/modules/whatsapp/data/campaign-store";
import {
  campaignFor,
  type CampaignDescriptor,
} from "@/modules/whatsapp/domain/campaigns";
import {
  groupIntoFamilies,
  type ReminderFamily,
} from "@/modules/whatsapp/domain/family-grouping";
import {
  chooseFamilyCampaign,
  familyNoticeValuesFor,
} from "@/modules/whatsapp/domain/family-notice";
import {
  noticeValuesFor,
  type ReminderCandidate,
  type ReminderFilters,
} from "@/modules/whatsapp/domain/fee-reminders";
import { randomBytes } from "node:crypto";

import { isoFromDdMmYyyy } from "@/platform/helpers/date";

import { lateFeePhrase } from "@/modules/whatsapp/domain/late-fee";
import { splitHoldout } from "@/modules/whatsapp/domain/run-measurement";

/**
 * One reminder run, from opening the record to closing it.
 *
 * Extracted from `sendRemindersAction` the moment a second way to start a run
 * appeared — the scheduled cron. The cron is required to apply every guard the
 * manual path applies, and the only way that stays true as both grow is if
 * there is ONE executor and both callers reach it. Two copies would drift
 * exactly the way the filter parser and the notice-values mapping drifted
 * before, and the failure here reaches real parents.
 *
 * The guards themselves are NOT here. They are pure, they live in
 * `domain/send-guards`, and each caller evaluates them before calling this —
 * because the cron reports a refusal to a log and the action reports it to a
 * person, and those are different jobs.
 *
 * Everything about who gets what message is decided upstream: this is handed a
 * finished candidate list and does the sending.
 */

/** How many families are messaged at once. */
const SEND_CONCURRENCY = 6;

export type ReminderRunOutcome = {
  runId: string | null;
  sent: number;
  failed: number;
  alreadySentToday: number;
  moneyQuoted: number;
  failures: Array<{ admissionNo: string; studentName: string; error: string }>;
  /** How many messages were actually billed, including second numbers. */
  messagesAttempted: number;
  /** Families deliberately not messaged, so the run has a control group. */
  heldOut: number;
};

export type ExecuteReminderRunArgs = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  candidates: ReminderCandidate[];
  filters: ReminderFilters;
  sessionLabel: string;
  /** IST `YYYY-MM-DD`. */
  today: string;
  /** The notice's date, already validated by the guards. */
  lastDateIso: string | null;
  campaignName: string;
  /** The saved campaign this run came from, or null for an ad-hoc send. */
  campaignId: string | null;
  /** Null for a cron run, which is the honest record rather than a guess. */
  staffId: string | null;
  source: "manual" | "cron";
  /**
   * Hold back a random share of the audience, so the run has a control group.
   *
   * 0 means everybody is messaged, which is the default and the normal case. A
   * holdout means deliberately NOT chasing money the school is owed, in exchange
   * for the only causal number this system can produce — so it is a decision an
   * admin makes on purpose, per run, and never a setting that persists.
   */
  holdoutPercent?: number;
  /** Guard codes an admin agreed to override, and why. Written to the run. */
  overriddenGuards?: string[];
  overrideReason?: string | null;
  /**
   * Write the messaged families into the office's contact history.
   *
   * Injected rather than imported, and that is a layering decision rather than
   * taste: `defaulters/ui` already imports `whatsapp/domain/render`, so this
   * module importing `defaulters/data` closes a module cycle that
   * `npm run quality:architecture` counts and refuses. The APP layer may import
   * both, so both callers pass `insertDefaulterContacts` in.
   *
   * Optional, because a caller that does not want a contact log — a test, or a
   * future path that logs differently — should not have to fake one.
   */
  logContacts?: (
    rows: Array<{
      studentId: string;
      sessionLabel: string;
      channel: "whatsapp";
      outcome: "other";
      bulk: boolean;
      note: string;
    }>,
  ) => Promise<void>;
  /** The schedule slot this run satisfies, or null for an ad-hoc send. */
  scheduledFor: string | null;
  /**
   * Log what WOULD be sent and call nobody.
   *
   * No run is opened, no row is claimed and no provider call is made, so a dry
   * run is free and leaves no trace. It exists so the cron can be pointed at
   * production and read before it is trusted with it.
   */
  dryRun?: boolean;
};

export async function executeReminderRun(
  args: ExecuteReminderRunArgs,
): Promise<ReminderRunOutcome> {
  const {
    supabase,
    candidates,
    filters,
    sessionLabel,
    today,
    lastDateIso,
    campaignName,
    campaignId,
    staffId,
    source,
    scheduledFor,
    dryRun = false,
    logContacts,
    holdoutPercent = 0,
    overriddenGuards = [],
    overrideReason = null,
  } = args;

  // Anyone already logged today is counted and never grouped.
  //
  // Since 2026-09-04 one notice logs under TWO campaign names — per-child for a
  // one-child phone, family for siblings — and the unique index that stops a
  // second message only knows one name at a time. A sibling who paid at noon
  // leaves a two-child family as a one-child one, and a second run would claim
  // a fresh per-child row for a parent who read the family message this
  // morning. `sentToday` is read against both names, so this is what sees it.
  // A true same-second race between two staff still lands on the index.
  const fresh = candidates.filter((candidate) => !candidate.sentToday);
  const alreadyLoggedToday = candidates.length - fresh.length;

  // Split BEFORE grouping into families, so a held-out student cannot arrive as
  // a sibling on somebody else's message. Splitting after would mean a "held
  // out" family still got messaged, which is worse than not running the
  // experiment at all.
  const { messaged: toMessage, heldOut } = splitHoldout(fresh, holdoutPercent);

  // One phone, one message. Grouping happens here rather than in the audience so
  // the screen keeps showing, ticking and skipping per child.
  const families = groupIntoFamilies(
    toMessage.map((candidate) => ({
      studentId: candidate.studentId,
      studentName: candidate.studentName,
      studentClass: candidate.studentClass,
      parentName: candidate.parentName,
      destination: candidate.destination,
      dueAmount: candidate.dueAmount,
      preferredLanguage: candidate.preferredLanguage,
      sentCount: candidate.sentCount,
      secondaryDestination: candidate.secondaryDestination,
    })),
    filters.language,
  );

  const messagesAttempted = families.reduce(
    (total, family) => total + family.destinations.length,
    0,
  );

  if (dryRun) {
    return {
      runId: null,
      sent: 0,
      failed: 0,
      alreadySentToday: alreadyLoggedToday,
      moneyQuoted: families.reduce((total, family) => total + family.totalAmount, 0),
      failures: [],
      messagesAttempted,
      heldOut: heldOut.length,
    };
  }

  // Opened BEFORE the first message. A crash halfway through then leaves a run
  // that says what was attempted, rather than no record at all — and `run_id` is
  // stamped on each send as it is claimed, so the rows are grouped even if this
  // never reaches its own end.
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
    source,
    scheduledFor,
    overriddenGuards,
    overrideReason,
  });

  // Recorded before the first message, so a crash halfway through still leaves
  // the record of who was deliberately not contacted. Best-effort: a failed
  // holdout write must not stop the run.
  if (heldOut.length > 0) {
    try {
      await supabase.from("whatsapp_run_holdouts").insert(
        heldOut.map((candidate) => ({ run_id: runId, student_id: candidate.studentId })),
      );
    } catch (caught) {
      console.warn("[whatsapp-reminders] holdout record failed", caught);
    }
  }

  let sent = 0;
  let failed = 0;
  let alreadySentToday = alreadyLoggedToday;
  let moneyQuoted = 0;
  const failures: ReminderRunOutcome["failures"] = [];
  const sentStudentIds: string[] = [];

  const byStudentId = new Map(toMessage.map((candidate) => [candidate.studentId, candidate]));

  for (let index = 0; index < families.length; index += SEND_CONCURRENCY) {
    const batch = families.slice(index, index + SEND_CONCURRENCY);
    const outcomes = await Promise.all(
      batch.map((family) =>
        sendFamily({
          supabase,
          family,
          byStudentId,
          filters,
          sessionLabel,
          today,
          staffId,
          runId,
        }),
      ),
    );
    for (const outcome of outcomes) {
      sent += outcome.sent;
      failed += outcome.failed;
      alreadySentToday += outcome.already;
      moneyQuoted += outcome.moneyQuoted;
      sentStudentIds.push(...outcome.sentStudentIds);
      failures.push(...outcome.failures);
    }
  }

  await closeRun(supabase, runId, { sent, failed, already: alreadySentToday, moneyQuoted });

  // The office's contact history, so a reminder shows on the student's profile.
  // Best-effort: the message has already gone, and a logging hiccup must not be
  // reported as a failed send. One round trip, not one per family.
  try {
    await logContacts?.(
      sentStudentIds.map((studentId) => ({
        studentId,
        sessionLabel,
        channel: "whatsapp" as const,
        outcome: "other" as const,
        // A broadcast, not a conversation. Without this every messaged family
        // reads as "contacted in the last six hours" and drops out of the
        // collectors' Now bucket — a 171-family run emptied the call list for
        // the rest of the day.
        bulk: true,
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
        source,
        count: sent,
        failed,
        sessionLabel,
      },
    });
  } catch (caught) {
    console.warn("[whatsapp-reminders] activity log failed", caught);
  }

  return {
    runId,
    sent,
    failed,
    alreadySentToday,
    moneyQuoted,
    failures,
    messagesAttempted,
    heldOut: heldOut.length,
  };
}

/**
 * A message ready to go: which campaign, the values in slot order, and the
 * figure it quotes. Built once per family by `sendFamily`, so a second handset
 * gets the same message and the send log records exactly what went.
 */
type PreparedMessage = {
  campaignName: string;
  templateParams: string[];
  dueAmount: number;
};

type SendOutcome =
  // The provider id travels back so the siblings' `covered_by_sibling` rows can
  // carry the id of the message that actually reached their family.
  | { kind: "sent"; providerMessageId: string | null }
  | { kind: "already" }
  | { kind: "failed"; error: string };

type FamilyOutcome = {
  sent: number;
  failed: number;
  already: number;
  moneyQuoted: number;
  sentStudentIds: string[];
  failures: ReminderRunOutcome["failures"];
};

const EMPTY_FAMILY_OUTCOME = (): FamilyOutcome => ({
  sent: 0,
  failed: 0,
  already: 0,
  moneyQuoted: 0,
  sentStudentIds: [],
  failures: [],
});

/**
 * One family, one message — and one send-log row per child regardless.
 *
 * The row per child is not bookkeeping for its own sake. The unique index is
 * keyed on `student_id`, the cadence gap is measured from it, and
 * `v_whatsapp_run_outcomes` joins payments to it. A family messaged once but
 * logged once would leave the siblings looking un-contacted tomorrow and get
 * them messaged again.
 *
 * So the siblings get `covered_by_sibling` rows carrying the SAME
 * `provider_message_id` as the message that actually went. No provider call is
 * made for them, they cost nothing, and the screen can say why they were not
 * messaged separately.
 *
 * Which message goes is decided by `chooseFamilyCampaign`: the family template
 * (`vpps_app_family_*`, Live since 2026-09-04) for a phone with two or more
 * children on a notice it can be filled for, otherwise the spokesperson's
 * ordinary per-child notice — the largest debt on the phone. Either way the
 * rows below carry the name of the message that actually went, so the bill can
 * be reconciled per campaign and "already messaged today" reads true.
 */
async function sendFamily(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  family: ReminderFamily;
  byStudentId: Map<string, ReminderCandidate>;
  filters: ReminderFilters;
  sessionLabel: string;
  today: string;
  staffId: string | null;
  runId: string | null;
}): Promise<FamilyOutcome> {
  const { supabase, family, byStudentId, filters, sessionLabel, today, staffId, runId } = args;
  const outcome = EMPTY_FAMILY_OUTCOME();

  const spokesperson = byStudentId.get(family.spokesperson.studentId);
  if (!spokesperson) return outcome;

  // Resolved per FAMILY, not per run: a family who reads English gets the
  // English campaign out of a Hindi run. The run's language is the default that
  // applies to everyone who has never said.
  let campaign: CampaignDescriptor;
  try {
    campaign = campaignFor(filters.situation, family.language);
  } catch (caught) {
    outcome.failed += 1;
    outcome.failures.push({
      admissionNo: spokesperson.admissionNo,
      studentName: spokesperson.studentName,
      error: caught instanceof Error ? caught.message : "No campaign for that notice.",
    });
    return outcome;
  }

  // The family's own language decides the phrase too, or an English family would
  // read a Hindi late-fee line inside an English message.
  const familyFilters: ReminderFilters = { ...filters, language: family.language };

  // Built ONCE per family, before any number is dialled: both handsets get the
  // same message, and the send log's `template_params` is what went, not what
  // would have gone had the amounts moved between the two.
  const familyCampaign = chooseFamilyCampaign(family, filters.situation);
  const message: PreparedMessage = familyCampaign
    ? {
        campaignName: familyCampaign.campaignName,
        templateParams: familyCampaign.buildParams(
          familyNoticeValuesFor(family, {
            lastDate: filters.lastDate,
            lateFeeAmount: filters.lateFeeAmount,
            lateFeeBasis: filters.lateFeeBasis,
          }),
        ),
        // The figure the message quotes: everyone on the phone, summed.
        dueAmount: family.totalAmount,
      }
    : {
        campaignName: campaign.campaignName,
        templateParams: campaign.buildParams(noticeValuesFor(spokesperson, familyFilters)),
        dueAmount: spokesperson.dueAmount,
      };

  for (const target of family.destinations) {
    const result = await sendOne({
      supabase,
      candidate: spokesperson,
      message,
      filters: familyFilters,
      sessionLabel,
      today,
      staffId,
      runId,
      destination: target.destination,
      destinationRole: target.role,
      language: family.language,
    });

    if (result.kind === "sent") {
      outcome.sent += 1;
      // Counted ONCE per family, on the primary. A second number reaching the
      // same family is a second message, not a second debt.
      if (target.role === "primary") {
        outcome.moneyQuoted += family.totalAmount;
        outcome.sentStudentIds.push(...family.members.map((member) => member.studentId));
      }
    } else if (result.kind === "already") {
      outcome.already += 1;
    } else {
      outcome.failed += 1;
      outcome.failures.push({
        admissionNo: spokesperson.admissionNo,
        studentName: spokesperson.studentName,
        error: result.error,
      });
    }

    // Siblings are recorded against the PRIMARY message only. The secondary is
    // the same message to another handset, not a second thing that happened.
    if (target.role === "primary" && result.kind === "sent") {
      await recordSiblingCoverage({
        supabase,
        family,
        byStudentId,
        campaignName: message.campaignName,
        providerMessageId: result.providerMessageId,
        sessionLabel,
        today,
        staffId,
        runId,
      });
    }
  }

  return outcome;
}

/**
 * The siblings who were reached without being messaged.
 *
 * Best-effort and deliberately after the send: the parent already has the
 * message, and a bookkeeping hiccup must not be reported as a failed send. A
 * unique violation here is the normal "already logged today" case, not an error.
 */
async function recordSiblingCoverage(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  family: ReminderFamily;
  byStudentId: Map<string, ReminderCandidate>;
  campaignName: string;
  providerMessageId: string | null;
  sessionLabel: string;
  today: string;
  staffId: string | null;
  runId: string | null;
}): Promise<void> {
  const rows = args.family.covered
    .map((member) => args.byStudentId.get(member.studentId))
    .filter((candidate): candidate is ReminderCandidate => Boolean(candidate))
    .map((candidate) => ({
      student_id: candidate.studentId,
      session_label: args.sessionLabel,
      sent_on: args.today,
      campaign_name: args.campaignName,
      destination: args.family.destination,
      due_amount: candidate.dueAmount,
      template_params: [],
      status: "covered_by_sibling",
      // The same id as the message that actually went, which is what ties the
      // family back together on the run page.
      provider_message_id: args.providerMessageId,
      language: args.family.language,
      destination_role: "primary",
      sent_by: args.staffId,
      run_id: args.runId,
    }));

  if (rows.length === 0) return;

  try {
    await args.supabase.from("whatsapp_reminder_sends").insert(rows);
  } catch (caught) {
    console.warn("[whatsapp-reminders] sibling coverage log failed", caught);
  }
}


async function sendOne(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  candidate: ReminderCandidate;
  /** Already built by `sendFamily`: the campaign that is going, and its params. */
  message: PreparedMessage;
  filters: ReminderFilters;
  sessionLabel: string;
  today: string;
  staffId: string | null;
  /** Null when the run record could not be opened; the send still happens. */
  runId: string | null;
  /**
   * The number this copy goes to. Defaults to the candidate's own, and differs
   * only when a family is being reached on the second parent's handset.
   */
  destination?: string;
  destinationRole?: "primary" | "secondary";
  /** The family's language, which the run's default only sometimes matches. */
  language?: string;
}): Promise<SendOutcome> {
  const { supabase, candidate, message, filters, sessionLabel, today, staffId, runId } = args;
  const destination = args.destination ?? candidate.destination;
  const destinationRole = args.destinationRole ?? "primary";
  // Seven slots on a per-child notice, five on a family one. A count that does
  // not match is refused by AiSensy with "Template params does not match the
  // campaign", which is why the registry owns both the count and the order and
  // `sendFamily` built these before this was called.
  const { campaignName, templateParams } = message;

  // The opaque code behind this message's pay link.
  //
  // 160 bits from the platform CSPRNG, per send. Never derived from the student
  // or the receipt: a code that could be computed from an admission number would
  // let anyone enumerate what every family owes. It expires with the notice,
  // because the amount it quotes is the amount that was owed when the message
  // went out.
  const payCode = randomBytes(20).toString("base64url");

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
      destination,
      // What the MESSAGE quotes: one child's figure, or the family's total.
      due_amount: message.dueAmount,
      template_params: templateParams,
      status: "pending",
      // What actually went out, not the run default. Answering "which language
      // did this parent get" from the run record would be a guess.
      language: args.language ?? filters.language,
      destination_role: destinationRole,
      pay_code: payCode,
      pay_code_expires_on: lastDateIsoFor(filters),
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
    destination,
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

  return result.ok
    ? { kind: "sent", providerMessageId: result.messageId ?? null }
    : { kind: "failed", error: result.error };
}


/**
 * The date a pay link stops resolving: the notice's own date.
 *
 * Null on a notice that prints no date — `late_fee_applied` — where there is
 * nothing to expire against, and the link simply stays live until the family
 * pays and the next run stops including them.
 */
function lastDateIsoFor(filters: ReminderFilters): string | null {
  return isoFromDdMmYyyy(filters.lastDate);
}
