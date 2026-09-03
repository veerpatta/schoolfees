import { describe, expect, it } from "vitest";

import {
  evaluateSendGuards,
  firstBlockingMessage,
  isSendAllowed,
  resolveGuards,
  type SendGuardContext,
} from "@/modules/whatsapp/domain/send-guards";

/**
 * The one list of reasons a run may not send.
 *
 * There are two ways to start a run — an admin pressing Send, and the scheduled
 * cron — and the cron is required to apply every guard the manual path applies.
 * That is only true by construction if there is ONE list and both read it, which
 * is what this file exists to hold in place.
 */

function context(overrides: Partial<SendGuardContext> = {}): SendGuardContext {
  return {
    providerReady: true,
    campaignApproved: true,
    situation: "fee_due",
    lastDateIso: "2026-10-20",
    lastDateLabel: "20-10-2026",
    today: "2026-10-10",
    recipientCount: 42,
    ...overrides,
  };
}

describe("evaluateSendGuards", () => {
  it("lets a well-formed run through", () => {
    const result = evaluateSendGuards(context());
    expect(result.blocking).toEqual([]);
    expect(isSendAllowed(result)).toBe(true);
    expect(firstBlockingMessage(result)).toBeNull();
  });

  it("blocks when the provider is not configured", () => {
    const result = evaluateSendGuards(context({ providerReady: false }));
    expect(result.blocking.map((f) => f.code)).toContain("provider_unconfigured");
  });

  it("blocks a notice Meta has not approved", () => {
    // The picker already disables the chip; this is what stops a hand-edited
    // URL or a saved campaign reaching AiSensy as `400 Campaign does not exist.`
    const result = evaluateSendGuards(
      context({ situation: "upcoming", campaignApproved: false }),
    );
    expect(result.blocking.map((f) => f.code)).toContain("campaign_unapproved");
  });

  it("blocks a date that has already passed", () => {
    const result = evaluateSendGuards(
      context({ lastDateIso: "2026-09-01", lastDateLabel: "01-09-2026" }),
    );
    expect(result.blocking.map((f) => f.code)).toContain("date_passed");
    expect(firstBlockingMessage(result)).toContain("01-09-2026");
  });

  it("blocks a missing date on a notice that prints one", () => {
    const result = evaluateSendGuards(context({ lastDateIso: null, lastDateLabel: "" }));
    expect(result.blocking.map((f) => f.code)).toContain("date_passed");
  });

  it("does NOT require a date for late_fee_applied", () => {
    // Its whole subject is that a date has gone, and it prints no date slot at
    // all. Requiring a future one would block the only notice that fits.
    const result = evaluateSendGuards(
      context({ situation: "late_fee_applied", lastDateIso: null, lastDateLabel: "" }),
    );
    expect(result.blocking.map((f) => f.code)).not.toContain("date_passed");
    expect(isSendAllowed(result)).toBe(true);
  });

  it("blocks a run with nobody left in it", () => {
    // Families who paid between page load and Send drop out server-side, which
    // can empty a selection entirely.
    const result = evaluateSendGuards(context({ recipientCount: 0 }));
    expect(result.blocking.map((f) => f.code)).toContain("no_recipients");
  });

  it("reports every problem, not just the first", () => {
    // The office should be able to fix them in one pass rather than discovering
    // them one press at a time.
    const result = evaluateSendGuards(
      context({
        providerReady: false,
        campaignApproved: false,
        lastDateIso: null,
        lastDateLabel: "",
        recipientCount: 0,
      }),
    );
    expect(result.blocking.map((f) => f.code).sort()).toEqual([
      "campaign_unapproved",
      "date_passed",
      "no_recipients",
      "provider_unconfigured",
    ]);
  });

  it("orders the impossible before the merely unwise", () => {
    // The office fixes them top-down, so a missing API key must not sit below a
    // judgement call.
    const result = evaluateSendGuards(context({ providerReady: false }));
    expect(result.blocking[0]!.code).toBe("provider_unconfigured");
  });

  it("carries a stable code on every finding", () => {
    // The screen and the run record must name the same thing, so the message can
    // be reworded without breaking either.
    const result = evaluateSendGuards(
      context({ providerReady: false, campaignApproved: false, recipientCount: 0 }),
    );
    for (const finding of [...result.blocking, ...result.overridable]) {
      expect(finding.code).toMatch(/^[a-z_]+$/);
      expect(finding.message.length).toBeGreaterThan(10);
    }
  });
});

describe("the overridable guards", () => {
  /**
   * All four WOULD send fine. The question is whether they should — which is why
   * each is overridable by an admin who gives a reason that lands on the run.
   * A guard that cannot be overridden gets worked around.
   */

  it("warns outside quiet hours, and does not block", () => {
    // A fee reminder at eleven at night is the school waking a family up to ask
    // for money.
    const late = evaluateSendGuards(context({ hourIst: 23 }));
    expect(late.blocking).toEqual([]);
    expect(late.overridable.map((f) => f.code)).toContain("quiet_hours");

    const early = evaluateSendGuards(context({ hourIst: 6 }));
    expect(early.overridable.map((f) => f.code)).toContain("quiet_hours");
  });

  it("is quiet at the edges in the right direction", () => {
    // 08:00 is inside, 20:00 is outside — the window is [start, end).
    expect(evaluateSendGuards(context({ hourIst: 8 })).overridable).toEqual([]);
    expect(
      evaluateSendGuards(context({ hourIst: 20 })).overridable.map((f) => f.code),
    ).toContain("quiet_hours");
  });

  it("honours a quiet-hours window the office has changed", () => {
    expect(
      evaluateSendGuards(context({ hourIst: 7, quietHours: { start: 6, end: 21 } })).overridable,
    ).toEqual([]);
  });

  it("warns when the fee counter is closed", () => {
    const closed = evaluateSendGuards(
      context({ counterOpenOnLastDate: false, closedReason: "Diwali" }),
    );
    expect(closed.overridable.map((f) => f.code)).toContain("counter_closed");
    expect(closed.overridable.find((f) => f.code === "counter_closed")!.message).toContain("Diwali");
  });

  it("treats an unknown holiday list as open, rather than blocking everything", () => {
    // A missing holiday list must not stop the office sending.
    expect(
      evaluateSendGuards(context({ counterOpenOnLastDate: null })).overridable,
    ).toEqual([]);
  });

  it("warns on a Sunday unless the counter is explicitly open", () => {
    expect(
      evaluateSendGuards(context({ weekdayIst: 0 })).overridable.map((f) => f.code),
    ).toContain("counter_closed");
    expect(
      evaluateSendGuards(context({ weekdayIst: 0, counterOpenOnLastDate: true })).overridable,
    ).toEqual([]);
  });

  it("names an over-budget run rather than refusing it", () => {
    const big = evaluateSendGuards(
      context({ recipientCount: 400, messageCount: 400, runMessageCap: 250 }),
    );
    expect(big.blocking).toEqual([]);
    expect(big.overridable.map((f) => f.code)).toContain("budget_exceeded");
    expect(big.overridable.find((f) => f.code === "budget_exceeded")!.message).toContain("400");
  });

  it("counts MESSAGES against the cap, not families", () => {
    // A family reached on a second number is a second charge.
    const guarded = evaluateSendGuards(
      context({ recipientCount: 200, messageCount: 260, runMessageCap: 250 }),
    );
    expect(guarded.overridable.map((f) => f.code)).toContain("budget_exceeded");
  });

  it("warns when the month's cap would be crossed", () => {
    const guarded = evaluateSendGuards(
      context({
        recipientCount: 100,
        messageCount: 100,
        runMessageCap: 250,
        monthMessageCap: 4000,
        messagesSentThisMonth: 3950,
      }),
    );
    expect(guarded.overridable.map((f) => f.code)).toContain("budget_exceeded");
  });

  it("warns about a campaign nobody has tested today", () => {
    // A wrong slot order sends cleanly and a parent reads their child's class
    // where the amount should be — the one failure that costs money and is
    // invisible.
    expect(
      evaluateSendGuards(context({ testedRecently: false })).overridable.map((f) => f.code),
    ).toContain("untested_campaign");
  });

  it("does not ask an established campaign to be re-tested every day", () => {
    expect(evaluateSendGuards(context({ testedRecently: null })).overridable).toEqual([]);
  });
});

describe("resolveGuards", () => {
  const quiet = () => evaluateSendGuards(context({ hourIst: 23 }));

  it("lets a clean run through with nothing overridden", () => {
    const resolved = resolveGuards(evaluateSendGuards(context()), null);
    expect(resolved).toEqual({ allowed: true, message: null, overridden: [] });
  });

  it("refuses a judgement the admin has not agreed to", () => {
    const resolved = resolveGuards(quiet(), null);
    expect(resolved.allowed).toBe(false);
    expect(resolved.message).toContain("23:00");
  });

  it("refuses an override with no reason", () => {
    // The point of an overridable guard is that the override is on the record,
    // not that it is easy.
    const resolved = resolveGuards(quiet(), { codes: ["quiet_hours"], reason: "" });
    expect(resolved.allowed).toBe(false);
    expect(resolved.message).toContain("Say why");
  });

  it("allows an override that names the guard and gives a reason", () => {
    const resolved = resolveGuards(quiet(), {
      codes: ["quiet_hours"],
      reason: "Owner asked for the last-day push tonight.",
    });
    expect(resolved.allowed).toBe(true);
    expect(resolved.overridden).toEqual(["quiet_hours"]);
  });

  it("refuses when only SOME of the guards were agreed to", () => {
    // Ticking one box must not wave the others through.
    const both = evaluateSendGuards(
      context({ hourIst: 23, recipientCount: 400, messageCount: 400, runMessageCap: 250 }),
    );
    const resolved = resolveGuards(both, { codes: ["quiet_hours"], reason: "Because." });
    expect(resolved.allowed).toBe(false);
  });

  it("never lets a BLOCKING finding be overridden", () => {
    // No key means no message, whatever anybody types into a reason box.
    const blocked = evaluateSendGuards(context({ providerReady: false, hourIst: 23 }));
    const resolved = resolveGuards(blocked, {
      codes: ["provider_unconfigured", "quiet_hours"],
      reason: "I really mean it.",
    });
    expect(resolved.allowed).toBe(false);
    expect(resolved.overridden).toEqual([]);
  });
});
