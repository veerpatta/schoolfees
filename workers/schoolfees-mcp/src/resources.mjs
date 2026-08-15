/**
 * Reference material as MCP resources.
 *
 * A definition should not cost a tool call. A client can pin these into context
 * once and then read every number correctly for the rest of the conversation —
 * which is cheaper and more reliable than hoping the model asks what
 * "outstanding_amount" means before it quotes one.
 */

import { STUDENT_SCOPES } from "./scope.mjs";
import { toBase64 } from "./storage.mjs";
import { DOMAIN_RULES, MONEY_GLOSSARY } from "./tools/orientation.mjs";

const MIME = "text/markdown";

function bullets(entries) {
  return entries.map(([term, meaning]) => `- **${term}** — ${meaning}`).join("\n");
}

const MONEY_GLOSSARY_DOC = `# Money vocabulary

Shri Veer Patta Senior Secondary School fee system. Every term below has exactly
one meaning; using them loosely is how a fee report goes wrong.

${bullets(Object.entries(MONEY_GLOSSARY))}

## The one rule to keep

Fees and late fees are separate charges and are never added together and called
"pending". A family whose only remaining debt is a late fee is **not** a
defaulter. If you need the single number a cashier could collect today, that is
\`totalCollectableAmount\`, and say that it includes both.
`;

const SCOPE_DOC = `# Which students count

There are two rules, deliberately different, and conflating them is the single
most common way to produce a wrong figure.

| Question | Rule |
|---|---|
| **Headcount** — how many children the school teaches | \`record_status = 'active'\` |
| **Money** — expected, collected, pending, defaulters | \`record_status = 'active' OR total_paid > 0\` |

The school's rule, in the head's words: a student marked left who never paid has
their dues cancelled, so nothing is expected and nothing is chased. But a student
who **had** paid and then left still owes the rest, and that must still be
collected.

And, deliberately: a student who has left is not on the roll, however much they
owe. Headcount and money are different questions.

## The scopes every tool accepts

${Object.values(STUDENT_SCOPES)
  .map((scope) => `### \`${scope.name}\`\n\n\`${scope.rule}\`\n\n${scope.use}`)
  .join("\n\n")}

Every response carries a \`scope\` block naming the rule it used. If two answers
disagree, compare their scopes before assuming one is wrong.
`;

const SCHOOL_RULES_DOC = `# School fee rules — shape, not amounts

**Every amount on this page has deliberately been left out. Call
\`get_fee_structure\` for the live figures.**

This server's instructions say never to quote a fee amount from memory. A
resource listing ₹1,000 late fee and ₹1,100 academic fee *is* memory: it was
pinned into context and read as current long after \`fee_policy_configs\` could
have moved underneath it. What follows is the part that does not change when the
head revises a number.

- **Late fee**: a flat amount, charged the day an installment passes its due date
  with fees still unsettled, and kept until paid or explicitly waived. Never part
  of fees pending. Never accrues on a carry-forward row.
  → amount: \`get_fee_structure\` → \`policy.lateFeeFlatAmount\`
- **Installments**: four a year, each with its own due date.
  → dates: \`get_fee_structure\` → \`policy.installmentSchedule\`
- **Academic fee**: two tiers, one for a new admission and one for a returning
  student. Which applies is the \`feeTier\` field (New / Old) — that field says
  nothing about whether the student is still enrolled.
  → amounts: \`get_fee_structure\` → \`policy.newStudentAcademicFee\` / \`oldStudentAcademicFee\`
- **Receipt prefix**: \`get_fee_structure\` → \`policy.receiptPrefix\`.
- **Payment modes**: cash, UPI, bank transfer, cheque. A reference number is
  optional for all of them. A fifth mode, \`discount\`, is a write-off, not a
  payment.
- **Conventional discounts**: tuition only, at most two active per student per
  year, lowest resulting tuition wins. The policies in force (RTE, Staff Child,
  Third Child) and what each one sets tuition to are returned live by
  \`get_fee_structure\` → \`conventionalDiscountPolicies\`.

## Previous-year dues

2025-26 does not exist as a session. Unpaid tuition from it rides on the 2026-27
student as carry-forward installments. Split current year from previous year on
\`isCarryForward\`, never on the session label.

## What cannot happen here

This server is read-only. It cannot post a payment, edit a student, change fee
setup, waive a late fee, or send a message. Payments are posted only at the
Payment Desk, by a person, after office verification. Never tell anyone a message
was sent or a payment recorded.
`;

const DOMAIN_RULES_DOC = `# Rules that decide whether an answer is right

${DOMAIN_RULES.map((entry) => `## ${entry.rule}\n\n${entry.detail}`).join("\n\n")}
`;

const DATA_MODEL_DOC = `# Data model, and the traps in it

## Where the numbers come from

- \`v_workbook_student_financials\` — one row per student per session. The money
  headline for a child.
- \`v_workbook_installment_balances\` — one row per live installment. Cancelled
  installments are excluded, which is why a student who left without paying has
  no rows at all.
- \`v_student_directory\` — the filter surface: every segment chip, search text,
  EMI status. This is the right view for any active-vs-left question.
- \`get_dashboard_summary\`, \`get_dashboard_analytics\`, \`get_dashboard_fee_split\`
  — the same functions the office Dashboard reads, so figures match the screen.

Both financial views are **materialized**. They are rebuilt off the payment path,
by the payment action and by a two-minute cron, so a read taken immediately after
a payment can predate it. Every money response carries
\`provenance.dataFreshness\` — check it before calling a figure current.

## Three columns called "status"

| Column | Means | Values |
|---|---|---|
| \`record_status\` | enrollment | active, inactive, left, graduated |
| \`student_status_label\` | academic-fee tier | New, Old |
| \`status_label\` | payment state | PAID, OVERDUE, PARTLY PAID, NOT STARTED |

This server exposes them as \`enrollment.status\`, \`feeTier\` and
\`paymentStatus\` respectively, so they cannot be confused. If you see a field
called \`studentStatus\` anywhere, it is from an old version and its value is the
fee tier, not the enrollment status.

## Other traps

- \`outstanding_amount\` is **fees only**. Late fee is \`late_fee_outstanding_amount\`.
- \`balance_status\` describes the base charge only, and \`overdue\` outranks
  \`partial\` — a partly paid past-due installment reads \`overdue\`.
- A student's session comes from their class, not from a column on the student.
  Promoting a student re-points them; there is no per-session student history row.
- \`TEST-2026-27\` is a real session label in the same tables. A query without a
  session filter mixes test data into production numbers.
- Transport can be charged with no route assigned, via a custom amount. Such a
  student is labelled "Custom transport", not "No Transport".
`;

export const RESOURCES = [
  {
    uri: "schoolfees://glossary/money",
    name: "Money vocabulary",
    description:
      "What every money field means. Read this before quoting any fee figure — most wrong answers are right queries read under the wrong definition.",
    text: MONEY_GLOSSARY_DOC,
  },
  {
    uri: "schoolfees://rules/student-scope",
    name: "Which students count",
    description:
      "The two rules that decide who is included: headcount counts students on the roll, money counts students who are on the roll or have paid.",
    text: SCOPE_DOC,
  },
  {
    uri: "schoolfees://rules/school",
    name: "School fee rules, AY 2026-27",
    description:
      "Late fee, installment due dates, academic fee tiers, payment modes, conventional discounts, and what this server is not allowed to do.",
    text: SCHOOL_RULES_DOC,
  },
  {
    uri: "schoolfees://rules/answering",
    name: "Rules for a correct answer",
    description: "The domain rules an assistant must respect to avoid a plausible but wrong figure.",
    text: DOMAIN_RULES_DOC,
  },
  {
    uri: "schoolfees://data-model",
    name: "Data model and its traps",
    description:
      "The views behind every figure, the three different columns called 'status', and the mistakes they invite.",
    text: DATA_MODEL_DOC,
  },
];

/**
 * The school's identity, in one place.
 *
 * Every consumer in the web app hardcodes "/branding/veer-patta-school-logo.jpg"
 * because lib/config/school.ts has no logo field. A reader of this server should
 * not have to guess either.
 */
function brandingProfileDoc(env) {
  const site = (env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  return `# School identity

- **Name**: Shri Veer Patta Senior Secondary School (VPPS)
- **Short name**: Shri Veer Patta SSS
- **Receipt prefix**: SVP — every receipt number begins with it.
${site ? `- **App**: ${site}
- **Logo (print, 230 KB JPEG)**: ${site}/branding/veer-patta-school-logo.jpg
- **Logo (screen, 16 KB PNG)**: ${site}/branding/icon-192.png` : "- **App URL**: not configured on this Worker (NEXT_PUBLIC_SITE_URL unset), so logo links cannot be given."}

The mark itself is available as the \`schoolfees://branding/logo\` resource.

This is an internal office system for one school. It is not a parent portal and
has no public self-service surface; the only page a parent ever sees is the
receipt verification page at /r/<receipt number>, which shows the receipt number,
date, amount and whether it is valid — deliberately no name, class or balance.
`;
}

/** Cached for the life of the isolate: it is a 16 KB file that never changes. */
let logoCache = null;

async function loadLogoBytes(env) {
  if (logoCache) return logoCache;
  const site = (env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  if (!site) return null;
  const response = await fetch(`${site}/branding/icon-192.png`);
  if (!response.ok) return null;
  logoCache = new Uint8Array(await response.arrayBuffer());
  return logoCache;
}

export function registerResources(server, ctx = {}) {
  const env = ctx.env || {};

  for (const resource of RESOURCES) {
    server.registerResource(
      resource.name,
      resource.uri,
      { title: resource.name, description: resource.description, mimeType: MIME },
      async (uri) => ({
        contents: [{ uri: uri.href, mimeType: MIME, text: resource.text }],
      }),
    );
  }

  server.registerResource(
    "School identity",
    "schoolfees://branding/profile",
    {
      title: "School identity",
      description:
        "The school's name, short name, receipt prefix and logo URLs, plus what this system is and is not.",
      mimeType: MIME,
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: MIME, text: brandingProfileDoc(env) }],
    }),
  );

  server.registerResource(
    "School logo",
    "schoolfees://branding/logo",
    {
      title: "School logo",
      description: "The school mark as a PNG, for letterheads and documents.",
      mimeType: "image/png",
    },
    async (uri) => {
      // A failed fetch must never take down the server: createMcpServer runs per
      // request, so an unhandled throw here would remove every tool for that
      // caller, not just this resource.
      try {
        const bytes = await loadLogoBytes(env);
        if (!bytes) {
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: MIME,
                text: "Logo unavailable: NEXT_PUBLIC_SITE_URL is not configured on this Worker.",
              },
            ],
          };
        }
        return {
          contents: [{ uri: uri.href, mimeType: "image/png", blob: toBase64(bytes) }],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: MIME,
              text: `Logo unavailable: ${String(error?.message || error).slice(0, 200)}`,
            },
          ],
        };
      }
    },
  );
}
