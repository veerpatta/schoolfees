import { weekdayOfIsoDate } from "@/platform/helpers/date";
import {
  describeDateGuard,
  FINAL_NOTICE_DAYS_BEFORE_DUE,
} from "@/modules/whatsapp/domain/installment-calendar";
import {
  NOTICE_FACT_CONSEQUENCE,
  NOTICE_FACT_LABELS,
  type NoticeFact,
} from "@/modules/whatsapp/domain/audience";

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
  /**
   * How many families on this run cannot fill a slot the chosen template names
   * — no late fee on a "Late fee applied", no promise on a "Promise due".
   *
   * A judgement, not an impossibility: the office asked to be able to point any
   * template at any audience, and there are real uses for it. It became a guard
   * on 2026-09-08, when the template stopped deciding the audience and this
   * mismatch became expressible for the first time.
   */
  noticeFactGaps?: number | null;
  /**
   * WHICH fact is missing, and for how many — not just how many families are
   * affected.
   *
   * The count alone produced "87 families are missing a late fee, a promised
   * date or a carry-forward balance", which names three things when one is
   * true, says nothing about which, and offers no way out. The office cannot
   * act on that, so they tick the override every time and the warning stops
   * meaning anything.
   */
  noticeFactBreakdown?: ReadonlyArray<{ fact: NoticeFact; count: number }> | null;
  /**
   * Is the run's date close enough for `upcoming_final`'s wording — "the late
   * fee starts the day after" — to be a statement about this week?
   *
   * Was a hard audience gate: `upcoming_final` reached nobody outside three
   * days, whatever the office intended. That is a fact about the RUN, not about
   * a family, so it belongs here with the other judgements about whether to
   * send rather than in the query that decides who owes money.
   */
  finalWindowOpen?: boolean | null;
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
  // on Friday.
  //
  // About THE DATE ON THE MESSAGE, not about today. Until 2026-09-13 the Sunday
  // half of this read `weekdayIst`, which `loadGuardFacts` fills from the clock
  // at send time — so every send on a Sunday was held back and made to justify
  // itself, including a notice saying "pay by 20-10-2026", five weeks out on a
  // Tuesday. The counter being shut while the office is sending says nothing
  // about whether a parent can act; the counter being shut on the day the
  // message names says everything. One in seven sends was asking for a typed
  // reason it had no business asking for, which is how a warning stops being
  // read.
  const lastDateWeekday = weekdayOfIsoDate(context.lastDateIso);
  const namesASunday = lastDateWeekday === 0;
  if (
    context.counterOpenOnLastDate === false ||
    (namesASunday && context.counterOpenOnLastDate !== true)
  ) {
    const dateSaid = context.lastDateLabel || "the date on the message";
    overridable.push({
      code: "counter_closed",
      message: context.closedReason
        ? `The fee counter is closed on ${dateSaid} (${context.closedReason}), and that is the date this message names.`
        : `${dateSaid} is a Sunday and the fee counter is closed, so a parent cannot pay at the window on the day this message names. UPI still works, which is why this is a warning rather than a refusal.`,
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

  if (
    context.situation === "upcoming_final" &&
    context.finalWindowOpen === false
  ) {
    overridable.push({
      code: "final_window_closed",
      message: `The final-call wording says the late fee starts the day after ${context.lastDateLabel || "the date on the message"}, and that is more than ${FINAL_NOTICE_DAYS_BEFORE_DUE} days away. Parents read a "final" notice as urgent; sent early it teaches them it is not.`,
    });
  }

  if (context.noticeFactGaps && context.noticeFactGaps > 0) {
    // One finding per fact, each naming what happens and what to do instead.
    // Two very different failures hide behind this guard: a ₹0 that still
    // reaches the parent, and an empty template parameter that WhatsApp
    // REFUSES — the second does not go out looking odd, it does not go out.
    const breakdown = (context.noticeFactBreakdown ?? []).filter((entry) => entry.count > 0);

    if (breakdown.length === 0) {
      overridable.push({
        code: "notice_fact_gap",
        message: `${context.noticeFactGaps} of these families are missing something this message names.`,
      });
    }

    for (const entry of breakdown) {
      const { effect, fix } = NOTICE_FACT_CONSEQUENCE[entry.fact];
      overridable.push({
        code: `notice_fact_gap:${entry.fact}`,
        message: `${entry.count} of these families have no ${NOTICE_FACT_LABELS[entry.fact]}, so ${effect}. To avoid it, ${fix}.`,
      });
    }
  }

  return { blocking, overridable };
}

export type ResolvedGuards = {
  allowed: boolean;
  message: string | null;
  overridden: string[];
  /** The reason to write to the run. Empty when nothing was overridden. */
  reason: string;
  /**
   * Was the refusal a BLOCKING finding — one no tick-box and no reason can
   * clear?
   *
   * The caller needs this to know whether offering an override is honest. The
   * send screens used to attach the overridable list to every refusal, so a run
   * blocked for having no date came back with a row of tick-boxes and a "why
   * send anyway?" box beside a sentence about something else entirely. Staff
   * ticked all of them, typed a reason, pressed Send anyway, and were refused
   * in exactly the same words. Nothing on screen said that could not work.
   */
  blocked: boolean;
};

/**
 * May this run go ahead, given what the admin has agreed to override?
 *
 * Blocking findings are never overridable. An override is only honoured when a
 * reason is on the record — but see `defaultReason`: on a hand-picked send the
 * press IS the reason, and the record says so.
 */
export function resolveGuards(
  result: SendGuardResult,
  override: { codes: readonly string[]; reason: string } | null,
  options: {
    /**
     * What to write on the run when the admin ticked the boxes but typed
     * nothing — supplied only for a send the caller knows was deliberate and
     * hand-picked, never for a broadcast.
     *
     * A 141-family run at ten at night should have to say why in somebody's own
     * words. One family, chosen by name by a person looking at that family's
     * page, should not: the honest record there is "a staff member sent this by
     * hand", which this writes, and demanding prose on top of it only produces
     * `asdf` — a record that says less than the sentence it replaced.
     */
    defaultReason?: string;
  } = {},
): ResolvedGuards {
  const blocked = result.blocking[0];
  if (blocked) {
    return {
      allowed: false,
      message: blocked.message,
      overridden: [],
      reason: "",
      blocked: true,
    };
  }

  if (result.overridable.length === 0) {
    return { allowed: true, message: null, overridden: [], reason: "", blocked: false };
  }

  const typed = (override?.reason ?? "").trim();
  const fallback = (options.defaultReason ?? "").trim();
  const reason = typed.length >= 3 ? typed : fallback;
  const agreed = new Set(override?.codes ?? []);
  const unagreed = result.overridable.filter((finding) => !agreed.has(finding.code));

  if (unagreed.length > 0) {
    return {
      allowed: false,
      message: unagreed[0]!.message,
      overridden: [],
      reason: "",
      blocked: false,
    };
  }
  if (reason.length < 3) {
    return {
      allowed: false,
      message: "Say why you are sending anyway, so the run explains itself.",
      overridden: [],
      reason: "",
      blocked: false,
    };
  }

  return {
    allowed: true,
    message: null,
    overridden: result.overridable.map((finding) => finding.code),
    reason,
    blocked: false,
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
