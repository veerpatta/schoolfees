/**
 * Tools that teach the domain, so an assistant stops guessing.
 *
 * Most wrong answers from a fee system are not wrong queries — they are right
 * queries read under the wrong definition. Adding a late fee to a fee total,
 * calling a write-off "collected", treating last year's carry-forward as this
 * year's tuition, or counting a leaver in a headcount. So the vocabulary is a
 * tool call away, and the caller's own reach is part of it.
 */

import * as z from "zod/v4";

import { STUDENT_SCOPES } from "../scope.mjs";
import { describeIdentity } from "../permissions.mjs";
import { getDataFreshness, todayIst } from "../freshness.mjs";
import { createDegradationLog, selectAll } from "../supabase.mjs";
import { getDashboardHeadline } from "../reads.mjs";
import {
  count,
  dataFreshnessBlock,
  degradedBlock,
  detailObject,
  isoDate,
} from "../schema.mjs";
import { defineTool, sessionSchema, toolResult } from "../toolkit.mjs";

/** onRoll is the actionable half of a data-quality figure; total includes leavers. */
const qualityCount = z.looseObject({ onRoll: count, notOnRoll: count, total: count });

export const MONEY_GLOSSARY = {
  feesExpectedAmount:
    "What the school expects in fees for the year, after discounts. Excludes late fees entirely.",
  totalPaid: "Cash actually received. Excludes discount-mode write-offs.",
  feesPendingAmount:
    "Fees still owed. NEVER includes a late fee. This is what decides overdue and defaulter status.",
  lateFeePendingAmount:
    "Late fee still owed, after waivers and after any payment against it. Tracked separately from fees.",
  totalCollectableAmount:
    "feesPendingAmount + lateFeePendingAmount. What a cashier can actually take today.",
  discountCloseoutAmount:
    "A discount-mode receipt: the school writing off a balance, not money received. Never counted as collection.",
  reversedAmount:
    "A posted receipt that was reversed. It stays visible and marked, is excluded from every collection figure, and is never deleted.",
  oldBalanceAmount:
    "Last year's unpaid tuition, carried onto this year's ledger as a carry-forward installment. Identified by is_carry_forward, never by session label.",
  moneySegment:
    "never_paid | partly_paid | year_clear | unclassified — derived from money, not from the timing-oriented payment status label.",
};

export const DOMAIN_RULES = [
  {
    rule: "A late fee is not a fee.",
    detail:
      "Fees and late fees live in separate columns everywhere. A family whose only debt is a late fee is NOT a defaulter and never appears in the defaulter queue. Never add the two and call the result 'pending'.",
  },
  {
    rule: "Headcount and money are different questions.",
    detail:
      "Headcount counts students on the roll (active). Money counts students who are on the roll OR have paid something, because a student who left owing money still owes it. Every tool says which rule it used, in its scope block.",
  },
  {
    rule: "Enrollment status is not the fee tier.",
    detail:
      "enrollment.status is active | inactive | left | graduated. feeTier is New | Old and only decides which academic fee applies. They are different columns and answer different questions.",
  },
  {
    rule: "Last year's dues ride on this year's ledger.",
    detail:
      "2025-26 does not exist as a session. Unpaid tuition from it appears as carry-forward installments on the 2026-27 student. Split current year from previous year on is_carry_forward, never on session_label. Carry-forward rows never accrue a late fee.",
  },
  {
    rule: "Financial history is append-only.",
    detail:
      "Payments and receipts are never rewritten. Corrections are separate payment_adjustments rows with an audit trail, and a reversed receipt stays on file marked as reversed.",
  },
  {
    rule: "Money moves only at the Payment Desk.",
    detail:
      "This server is read-only. It can draft a reminder and quote a balance, but nothing here posts a payment, edits a student, changes fee setup or sends a message.",
  },
  {
    rule: "balance_status describes the base charge only.",
    detail:
      "'overdue' outranks 'partial': a partly paid past-due installment reads overdue. Late-fee state is carried separately in late_fee_status.",
  },
];

/**
 * The live session, from configuration rather than a literal.
 *
 * It was hardcoded as "2026-27" in three places while `defaultSession` already
 * read the env var, so rolling the school over to 2027-28 would have left this
 * server insisting the new year was not the live one.
 */
function liveSession(env) {
  return env.SCHOOLFEES_MCP_DEFAULT_SESSION || "2026-27";
}

export function registerOrientationTools(server, ctx) {
  const { env, identity } = ctx;

  defineTool(server, ctx, {
    name: "describe_capabilities",
    title: "Describe Capabilities And Vocabulary",
    description:
      "Call this FIRST in a new conversation about school fees. It returns the money vocabulary, the rules that decide which students count, what each tool is for, and what the current caller is allowed to read. Use it instead of guessing what a field means.",
    inputSchema: {},
    outputSchema: {
      server: detailObject,
      you: detailObject,
      availableTools: z.array(z.string()),
      studentScopes: z.array(
        z.looseObject({ name: z.string(), rule: z.string(), use: z.string() }),
      ),
      moneyGlossary: detailObject,
      domainRules: z.array(z.looseObject({ rule: z.string(), detail: z.string() })),
      howToAnswerWell: z.array(z.string()),
    },
    handler: async () => {
      const who = describeIdentity(identity);
      // Populated by server.mjs once every family has registered, so this
      // lists exactly what THIS caller may run, not the full catalogue.
      const tools = ctx.availableToolNames?.() ?? [];

      return toolResult(
        `Schoolfees MCP: read-only access to Shri Veer Patta Senior Secondary School's fee system. You are connected as ${who.kind === "service" ? "unattended automation" : `${who.roleLabel || who.role}`}.`,
        {
          server: {
            school: "Shri Veer Patta Senior Secondary School (VPPS)",
            readOnly: true,
            note: "Every tool reads. Nothing here posts payments, edits records, or sends messages.",
            defaultSession: liveSession(env),
            liveSession: liveSession(env),
            testSession: `TEST-${liveSession(env)}`,
          },
          you: who,
          availableTools: tools,
          studentScopes: Object.values(STUDENT_SCOPES).map((scope) => ({
            name: scope.name,
            rule: scope.rule,
            use: scope.use,
          })),
          moneyGlossary: MONEY_GLOSSARY,
          domainRules: DOMAIN_RULES,
          howToAnswerWell: [
            "Always fetch live data. Never quote a fee amount from memory.",
            "Quote fees pending and late fee pending as two numbers, or quote totalCollectableAmount and say it includes both.",
            "When a payload carries a scope block, say which population the number covers if it could be misread.",
            "Check provenance.dataFreshness before calling a figure current — the financial views rebuild off the posting path.",
            "Never claim a message was sent or a payment was posted. This server cannot do either.",
          ],
        },
      );
    },
  });

  defineTool(server, ctx, {
    name: "list_sessions",
    title: "List Academic Sessions",
    description:
      "Use this when the user asks which academic years exist, which one is live, or to confirm a session label before querying it. Test sessions are flagged so their data is never mistaken for the real school's.",
    inputSchema: {},
    outputSchema: {
      sessions: z.array(
        z.looseObject({
          sessionLabel: z.string(),
          status: z.string().nullable(),
          isTest: z.boolean(),
          isLive: z.boolean(),
          purpose: z.string(),
          notes: z.string().nullable(),
        }),
      ),
      asOfDateIst: isoDate,
    },
    requires: ["settings:view", "dashboard:view"],
    handler: async () => {
      const { rows } = await selectAll(env, "academic_sessions", {
        select: "id,session_label,status,notes,created_at,updated_at",
        order: "session_label.desc",
      });

      const sessions = rows.map((row) => {
        const label = row.session_label;
        const isTest = /^(TEST|UAT|DEMO)-/.test(label);
        return {
          sessionLabel: label,
          status: row.status,
          isTest,
          isLive: label === liveSession(env),
          purpose: isTest
            ? "Test data. Never quote these figures as the school's real position."
            : "Real school financial records.",
          notes: row.notes || null,
        };
      });

      return toolResult(
        `${sessions.length} academic session(s). Live: ${liveSession(env)}. Test sessions are flagged.`,
        { sessions, asOfDateIst: todayIst() },
      );
    },
  });

  defineTool(server, ctx, {
    name: "get_system_health",
    title: "Get System Health",
    description:
      "Use this when the user asks whether the numbers can be trusted, why a figure looks stale, or for a data-quality check. Reports how recently the financial views were rebuilt and counts the records with quality problems.",
    inputSchema: { sessionLabel: sessionSchema(env) },
    outputSchema: {
      sessionLabel: z.string(),
      dataFreshness: dataFreshnessBlock,
      /** null means the read failed — see degraded. Never 0. */
      headcountOnRoll: count.nullable(),
      sessionTotalsAvailable: z.boolean(),
      dataQuality: z.looseObject({
        studentRecordsInSession: qualityCount,
        missingPhone: qualityCount,
        duesNotPrepared: qualityCount,
        missingDateOfBirth: qualityCount,
        duplicateSrNumber: qualityCount,
        pendingSrNumber: qualityCount,
        note: z.string(),
      }),
      populations: detailObject,
      degraded: degradedBlock,
    },
    requires: ["settings:view", "dashboard:view"],
    handler: async ({ sessionLabel }) => {
      const freshness = await getDataFreshness(env);

      const { rows: quality } = await selectAll(env, "v_student_directory", {
        select:
          "student_id,record_status,seg_missing_phone,seg_dues_not_prepared,seg_missing_dob,seg_duplicate_sr,seg_pending_sr",
        session_label: `eq.${sessionLabel}`,
      });

      // Split, not summed. `duesNotPrepared` reads 25 on the live session and
      // every one of them is a student who has left — withdrawing cancels the
      // unpaid installments, so the actionable number is 0. Reporting the
      // combined figure and explaining the caveat in prose left the assistant
      // to work out a split it could not see.
      const onRollRow = (row) => row.record_status === "active";
      const count = (key) => {
        const matched = quality.filter((row) => row[key] === true);
        const onRoll = matched.filter(onRollRow).length;
        return { onRoll, notOnRoll: matched.length - onRoll, total: matched.length };
      };

      // This is the tool people call to ask whether the numbers can be trusted.
      // Swallowing a failed read here answered "healthy" by omission.
      const degraded = createDegradationLog();
      const headline = await degraded.tolerate(
        "get_dashboard_summary",
        () => getDashboardHeadline(env, sessionLabel),
        null,
      );

      const onRollTotal = quality.filter(onRollRow).length;
      const phone = count("seg_missing_phone");
      const duplicateSr = count("seg_duplicate_sr");

      return toolResult(
        freshness.refreshPending
          ? `${sessionLabel}: a payment has been posted since the financial views were last rebuilt — figures may be up to two minutes behind the Payment Desk.`
          : `${sessionLabel}: ${headline ? `${headline.totalStudents} students on the roll. ` : ""}Financial views current as of ${freshness.lastRefreshedAt || "unknown"}. Among students on the roll: ${duplicateSr.onRoll} duplicate SR, ${phone.onRoll} without a phone.`,
        {
          sessionLabel,
          dataFreshness: freshness,
          // The headcount leads. When this read failed, the only student number
          // left in this payload was the unfiltered `studentsInSession`, and an
          // assistant asked "how many students" answered with it.
          headcountOnRoll: headline ? headline.totalStudents : null,
          sessionTotalsAvailable: headline !== null,
          dataQuality: {
            // Deliberately NOT a headcount: every student record attached to
            // this session, leavers included. Read `headcountOnRoll` above for
            // how many children the school teaches.
            studentRecordsInSession: { onRoll: onRollTotal, notOnRoll: quality.length - onRollTotal, total: quality.length },
            missingPhone: phone,
            duesNotPrepared: count("seg_dues_not_prepared"),
            missingDateOfBirth: count("seg_missing_dob"),
            duplicateSrNumber: duplicateSr,
            pendingSrNumber: count("seg_pending_sr"),
            note: "Each figure is split by population: onRoll is what needs attention, notOnRoll is students who have left. duesNotPrepared means the student has no installment rows — expected for a leaver, because withdrawing cancels unpaid installments, and a problem only for a student on the roll.",
          },
          populations: {
            headcountOnRoll: { scope: "on_roll", rule: "record_status = 'active'" },
            "dataQuality.*.onRoll": { scope: "on_roll", rule: "record_status = 'active'" },
            "dataQuality.*.total": { scope: "everyone", rule: "no status filter" },
          },
          degraded: degraded.entries,
        },
      );
    },
  });
}
