/**
 * Seven slices of this app, each small enough that one reviewer can hold it.
 *
 * The temptation with a model reviewer is to hand it the repository and ask
 * what is wrong. That produces exactly what an unscoped prompt always produces
 * here: "consider extracting this helper", "these names are inconsistent", and
 * one confident hallucination about a file that does not exist. A reviewer with
 * 1,100 modules in scope has no budget to actually read any of them, so it
 * pattern-matches on shape instead of behaviour — and shape is what the eleven
 * static checks already cover, deterministically and for free.
 *
 * So the unit here is a *subsystem*: a named directory or three, the invariants
 * that govern it quoted verbatim out of CLAUDE.md, and a sentence saying what
 * kind of defect actually lives there. Bounded enough that reading the files is
 * affordable within one reviewer's turn budget, and named enough that a claim
 * can be argued about.
 *
 * The invariants are quoted, not paraphrased, on purpose. Paraphrasing
 * "pending_amount never contains a late fee" into "keep fee types separate"
 * loses the column names, and the column names are the whole rule — the
 * `20260812001114` incident was one engine reading `pending_amount` where the
 * other read `total_pending`, which no paraphrase would have caught.
 *
 * Adding a subsystem is a deliberate act: it costs one reviewer invocation per
 * run, plus up to three refuters per claim it raises. Eight is roughly the
 * point where a default pass stops being something you run on every branch.
 */

/**
 * Invariants that govern more than one subsystem.
 *
 * Repeated into each `invariants` array rather than referenced, because the
 * reviewer prompt is a flat block of text and a cross-reference in a prompt is
 * a cross-reference the model has to go and resolve.
 */
const APPEND_ONLY = `All payment/receipt records are **append-only**. Corrections use a separate \`payment_adjustments\` table with an audit trail. Never rewrite \`payments\` or \`receipts\` rows directly — this constraint applies at every layer (DB, API, UI). A reversed receipt stays visible and marked, and is excluded from every collection figure; it is never deleted or silently subtracted.`;

const MONEY_COLUMNS = `\`pending_amount\` — **Fees only.** Never contains a late fee. Decides overdue and defaulter status.
\`late_fee_pending\` — The late fee still owed, after waivers and after any payment against it.
\`total_pending\` — The two added. What a cashier can actually collect.
\`balance_status\` reads \`paid\` once fees are clear, whatever the late fee is doing; \`late_fee_status\` (\`none | pending | waived | paid\`) carries that separately. A family whose only debt is a late fee is **not** a defaulter.`;

const POPULATION_RULE = `**Headcount and money count different students, on purpose.** Headcount is \`record_status = 'active'\`. Money — expected, collected, pending, defaulters — is \`record_status = 'active' OR total_paid > 0\`, because a student who left owing money still owes it (\`20260808210000\`). Never let one rule drift onto the other's question: that is what hid ₹17,250 of live collectable dues, and what made the MCP server and the Dashboard disagree.`;

const SERVICE_ROLE_RULE = `**RPCs that gate on \`public.has_permission(...)\` MUST be called via the user-JWT supabase client (\`createClient()\` from \`lib/supabase/server.ts\`), NEVER the service-role admin client.** \`has_permission\` requires \`auth.uid() is not null\`, which is null under a service-role JWT — every call would raise "You do not have permission…".`;

const HEADLESS_ADMIN_RULE = `Anything that runs the fee engine outside a staff request — a cron, a script, an admin route — has no session, so the cookie-based Supabase client returns NOTHING under RLS. \`getFeeSetupPageData({ useAdmin: true })\` threads that flag down to fee settings, master data, conventional discount policies and student assignments. Miss it and the generator silently skips every student with \`CLASS_FEE_MISSING\`, or resolves every RTE / Staff Child / 3rd Child student to no discount at all. It fails quiet, not loud.`;

/**
 * The list. Order is the order reviewers are dispatched in, and the first three
 * are the ones that move money — if a run is cut short by a rate limit, those
 * are the three that should already have finished.
 */
export const SUBSYSTEMS = [
  {
    id: "fees",
    title: "Fee engine, policy resolution and discounts",
    files: [
      "lib/fees/**/*.ts",
      "lib/workbook/**/*.ts",
      "lib/money/**/*.ts",
      "lib/config/fee-rules.ts",
    ],
    invariants: [
      MONEY_COLUMNS,
      `A late fee is never folded into a fees figure, and never makes a student a defaulter. The rule lives in two engines that must be edited together: \`v_workbook_installment_balances\` and \`private.workbook_installment_snapshot\`, both carrying the \`>>> SHARED LATE FEE RULE <<<\` marker.`,
      `Late fee: ₹1,000 flat — charged the day an installment passes its due date with fees still unsettled, and kept until paid or explicitly waived. **Never part of fees pending**, and never accrues on a carry-forward row (those carry a rate of 0 deliberately).`,
      `Conventional discounts: RTE → tuition = ₹0; Staff Child → tuition = 50%; 3rd Child Policy → tuition = ₹6,000. Rules: tuition-only impact; max 2 active policies per student per year; lowest candidate tuition wins; year-scoped and auditable; manual override remains separate.`,
      `Fee Setup publish must preview impact first and protect paid/partial/adjusted rows from silent rewrite. It must also leave carry-forward rows and EMI-covered installments alone.`,
      HEADLESS_ADMIN_RULE,
      `Installment due dates: 20-04-2026, 20-07-2026, 20-10-2026, 20-01-2027. New student academic fee: ₹1,100 | Existing: ₹500.`,
    ],
    focus:
      "Arithmetic that silently produces the wrong rupee figure: a late fee added into a fees "
      + "total, a discount resolved against the wrong session, a rounding direction that differs "
      + "between the generator and the projection, a policy resolver that returns a default "
      + "instead of throwing when no policy exists, or a headless caller that omits useAdmin and "
      + "so silently resolves every discounted student to no discount.",
  },
  {
    id: "payments",
    title: "Payment posting, allocation and the Payment Desk",
    files: [
      "lib/payments/**/*.ts",
      "app/protected/payments/**/*.ts",
      "app/protected/payments/**/*.tsx",
    ],
    invariants: [
      APPEND_ONLY,
      MONEY_COLUMNS,
      `**The posting RPCs and the desk preview allocate against \`total_pending\`.** Fees-only would refuse to let a cashier take a late fee the ledger is still asking for.`,
      `No alternate payment-posting paths outside the Payment Desk module (\`/protected/payments\`, including its admin-only bulk-entry sub-surface \`/protected/payments/bulk\`, which posts every row through \`post_student_payment_with_adjustments\`).`,
      SERVICE_ROLE_RULE,
      `\`get_dashboard_summary\` and \`get_dashboard_analytics\` are cached on the \`session:{label}\` tag that \`revalidateSessionFinance\` already busts after every posting. **Anything that moves money must bust that tag** — refunds did not, and served stale numbers until the next posting happened to clear it.`,
      `Correcting a wrong fee entry is reverse + repost, never an edit. Three reversal paths, all writing the same compensating \`payment_adjustments\` rows: \`undo_recent_payment\` (10 minutes, \`payments:adjust\`), \`reverse_receipt_admin\` (**any age**, admin-only \`payments:reverse_any\`, mandatory reason), and \`process_refund_with_adjustment\` (real money handed back).`,
    ],
    focus:
      "Double-posting and lost-update windows: an idempotency key that does not cover the "
      + "retry path, an allocation that can leave a remainder unassigned or assign more than "
      + "was tendered, a preview whose arithmetic disagrees with the RPC that actually posts, "
      + "a posting path that does not revalidate the session:{label} cache tag, and any write "
      + "to payments or receipts that is not an append.",
  },
  {
    id: "session",
    title: "Academic session resolution and the Supabase client boundary",
    files: [
      "lib/session/**/*.ts",
      "lib/session/**/*.tsx",
      "lib/supabase/session.ts",
      "lib/supabase/server.ts",
      "lib/supabase/admin.ts",
      "lib/supabase/cache-safe.ts",
    ],
    invariants: [
      SERVICE_ROLE_RULE,
      `\`2026-27\` is the live production session with real school financial records. Use \`TEST-2026-27\` for all testing and debugging. Never add test data, post test payments, or make experimental changes to the \`2026-27\` session.`,
      `Format: \`2026-27\`. Test prefixes accepted: \`TEST-2026-27\`, \`UAT-2026-27\`, \`DEMO-2026-27\`. Parsing is handled by \`parseAcademicSessionLabel()\` in \`lib/config/fee-rules.ts\`.`,
      `\`SUPABASE_SERVICE_ROLE_KEY\` must never appear in \`NEXT_PUBLIC_*\` variables or be imported in browser code.`,
      `\`get_dashboard_summary\` and \`get_dashboard_analytics\` are cached on the \`session:{label}\` tag that \`revalidateSessionFinance\` already busts after every posting.`,
    ],
    focus:
      "A query that reads one session and writes another, a resolver that falls back to a "
      + "hardcoded or first-row session when the cookie is absent or malformed, a cache key "
      + "that omits the session label so two sessions share an entry, and any use of the "
      + "service-role client where a user-JWT client is required.",
  },
  {
    id: "receipts",
    title: "Receipts, reversals and the ledger read model",
    files: [
      "lib/receipts/**/*.ts",
      "lib/receipts/**/*.tsx",
      "lib/ledger/**/*.ts",
      "lib/finance-controls/**/*.ts",
    ],
    invariants: [
      APPEND_ONLY,
      `One narrowing to the append-only rule: \`receipts\` uses \`private.protect_receipt_money_columns()\` rather than the shared guard. Every money column still raises; \`reference_number\`, \`notes\` and \`received_by\` may be updated in place because they carry no money. \`payments\`, \`payment_adjustments\` and \`audit_logs\` are unchanged.`,
      `A reversed receipt stays visible and marked, and is excluded from every collection figure; it is never deleted or silently subtracted.`,
      `Receipt prefix: \`SVP\`. Reference number is **optional for all payment modes**.`,
      `Refunds processed in Finance Controls post a \`reversal\` \`payment_adjustment\` so they move money in the projection.`,
    ],
    focus:
      "A reversed receipt still counted in a collection total, a refund that adjusts the "
      + "ledger without a compensating payment_adjustments row, a receipt number generator "
      + "that can collide under concurrency, and the public /r/[code] verification surface "
      + "disclosing more than receipt number, date, amount and reversed-flag.",
  },
  {
    id: "rbac",
    title: "Roles, permissions and the staff guard helpers",
    files: [
      "lib/auth/**/*.ts",
      "lib/config/navigation.ts",
      "lib/supabase/session.ts",
      "lib/supabase/middleware.ts",
      "lib/supabase/proxy.ts",
      "proxy.ts",
    ],
    invariants: [
      `Five roles defined in \`lib/auth/roles.ts\`: \`admin\`, \`accountant\`, \`teacher\`, \`fee_collector\`, \`view_only\` (legacy aliases \`read_only_staff\`→\`view_only\` and \`defaulter_followup\`→\`fee_collector\` still resolve). Enforced in the app layer via \`requireAuthenticatedStaff()\` in \`lib/supabase/session.ts\` and by Supabase RLS.`,
      `Default landing routes (\`getDefaultProtectedHref()\`): \`admin\`/\`view_only\` → Dashboard; \`accountant\` → Payment Desk; \`teacher\` → Students; \`fee_collector\` → Defaulters.`,
      `The \`/protected\` root redirect must never loop back to itself.`,
      `Keep public signup disabled after the bootstrap phase.`,
      SERVICE_ROLE_RULE,
    ],
    focus:
      "A permission that resolves to true for a role that should not hold it, an alias that "
      + "resolves to a broader role than the one it replaced, a default-deny that is actually "
      + "a default-allow when the role string is unknown or undefined, a landing route that "
      + "sends a role to a page its permissions refuse, and any redirect that can cycle.",
  },
  {
    id: "import-export",
    title: "Student and payment import, and the XLSX export center",
    files: [
      "lib/import/**/*.ts",
      "lib/excel/**/*.ts",
      "lib/reports/**/*.ts",
      "app/protected/exports/**/*.ts",
      "app/protected/exports/**/*.tsx",
    ],
    invariants: [
      `Staged workflow: upload → column mapping → dry-run validation → row-by-row review → commit valid rows only. Every \`import_rows\` record must carry a \`batch_id\`. Batch and row traceability must be preserved. Conventional discount assignments should not be silently applied from import data — use the explicit assignment workflow.`,
      POPULATION_RULE,
      MONEY_COLUMNS,
      `\`toLocaleString('en-IN')\`, \`Intl.NumberFormat('en-IN')\` and hand-written \`₹\`/\`Rs.\` outside \`lib/helpers/currency.ts\` are CI errors; a deliberate exception needs an \`@allow-raw-money-format\` comment with a reason.`,
      `No alternate payment-posting paths outside the Payment Desk module — the bulk payment upload posts every row through \`post_student_payment_with_adjustments\`.`,
    ],
    focus:
      "A commit path that writes rows the dry run never validated, a batch_id that can be "
      + "null or reused across uploads, a partial commit that leaves half a batch applied with "
      + "no way to tell which half, an export that sums a late fee into a fees column, and an "
      + "export whose student population rule disagrees with the dashboard's.",
  },
  {
    id: "mcp",
    title: "The read-only SchoolFees MCP worker",
    files: ["workers/schoolfees-mcp/src/**/*.mjs"],
    invariants: [
      POPULATION_RULE,
      `\`lib/workbook/data.ts:680\` and \`workers/schoolfees-mcp/src/scope.mjs\` are the two places the population rule is written down.`,
      MONEY_COLUMNS,
      `\`workers/schoolfees-mcp/src/permissions.mjs\` mirrors \`lib/auth/roles.ts\`. The worker is read-only: it cannot post a payment, edit a record, or send a message.`,
      `A late fee is never folded into a fees figure, and never makes a student a defaulter.`,
    ],
    focus:
      "Drift from the app: a permission table that grants what lib/auth/roles.ts denies, a "
      + "scope rule that counts a different student population than lib/workbook/data.ts, a "
      + "money field mapped onto the wrong column name, a tool that reaches a table outside "
      + "its declared scope, and anything in the worker that writes.",
  },
];

/**
 * Resolve `--ai-subsystems a,b` against the list.
 *
 * Unknown ids are returned rather than dropped, so `runAiLayer` can say "you
 * asked for `feez` and there is no such subsystem" instead of quietly reviewing
 * nothing and reporting a clean pass. Every silent-empty path in this layer is
 * a path that reports zero findings for the wrong reason.
 */
export function selectSubsystems(ids) {
  if (!ids || ids.length === 0) return { selected: SUBSYSTEMS, unknown: [] };
  const byId = new Map(SUBSYSTEMS.map((subsystem) => [subsystem.id, subsystem]));
  const selected = [];
  const unknown = [];
  for (const id of ids) {
    const found = byId.get(id);
    if (found) selected.push(found);
    else unknown.push(id);
  }
  return { selected, unknown };
}

export const SUBSYSTEM_IDS = SUBSYSTEMS.map((subsystem) => subsystem.id);
