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

/** 08:00-20:00 IST by default. Settable, because the office knows its own day. */
export const DEFAULT_QUIET_HOURS = { start: 8, end: 20 } as const;

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
  /**
   * Messages this run would actually bill. Larger than `recipientCount` when a
   * family is being reached on a second number.
   */
  messageCount?: number;
  /** IST hour, 0-23, at the moment of sending. */
  hourIst?: number;
  /** IST weekday, 0 = Sunday. */
  weekdayIst?: number;
  quietHours?: { start: number; end: number };
  /**
   * Is the fee counter open on the date this notice names?
   *
   * Null when nothing is known, which reads as open — a missing holiday list
   * must not block every send.
   */
  counterOpenOnLastDate?: boolean | null;
  /** The label of the holiday that closes it, for the message. */
  closedReason?: string | null;
  /** Per-run and per-month caps, and what has already gone this month. */
  runMessageCap?: number | null;
  monthMessageCap?: number | null;
  messagesSentThisMonth?: number | null;
  /**
   * Has this campaign EVER gone out cleanly — to a family, or as a test?
   *
   * Null means the question was not asked (the cron only runs saved campaigns
   * that have already gone out). False is a campaign on its first use, which
   * is the only time a wrong slot order can still be caught on a staff phone.
   * It used to demand a fresh test every 24 hours, for campaigns the office
   * had sent to a hundred families the day before.
   */
  campaignProven?: boolean | null;
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
        "This notice is awaiting Meta approval. It cannot be sent until its template is Live in AiSensy and the app's campaign registry marks it approved — there is no switch for this on screen.",
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

  /* ------------------------------------------------------------ judgements */
  /* Everything below WOULD send fine. The question is whether it should, which
     is why an admin may override each one by giving a reason that is written to
     the run. A guard that cannot be overridden gets worked around. */

  // Quiet hours. A fee reminder at eleven at night is the school waking a family
  // up to ask for money.
  const quiet = context.quietHours ?? DEFAULT_QUIET_HOURS;
  if (
    context.hourIst !== undefined &&
    (context.hourIst < quiet.start || context.hourIst >= quiet.end)
  ) {
    overridable.push({
      code: "quiet_hours",
      message: `It is ${String(context.hourIst).padStart(2, "0")}:00. Reminders go out between ${String(quiet.start).padStart(2, "0")}:00 and ${String(quiet.end).padStart(2, "0")}:00 so a message never wakes a family.`,
    });
  }

  // A closed counter. "Pay by Friday" is not actionable if the counter is shut
  // on Friday and every day between now and then.
  const isSunday = context.weekdayIst === 0;
  if (context.counterOpenOnLastDate === false || (isSunday && context.counterOpenOnLastDate !== true)) {
    overridable.push({
      code: "counter_closed",
      message: context.closedReason
        ? `The fee counter is closed (${context.closedReason}). A parent cannot act on this today.`
        : "The fee counter is closed today, so a parent cannot act on this. UPI still works, which is why this is a warning rather than a refusal.",
    });
  }

  // The budget. Named rather than enforced: the office may genuinely need a big
  // run, and the point is that somebody notices it is big.
  const messages = context.messageCount ?? context.recipientCount;
  if (context.runMessageCap && messages > context.runMessageCap) {
    overridable.push({
      code: "budget_exceeded",
      message: `This run is ${messages} messages, over the ${context.runMessageCap} per-run cap.`,
    });
  } else if (
    context.monthMessageCap &&
    context.messagesSentThisMonth !== null &&
    context.messagesSentThisMonth !== undefined &&
    context.messagesSentThisMonth + messages > context.monthMessageCap
  ) {
    overridable.push({
      code: "budget_exceeded",
      message: `This run would take the month to ${context.messagesSentThisMonth + messages} messages, over the ${context.monthMessageCap} cap.`,
    });
  }

  // A campaign on its first use. A wrong slot order sends cleanly and a parent
  // reads their child's class where the amount should be — the one failure that
  // costs money AND is invisible. Once — not every day.
  if (context.campaignProven === false) {
    overridable.push({
      code: "untested_campaign",
      message:
        "This campaign has never gone out — not to a family, and not as a test. Send yourself one test first, so a wrong slot order is caught on a staff phone rather than a parent's. You will not be asked again for this campaign.",
    });
  }

  return { blocking, overridable };
}

/**
 * May this run go ahead, given what the admin has agreed to override?
 *
 * Blocking findings are never overridable. An override is only honoured when a
 * reason was given — the point is that the decision is on the record.
 */
export function resolveGuards(
  result: SendGuardResult,
  override: { codes: readonly string[]; reason: string } | null,
): { allowed: boolean; message: string | null; overridden: string[] } {
  const blocked = result.blocking[0];
  if (blocked) return { allowed: false, message: blocked.message, overridden: [] };

  if (result.overridable.length === 0) {
    return { allowed: true, message: null, overridden: [] };
  }

  const reason = (override?.reason ?? "").trim();
  const agreed = new Set(override?.codes ?? []);
  const unagreed = result.overridable.filter((finding) => !agreed.has(finding.code));

  if (unagreed.length > 0) {
    return { allowed: false, message: unagreed[0]!.message, overridden: [] };
  }
  if (reason.length < 3) {
    return {
      allowed: false,
      message: "Say why you are sending anyway, so the run explains itself.",
      overridden: [],
    };
  }

  return {
    allowed: true,
    message: null,
    overridden: result.overridable.map((finding) => finding.code),
  };
}

/** Convenience: may this run go ahead without an admin override? */
export function isSendAllowed(result: SendGuardResult): boolean {
  return result.blocking.length === 0 && result.overridable.length === 0;
}

/** The first thing to tell the office, or null when nothing is wrong. */
export function firstBlockingMessage(result: SendGuardResult): string | null {
  return result.blocking[0]?.message ?? null;
}
