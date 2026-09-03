import { NextResponse } from "next/server";

import { getFeePolicySummary } from "@/modules/fees/data/policy";
import { logError, logInfo, logWarn } from "@/platform/observability/log";
import { insertDefaulterContacts } from "@/modules/defaulters/data/contacts";
import { createAdminClient } from "@/platform/supabase/admin";
import { isAisensyConfigured } from "@/modules/whatsapp/data/aisensy";
import {
  getCampaign,
  listCampaigns,
  loadRanScheduleSlots,
} from "@/modules/whatsapp/data/campaign-store";
import { executeReminderRun } from "@/modules/whatsapp/data/run-sender";
import { campaignsDueOn } from "@/modules/whatsapp/domain/campaign-schedule";
import {
  campaignFor,
  isCampaignApproved,
  type NoticeLanguage,
  type NoticeSituation,
} from "@/modules/whatsapp/domain/campaigns";
import {
  drainPendingFinancialRefresh,
  istToday,
  loadReminderAudience,
  parseReminderFilters,
  resolveCurrentSessionLabel,
} from "@/modules/whatsapp/domain/fee-reminders";
import { buildInstallmentCalendar } from "@/modules/whatsapp/domain/installment-calendar";
import { evaluateSendGuards, firstBlockingMessage } from "@/modules/whatsapp/domain/send-guards";
import { formatDdMmYyyy, isoFromDdMmYyyy } from "@/platform/helpers/date";

/**
 * The scheduled reminder runner.
 *
 * Sends saved campaigns whose slot has arrived AND whose owner has explicitly
 * turned `auto` on. Everything else it finds due is left for a human to press —
 * a campaign with a schedule but no `auto` is a row on a card, not an instruction.
 *
 * **This is the only thing in the app that sends a message nobody pressed.** The
 * screen says so out loud on any campaign carrying `auto`, and the default is
 * off, because "every send is a press" was a deliberate decision and this is a
 * deliberate, per-campaign exception to it rather than a quiet reversal.
 *
 * It applies the SAME guards the manual path applies, and that is true by
 * construction rather than by remembering: `evaluateSendGuards` is one pure
 * list, and `executeReminderRun` is one executor, both shared with
 * `sendRemindersAction`.
 *
 * `?dryRun=1` reports exactly what would be sent, opens no run, claims no row
 * and calls no provider. It exists so this can be pointed at production and read
 * before it is trusted with it.
 *
 * NOT wired into `vercel.json` — see the note at the bottom of
 * `docs/modules/whatsapp-reminders.md`. The Hobby plan's cron allowance is
 * already spent on the nightly backup and the automatic day close, and a third
 * entry fails the whole deployment rather than just the cron. The route works
 * from any external scheduler in the meantime, and the JSON to paste is in the
 * doc for the day the plan changes.
 */

function authorize(
  request: Request,
): { ok: true } | { ok: false; reason: string; misconfigured: boolean } {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    return { ok: false, reason: "CRON_SECRET is not set on this deployment.", misconfigured: true };
  }
  const url = new URL(request.url);
  const provided =
    url.searchParams.get("secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  // One word back to the caller. The reason is for the log: handing an
  // unauthenticated prober the name of a server-only env var is how the
  // day-close route used to answer.
  if (provided !== expectedSecret) {
    return { ok: false, reason: "Secret missing or does not match.", misconfigured: false };
  }
  return { ok: true };
}

type RunReport = {
  campaignId: string;
  campaignName: string;
  scheduledFor: string;
  status: "sent" | "skipped" | "failed" | "would_send";
  reason?: string;
  sent?: number;
  failed?: number;
  recipients?: number;
};

export async function GET(request: Request) {
  const auth = authorize(request);
  if (!auth.ok) {
    if (auth.misconfigured) {
      logError("cron.whatsapp-scheduled-runs.unauthorized", { reason: auth.reason });
    } else {
      logWarn("cron.whatsapp-scheduled-runs.unauthorized", { reason: auth.reason });
    }
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const today = istToday();
  const supabase = createAdminClient();
  const reports: RunReport[] = [];

  try {
    const sessionLabel = await resolveCurrentSessionLabel(supabase);
    // Before any figure is quoted, exactly as the screen and the action do.
    // Free when nothing is queued.
    await drainPendingFinancialRefresh(supabase);

    const policy = await getFeePolicySummary({ useAdmin: true }).catch(() => null);
    const [campaigns, ranSlots] = await Promise.all([
      listCampaigns(supabase, sessionLabel),
      loadRanScheduleSlots(supabase, sessionLabel),
    ]);

    const calendar = buildInstallmentCalendar({
      schedule: policy?.installmentSchedule ?? [],
      today,
    });

    const due = campaignsDueOn(
      campaigns.map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        situation: campaign.situation,
        language: campaign.language,
        schedule: campaign.schedule,
        ranForSlots: ranSlots.get(campaign.id) ?? [],
      })),
      calendar,
      today,
    );

    // Only what the owner turned on. A due campaign without `auto` is somebody
    // else's decision and stays on the card.
    const automatic = due.filter((campaign) => campaign.auto);

    for (const entry of automatic) {
      const saved = await getCampaign(supabase, entry.id);
      if (!saved) {
        reports.push({
          campaignId: entry.id,
          campaignName: entry.name,
          scheduledFor: entry.scheduledFor,
          status: "skipped",
          reason: "The campaign was deleted between listing and running.",
        });
        continue;
      }

      // Rebuild the audience from the saved RULE against today's ledger, exactly
      // as loading the campaign on the screen would. The audience is never
      // stored, so a family who paid this morning is simply absent.
      const search = new URLSearchParams({
        situation: saved.situation,
        language: saved.language,
        maxTotalPaid: String(saved.filters.maxTotalPaid),
        minDueAmount: String(saved.filters.minDueAmount),
        installments: saved.filters.installments.join(","),
        lastDate: saved.lastDate ? formatDdMmYyyy(saved.lastDate) : "",
        lateFeeAmount: String(saved.lateFeeAmount),
        lateFeeBasis: saved.lateFeeBasis,
      });
      if (saved.filters.classId) search.set("classId", saved.filters.classId);
      if (saved.filters.includeRte) search.set("includeRte", "on");

      const filters = parseReminderFilters(
        (key) => search.get(key),
        sessionLabel,
        formatDdMmYyyy(
          calendar.next?.dueDate ?? calendar.timings[calendar.timings.length - 1]?.dueDate ?? null,
        ),
        Number(policy?.lateFeeFlatAmount ?? 0),
        calendar.active,
      );

      const audience = await loadReminderAudience(supabase, filters, calendar);
      const lastDateIso = isoFromDdMmYyyy(filters.lastDate);

      // The same list the office is held to.
      const guards = evaluateSendGuards({
        providerReady: isAisensyConfigured(),
        campaignApproved: isCampaignApproved(
          filters.situation as NoticeSituation,
          filters.language as NoticeLanguage,
        ),
        situation: filters.situation,
        lastDateIso,
        lastDateLabel: filters.lastDate,
        today,
        recipientCount: audience.candidates.length,
      });
      const blocked = firstBlockingMessage(guards);
      if (blocked) {
        reports.push({
          campaignId: saved.id,
          campaignName: saved.name,
          scheduledFor: entry.scheduledFor,
          status: "skipped",
          reason: blocked,
          recipients: audience.candidates.length,
        });
        continue;
      }

      if (dryRun) {
        reports.push({
          campaignId: saved.id,
          campaignName: saved.name,
          scheduledFor: entry.scheduledFor,
          status: "would_send",
          recipients: audience.candidates.length,
        });
        continue;
      }

      const outcome = await executeReminderRun({
        supabase,
        candidates: audience.candidates,
        filters,
        sessionLabel,
        today,
        lastDateIso,
        campaignName: campaignFor(
          filters.situation as NoticeSituation,
          filters.language as NoticeLanguage,
        ).campaignName,
        campaignId: saved.id,
        // Null, not the campaign's author. Attributing an automatic send to
        // whoever last edited the campaign would be a lie in the record.
        staffId: null,
        source: "cron",
        logContacts: insertDefaulterContacts,
        scheduledFor: entry.scheduledFor,
      });

      reports.push({
        campaignId: saved.id,
        campaignName: saved.name,
        scheduledFor: entry.scheduledFor,
        status: outcome.failed > 0 && outcome.sent === 0 ? "failed" : "sent",
        sent: outcome.sent,
        failed: outcome.failed,
        recipients: audience.candidates.length,
      });
    }

    logInfo("cron.whatsapp-scheduled-runs.finished", {
      today,
      dryRun,
      due: due.length,
      automatic: automatic.length,
      sent: reports.reduce((total, report) => total + (report.sent ?? 0), 0),
    });

    return NextResponse.json({
      ok: true,
      today,
      dryRun,
      // Everything due, so a reading of this endpoint also answers "what is
      // waiting for somebody to press Send".
      due: due.map((entry) => ({
        campaignId: entry.id,
        name: entry.name,
        scheduledFor: entry.scheduledFor,
        daysOverdue: entry.daysOverdue,
        auto: entry.auto,
      })),
      runs: reports,
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Scheduled run failed.";
    logError("cron.whatsapp-scheduled-runs.failed", { error: message });
    return NextResponse.json({ ok: false, error: message, runs: reports }, { status: 500 });
  }
}
