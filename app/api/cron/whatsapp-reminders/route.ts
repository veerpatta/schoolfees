import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getOptionalEnvVar } from "@/lib/env";
import { isAisensyConfigured, sendAisensyCampaignMessage } from "@/lib/whatsapp/aisensy";
import {
  buildReminderParams,
  loadReminderAudience,
  resolveCurrentSessionLabel,
  FEE_REMINDER_TEMPLATE_DEADLINE,
  type ReminderRecipient,
} from "@/lib/whatsapp/fee-reminders";

// Daily WhatsApp fee reminder.
//
// Scheduled in vercel.json at 03:30 UTC (09:00 IST). This project is on
// Vercel Hobby, where cron has a one-hour flexible window — the run lands
// somewhere between 09:00 and 09:59 IST, not on the hour. Sends the approved
// AiSensy template to every family that has paid ₹1,100 or less and still owes
// installments 1 and 2. The audience is recomputed from the ledger on every
// run, so a parent who paid yesterday is simply not in today's list.
//
// Idempotent on (student, session, IST day) via whatsapp_reminder_sends: the
// row is claimed BEFORE the provider call, so a double-fire skips rather than
// re-messages.
//
// Manual use:
//   GET /api/cron/whatsapp-reminders?secret=…&dryRun=1        preview only
//   GET /api/cron/whatsapp-reminders?secret=…&limit=5         send to 5
//   GET /api/cron/whatsapp-reminders?secret=…&force=1         past the deadline

export const runtime = "nodejs";
// Hobby caps a function at 60s. Other routes here declare 300 and are silently
// clamped; declaring the real ceiling is what lets DEADLINE_MS below be honest.
export const maxDuration = 60;

/** Concurrent provider calls. Enough to clear ~165 well inside the cap, gentle
 *  enough not to look like a burst to AiSensy or Meta. */
const SEND_CONCURRENCY = 10;

/**
 * Stop starting new sends this far into the run.
 *
 * Being killed at the 60s wall mid-send leaves rows stuck at status pending:
 * the day is claimed, so the parent is never retried, and nobody can tell
 * whether the message went. Stopping early instead leaves those families
 * simply unclaimed — and because a claimed student is skipped, hitting the
 * endpoint again finishes the remainder rather than starting over.
 */
const DEADLINE_MS = 50_000;

function authorize(request: Request): { ok: boolean; reason?: string } {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    return { ok: false, reason: "CRON_SECRET env var not configured." };
  }
  const url = new URL(request.url);
  const provided =
    url.searchParams.get("secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (provided !== expectedSecret) {
    return { ok: false, reason: "Invalid or missing secret." };
  }
  return { ok: true };
}

/** Today in Asia/Kolkata. The school's day, not UTC's. */
function istToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

type SendOutcome = "sent" | "failed" | "already-sent-today";

export async function GET(request: Request) {
  const auth = authorize(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const force = url.searchParams.get("force") === "1";
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : null;

  const campaignName = getOptionalEnvVar("AISENSY_CAMPAIGN")?.trim();
  if (!campaignName) {
    return NextResponse.json(
      { ok: false, error: "AISENSY_CAMPAIGN env var not configured." },
      { status: 500 },
    );
  }
  if (!dryRun && !isAisensyConfigured()) {
    return NextResponse.json(
      { ok: false, error: "AISENSY_API_KEY env var not configured." },
      { status: 500 },
    );
  }

  const today = istToday();

  // The template body hardcodes its own deadline. Past it, every word of the
  // message is wrong, so this refuses rather than mailing 200 families a
  // deadline that has already gone.
  if (today > FEE_REMINDER_TEMPLATE_DEADLINE && !force && !dryRun) {
    return NextResponse.json(
      {
        ok: false,
        today,
        templateDeadline: FEE_REMINDER_TEMPLATE_DEADLINE,
        error:
          "The approved template hardcodes its deadline and that date has passed. " +
          "Approve a replacement template, then update FEE_REMINDER_TEMPLATE_DEADLINE. " +
          "Use ?force=1 only if the template body itself has been changed.",
      },
      { status: 409 },
    );
  }

  const supabase = createAdminClient();

  let sessionLabel: string;
  let audience: Awaited<ReturnType<typeof loadReminderAudience>>;
  try {
    sessionLabel = await resolveCurrentSessionLabel(supabase);
    audience = await loadReminderAudience(supabase, { sessionLabel });
  } catch (caught) {
    return NextResponse.json(
      { ok: false, error: caught instanceof Error ? caught.message : "Failed to build audience." },
      { status: 500 },
    );
  }

  const queue = limit ? audience.recipients.slice(0, limit) : audience.recipients;

  const summary = {
    today,
    sessionLabel,
    campaignName,
    audienceSize: audience.recipients.length,
    queued: queue.length,
    usingMotherPhone: queue.filter((recipient) => recipient.usedMotherPhone).length,
    rupeesBehindQueue: queue.reduce((total, recipient) => total + recipient.dueAmount, 0),
    skipped: audience.skipped,
    unreachable: audience.unreachable,
  };

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      ...summary,
      sample: queue.slice(0, 5).map((recipient) => ({
        admissionNo: recipient.admissionNo,
        destination: recipient.destination,
        templateParams: buildReminderParams(recipient),
      })),
    });
  }

  const counts: Record<SendOutcome, number> = {
    sent: 0,
    failed: 0,
    "already-sent-today": 0,
  };
  const failures: Array<{ admissionNo: string; destination: string; error: string }> = [];

  const startedAt = Date.now();
  let ranOutOfTime = 0;

  for (let index = 0; index < queue.length; index += SEND_CONCURRENCY) {
    if (Date.now() - startedAt > DEADLINE_MS) {
      ranOutOfTime = queue.length - index;
      break;
    }
    const batch = queue.slice(index, index + SEND_CONCURRENCY);
    const outcomes = await Promise.all(
      batch.map((recipient) =>
        sendOne({ supabase, recipient, campaignName, sessionLabel, today, failures }),
      ),
    );
    for (const outcome of outcomes) counts[outcome] += 1;
  }

  return NextResponse.json({
    ok: true,
    ...summary,
    sent: counts.sent,
    failed: counts.failed,
    alreadySentToday: counts["already-sent-today"],
    // Non-zero means the function stopped short of its time limit. Call the
    // endpoint again to finish these — everyone already sent is skipped.
    notAttemptedRanOutOfTime: ranOutOfTime,
    elapsedMs: Date.now() - startedAt,
    failures: failures.slice(0, 25),
  });
}

async function sendOne(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  recipient: ReminderRecipient;
  campaignName: string;
  sessionLabel: string;
  today: string;
  failures: Array<{ admissionNo: string; destination: string; error: string }>;
}): Promise<SendOutcome> {
  const { supabase, recipient, campaignName, sessionLabel, today, failures } = args;
  const templateParams = buildReminderParams(recipient);

  // Claim the day BEFORE calling the provider. If two crons race, one of them
  // loses here on the unique index and never reaches AiSensy at all.
  const { data: claim, error: claimError } = await supabase
    .from("whatsapp_reminder_sends")
    .insert({
      student_id: recipient.studentId,
      session_label: sessionLabel,
      sent_on: today,
      campaign_name: campaignName,
      destination: recipient.destination,
      due_amount: recipient.dueAmount,
      template_params: templateParams,
      status: "pending",
    })
    .select("id")
    .single();

  if (claimError) {
    // 23505 = unique violation = this student already has today's row.
    if (claimError.code === "23505") return "already-sent-today";
    failures.push({
      admissionNo: recipient.admissionNo,
      destination: recipient.destination,
      error: `Could not claim send slot: ${claimError.message}`,
    });
    return "failed";
  }

  const result = await sendAisensyCampaignMessage({
    campaignName,
    destination: recipient.destination,
    userName: recipient.parentName,
    templateParams,
    source: "veerpatta-fees-app/daily-reminder",
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

  if (!result.ok) {
    failures.push({
      admissionNo: recipient.admissionNo,
      destination: recipient.destination,
      error: result.error,
    });
    return "failed";
  }
  return "sent";
}
