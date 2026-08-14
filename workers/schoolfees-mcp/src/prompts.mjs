/**
 * Prompts for the workflows the office actually runs.
 *
 * These are starting points a person picks from a menu in their AI client, not
 * instructions the server imposes. Each one names the tools to use and the
 * mistakes to avoid, so a fresh conversation does not have to rediscover them.
 */

import * as z from "zod/v4";

const SESSION_ARG = z
  .string()
  .optional()
  .describe("Academic session, e.g. 2026-27. Omit for the school's current one.");

function userMessage(text) {
  return { messages: [{ role: "user", content: { type: "text", text } }] };
}

export function registerPrompts(server, { env }) {
  const defaultSession = env.SCHOOLFEES_MCP_DEFAULT_SESSION || "2026-27";

  server.registerPrompt(
    "morning_recovery_run",
    {
      title: "Morning recovery run",
      description:
        "The daily fee-collection routine: today's position, the ranked call list, promises to chase, and draft reminders ready for a person to send.",
      argsSchema: { sessionLabel: SESSION_ARG },
    },
    ({ sessionLabel }) =>
      userMessage(
        `Run the morning fee recovery for session ${sessionLabel || defaultSession}.

Call daily_recovery_digest. Then give me:
1. Where we stand: fees pending and late fee pending as two separate figures, and how many families owe.
2. The call list in order, with why each family is on it and what to ask them for. For a family on an EMI plan, ask only for what the plan says is due — not the whole balance.
3. Promises that were broken or fall due today, called out first.
4. The draft messages, ready to review.

Do not suggest ringing any family flagged no-call. Do not say a message was sent or a payment was posted — this system cannot do either.`,
      ),
  );

  server.registerPrompt(
    "student_360",
    {
      title: "Everything about one student",
      description:
        "A complete picture of one child: fees, payment history, siblings, EMI plan, and follow-up history.",
      argsSchema: {
        student: z.string().describe("Admission (SR) number, name, or parent phone."),
        sessionLabel: SESSION_ARG,
      },
    },
    ({ student, sessionLabel }) =>
      userMessage(
        `Give me the full picture for ${student} in session ${sessionLabel || defaultSession}.

Use get_student with include: ["installments", "receipts", "plan", "family", "contacts"].

Cover: whether they are still on the roll (enrollment.status — not feeTier, which is only the academic-fee tier), what is charged and why, what has been paid and when, what is still owed with fees and late fee stated separately, last year's carry-forward if any, siblings, any EMI plan including plans that were superseded, and the follow-up history.`,
      ),
  );

  server.registerPrompt(
    "class_review",
    {
      title: "Class-by-class review",
      description: "Which classes are behind on collection and which families drive it.",
      argsSchema: { sessionLabel: SESSION_ARG },
    },
    ({ sessionLabel }) =>
      userMessage(
        `Review collection class by class for ${sessionLabel || defaultSession}.

Use get_class_due_summary, then query_students with segments ["overdue"] for the weakest classes.

Rank classes by recovery rate, not by rupees pending — a big class will always owe more. Name the classes that need attention and the handful of families in each who account for most of the gap.`,
      ),
  );

  server.registerPrompt(
    "reconcile_money",
    {
      title: "Reconcile the money",
      description:
        "Cross-check the session totals against the Dashboard's own figures and explain any difference.",
      argsSchema: { sessionLabel: SESSION_ARG },
    },
    ({ sessionLabel }) =>
      userMessage(
        `Reconcile the fee position for ${sessionLabel || defaultSession}.

Call get_session_money_summary and get_dashboard_analytics, then compare them.

Report: headcount on the roll, total expected, collected, fees pending, late fee pending, and this year versus last year's carry-forward. Where two figures differ, read the scope block on each and say whether the difference is the expected one (money includes students who left owing; headcount does not) or something that needs investigating. Check provenance.dataFreshness and say how current these figures are.`,
      ),
  );

  server.registerPrompt(
    "explain_this_number",
    {
      title: "Explain a number",
      description:
        "Trace a fee figure back to the policy, discounts, payments and waivers that produced it.",
      argsSchema: {
        student: z.string().describe("Admission (SR) number or name."),
        sessionLabel: SESSION_ARG,
      },
    },
    ({ student, sessionLabel }) =>
      userMessage(
        `Explain exactly how ${student}'s fee position was arrived at, for ${sessionLabel || defaultSession}.

Use get_fee_structure for the policy, then get_student with include: ["installments", "receipts", "plan"].

Walk it through: the base tuition, transport and academic fee; any conventional discount or manual override and which one won; what that produced per installment; every payment and what it was allocated to; any late fee charged and whether it was waived, and by whom; and last year's carry-forward if there is any. Finish with what is owed today, fees and late fee stated separately.`,
      ),
  );

  server.registerPrompt(
    "left_students_still_owing",
    {
      title: "Students who left still owing",
      description: "The recovery list the defaulter queue does not cover.",
      argsSchema: { sessionLabel: SESSION_ARG },
    },
    ({ sessionLabel }) =>
      userMessage(
        `List students who have left, graduated or gone inactive in ${sessionLabel || defaultSession} and still owe money.

Use get_left_student_recovery.

For each: what they owe, what they had already paid before leaving, and a contact number. Note that a student who left having paid nothing has their unpaid dues cancelled and correctly does not appear here — so a short list is the expected result, not a missing one.`,
      ),
  );
}
