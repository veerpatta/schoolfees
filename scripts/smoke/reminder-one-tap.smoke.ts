import { describe, expect, it } from "vitest";

/**
 * The one-tap fee reminder, against the real database, on today's real clock.
 *
 * It sends nothing. It runs the exact chain a press of "Remind" on a student's
 * page runs — resolve the session, read that session's fee policy, build the
 * calendar, derive the date, load the guard facts, evaluate, resolve — and
 * asserts that it comes out ALLOWED with nothing to tick and nothing to type.
 *
 * Written because the unit tests could not have caught what went wrong. Every
 * guard was individually correct and individually tested; the failure was in
 * the composition — a sheet that posted no date, a blocking finding no override
 * could clear, and a Sunday rule that read the wrong clock. The only thing that
 * demonstrates the repair is running the whole chain on the day it failed.
 *
 *   SMOKE_SESSION=TEST-2026-27 npx vitest run \
 *     --config scripts/smoke/vitest.smoke.config.ts \
 *     scripts/smoke/reminder-one-tap.smoke.ts
 */

const SESSION = process.env.SMOKE_SESSION ?? "TEST-2026-27";

describe("a one-tap reminder clears every guard by itself", () => {
  it("derives its own date and needs no override", async () => {
    const { createAdminClient } = await import("@/platform/supabase/admin");
    const { getFeePolicyForSession } = await import("@/modules/fees/data/policy");
    const { istToday } = await import("@/modules/whatsapp/domain/fee-reminders");
    const { buildInstallmentCalendar, derivedLastDateIso } = await import(
      "@/modules/whatsapp/domain/installment-calendar"
    );
    const { loadGuardFacts } = await import("@/modules/whatsapp/data/guard-context");
    const { evaluateSendGuards, resolveGuards } = await import(
      "@/modules/whatsapp/domain/send-guards"
    );
    const { campaignNameFor, isCampaignApproved } = await import(
      "@/modules/whatsapp/domain/campaigns"
    );
    const { formatDdMmYyyy } = await import("@/platform/helpers/date");

    const supabase = createAdminClient();
    const today = istToday();

    const policy = await getFeePolicyForSession(SESSION, { useAdmin: true });
    const calendar = buildInstallmentCalendar({
      schedule: policy?.installmentSchedule ?? [],
      today,
    });

    const lastDateIso = derivedLastDateIso(calendar, today);
    expect(lastDateIso, "no date could be derived for a notice that prints one").toBeTruthy();
    const lastDateLabel = formatDdMmYyyy(lastDateIso);
    console.log(`session ${SESSION} · today ${today} · notice would say "pay by ${lastDateLabel}"`);

    const situation = "fee_due";
    const language = "hi";
    const facts = await loadGuardFacts({
      supabase,
      lastDateIso,
      campaignName: campaignNameFor(situation, language) ?? "",
      requireProvenCampaign: true,
    });

    const guards = evaluateSendGuards({
      providerReady: true,
      campaignApproved: isCampaignApproved(situation, language),
      situation,
      lastDateIso,
      lastDateLabel,
      today,
      // One family, which is what the button on a student's page sends to.
      recipientCount: 1,
      messageCount: 1,
      ...facts,
    });

    console.log("blocking   ", guards.blocking.map((f) => f.code));
    console.log("overridable", guards.overridable.map((f) => f.code));

    // Nothing to argue with, and nothing to type. Before this change today —
    // a Sunday — produced `date_passed` (blocking, from the missing date) plus
    // `counter_closed` (from the wrong clock), and the screen offered an
    // override that could not clear the first of them.
    const resolved = resolveGuards(guards, null);
    expect(guards.blocking.map((f) => f.code)).toEqual([]);
    expect(guards.overridable.map((f) => f.code)).toEqual([]);
    expect(resolved.allowed, resolved.message ?? "").toBe(true);
  });

  it("shows the session's OWN families, never the live year's", async () => {
    /**
     * The reminders screen read `academic_sessions.is_current` — the live year,
     * globally — so an office in TEST-2026-27 was shown real families under a
     * badge reading "not live data". This asserts on the audience the screen
     * builds for a session label: every student on it belongs to that session.
     */
    const { createAdminClient } = await import("@/platform/supabase/admin");
    const { resolveReminderContext, readerFor } = await import(
      "@/modules/whatsapp/data/reminder-context"
    );

    const supabase = createAdminClient();
    const context = await resolveReminderContext(supabase, SESSION, readerFor({}));

    console.log(`audience for ${SESSION}: ${context.audience.candidates.length} families`);
    for (const candidate of context.audience.candidates.slice(0, 5)) {
      console.log(`  ${candidate.admissionNo} ${candidate.studentName}`);
    }

    const strays = context.audience.candidates.filter(
      (candidate) => !candidate.admissionNo.startsWith("TEST-"),
    );
    // Only meaningful on a TEST session, where every admission number carries
    // the prefix by rule. On the live session there is nothing to distinguish.
    if (SESSION.startsWith("TEST-")) {
      expect(
        strays.map((candidate) => candidate.admissionNo),
        "live students on a TEST-session reminder list",
      ).toEqual([]);
      expect(context.filters.sessionLabel).toBe(SESSION);
    }
  });
});
