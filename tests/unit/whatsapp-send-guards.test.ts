import { describe, expect, it } from "vitest";

import {
  evaluateSendGuards,
  firstBlockingMessage,
  isSendAllowed,
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
