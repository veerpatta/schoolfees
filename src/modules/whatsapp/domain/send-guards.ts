import { describeDateGuard } from "@/modules/whatsapp/domain/installment-calendar";

/**
 * Everything that must be true before a reminder run may send.
 *
 * ONE place, deliberately, because there are now two ways to start a run: an
 * admin pressing Send, and the scheduled cron. The prompt for the cron says it
 * "applies every guard the manual path applies" — the only way that stays true
 * is if there is one list and both paths read it. Two copies of this would drift
 * exactly the way the filter parser and the notice-values mapping drifted
 * before, and the failure mode here is a message reaching a real parent at
 * eleven at night.
 *
 * Pure: it is handed a context and returns findings. No clock, no Supabase
 * client, no environment — the caller resolves all of that, so
 * `tests/unit/whatsapp-send-guards.test.ts` can pin every branch.
 *
 * Two kinds of finding:
 *
 * - **blocking** — the run cannot proceed. No admin override, because these are
 *   "this would not work" rather than "this is unwise": no API key, no date on a
 *   notice that prints one, a template Meta has not approved.
 * - **overridable** — the run may proceed if an admin says so and gives a
 *   reason, which is written to the run. Quiet hours, holidays and the budget
 *   cap are judgements about whether to send, not about whether it would work.
 */

export type SendGuardFinding = {
  /** Stable key, so the screen and the run record name the same thing. */
  code: string;
  message: string;
};

export type SendGuardResult = {
  blocking: SendGuardFinding[];
  overridable: SendGuardFinding[];
};

export type SendGuardContext = {
  /** Is `AISENSY_API_KEY` set on this deployment? */
  providerReady: boolean;
  /** Has Meta approved the campaign this notice would send? */
  campaignApproved: boolean;
  situation: string;
  /** ISO, or null when the field was empty or unparseable. */
  lastDateIso: string | null;
  /** What the office typed, for the message. */
  lastDateLabel: string;
  /** IST `YYYY-MM-DD`. */
  today: string;
  /** How many families the run would message. */
  recipientCount: number;
};

/**
 * Evaluate every pre-send guard.
 *
 * Order is the order the office should fix them in: the things that make a send
 * impossible first, then the judgements.
 */
export function evaluateSendGuards(context: SendGuardContext): SendGuardResult {
  const blocking: SendGuardFinding[] = [];
  const overridable: SendGuardFinding[] = [];

  if (!context.providerReady) {
    blocking.push({
      code: "provider_unconfigured",
      message: "AISENSY_API_KEY is not configured on the server.",
    });
  }

  if (!context.campaignApproved) {
    blocking.push({
      code: "campaign_unapproved",
      message:
        "This notice is awaiting Meta approval. Approve its campaign in Admin Tools once it is Live in AiSensy.",
    });
  }

  // Per notice: every forward-looking one needs a date a parent can still meet,
  // and `late_fee_applied` prints no date at all.
  const dateProblem = describeDateGuard({
    situation: context.situation,
    lastDateIso: context.lastDateIso,
    lastDateLabel: context.lastDateLabel,
    today: context.today,
  });
  if (dateProblem) {
    blocking.push({ code: "date_passed", message: dateProblem });
  }

  if (context.recipientCount <= 0) {
    blocking.push({
      code: "no_recipients",
      message:
        "None of the selected students are still eligible — they may have paid, or been flagged no-call, since this page loaded. Reload and try again.",
    });
  }

  return { blocking, overridable };
}

/** Convenience: may this run go ahead without an admin override? */
export function isSendAllowed(result: SendGuardResult): boolean {
  return result.blocking.length === 0 && result.overridable.length === 0;
}

/** The first thing to tell the office, or null when nothing is wrong. */
export function firstBlockingMessage(result: SendGuardResult): string | null {
  return result.blocking[0]?.message ?? null;
}
