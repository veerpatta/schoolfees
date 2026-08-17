/**
 * What the Worker exposes, written down so the harness can notice a change.
 *
 * A second copy, on purpose — the same arrangement `tests/unit/mcp-permissions.test.ts`
 * already uses for the role matrix. Reading `requires` out of the Worker and
 * then asserting the Worker agrees with it proves only that the code agrees
 * with itself. Here the copy is the expectation: a tool that appears in
 * `tools/list` for a role whose permissions do not satisfy the `requires`
 * written below is a **P0**, and a tool the Worker has that this table does not
 * is a coverage gap the run reports rather than skips.
 *
 * `args` is the minimal valid call. `session: true` means the tool takes a
 * `sessionLabel` and the runner fills it per lane.
 */

export const TOOLS = {
  // ── orientation ────────────────────────────────────────────────────────
  describe_capabilities: { requires: [], args: {}, session: false },
  list_sessions: { requires: ["settings:view", "dashboard:view"], args: {}, session: false },
  get_system_health: { requires: ["settings:view", "dashboard:view"], args: {}, session: true },

  // ── students ───────────────────────────────────────────────────────────
  search_students: {
    requires: ["students:view"],
    args: { query: "TEST", limit: 5 },
    session: true,
    paging: true,
  },
  get_student: { requires: ["students:view"], args: { query: "TEST-CL7-002" }, session: true },
  query_students: {
    requires: ["students:view"],
    args: { limit: 5 },
    session: true,
    paging: true,
  },
  get_student_financial_history: {
    requires: ["payments:view", "receipts:view", "ledger:view"],
    args: { query: "TEST-CL7-002", limit: 1 },
    session: true,
  },
  get_family: { requires: ["students:view"], args: { query: "TEST-CL1-003" }, session: true },

  // ── money ──────────────────────────────────────────────────────────────
  get_session_money_summary: {
    requires: ["dashboard:view", "finance:view", "reports:view"],
    args: {},
    session: true,
    money: true,
  },
  get_dashboard_analytics: {
    requires: ["dashboard:view", "finance:view"],
    args: {},
    session: true,
    money: true,
  },
  get_class_due_summary: {
    requires: ["dashboard:view", "reports:view", "finance:view"],
    args: {},
    session: true,
    money: true,
  },
  get_installments: {
    requires: ["fees:view", "payments:view", "reports:view"],
    args: { limit: 5 },
    session: true,
    paging: true,
  },
  get_fee_structure: { requires: ["fees:view", "settings:view"], args: {}, session: true },

  // ── AI context ─────────────────────────────────────────────────────────
  get_ai_analysis_context: {
    requires: ["dashboard:view", "reports:view", "finance:view"],
    args: { studentLimit: 5, topOutstandingLimit: 5 },
    session: true,
    money: true,
  },

  // ── transactions ───────────────────────────────────────────────────────
  get_recent_payments: {
    requires: ["payments:view", "receipts:view", "finance:view"],
    args: { days: 30, limit: 5 },
    session: true,
    paging: true,
  },
  search_receipts: {
    requires: ["receipts:view", "payments:view"],
    args: { limit: 5 },
    session: true,
    paging: true,
  },
  get_receipt: {
    requires: ["receipts:view", "payments:view"],
    args: {},
    session: true,
    needsReceiptNumber: true,
  },
  get_collection_report: {
    requires: ["finance:view", "reports:view", "payments:view"],
    args: { groupBy: "day" },
    session: true,
    money: true,
  },

  // ── recovery ───────────────────────────────────────────────────────────
  today_fee_collection_brief: {
    requires: ["defaulters:view", "finance:view", "reports:view"],
    args: { topDefaultersLimit: 3 },
    session: true,
  },
  list_defaulters_for_followup: {
    requires: ["defaulters:view", "finance:view", "reports:view"],
    args: { limit: 5 },
    session: true,
  },
  get_student_due_status: {
    requires: ["students:view", "fees:view"],
    args: { query: "TEST-CL7-002", limit: 3 },
    session: true,
  },
  get_recovery_queue: {
    requires: ["defaulters:view", "finance:view", "reports:view"],
    args: { limit: 5 },
    session: true,
  },
  get_promise_due_list: {
    requires: ["defaulters:view", "finance:view", "reports:view"],
    args: { limit: 5 },
    session: true,
  },
  get_parent_followup_context: {
    requires: ["defaulters:view", "finance:view", "reports:view"],
    args: { query: "TEST-CL7-002", limit: 3 },
    session: true,
  },
  draft_recovery_plan: {
    requires: ["defaulters:view", "finance:view", "reports:view"],
    args: { limit: 5 },
    session: true,
  },
  prepare_followup_messages: {
    requires: ["defaulters:view", "finance:view", "reports:view"],
    args: { limit: 3 },
    session: true,
  },
  daily_recovery_digest: {
    requires: ["defaulters:view", "finance:view", "reports:view"],
    args: { recoveryLimit: 5, promiseLimit: 5, draftLimit: 3 },
    session: true,
  },

  // ── left students ──────────────────────────────────────────────────────
  get_left_student_recovery: {
    requires: ["defaulters:view", "finance:view", "reports:view"],
    args: { limit: 5 },
    session: true,
  },
  get_prev_year_dues: {
    requires: ["fees:view", "finance:view", "reports:view"],
    args: { limit: 5 },
    session: true,
  },

  // ── assets ─────────────────────────────────────────────────────────────
  get_student_photo: {
    requires: ["students:view"],
    args: { admissionNo: "TEST-CL7-002", format: "link" },
    session: false,
  },
  get_defaulter_voice_note: {
    requires: ["defaulters:view"],
    args: { format: "link" },
    session: false,
    expectsSoftError: true,
  },

  // ── documents ──────────────────────────────────────────────────────────
  get_receipt_pdf: {
    requires: ["receipts:print"],
    args: {},
    session: false,
    needsReceiptNumber: true,
  },
};

export const TOOL_NAMES = Object.keys(TOOLS);

/** Tools that accept an opaque `cursor` — five of the thirty-two. */
export const PAGING_TOOLS = TOOL_NAMES.filter((name) => TOOLS[name].paging);

/**
 * Roles, as `workers/schoolfees-mcp/src/permissions.mjs` grants them.
 * Kept beside the tool table so the visible-tool expectation is computable
 * here rather than by asking the Worker what it thinks.
 */
export const ROLE_PERMISSIONS = {
  admin: [
    "dashboard:view", "students:view", "students:write", "students:edit_basic",
    "students:edit_sr_no", "fees:view", "fees:write", "fees:repayment_plan",
    "payments:view", "payments:write", "payments:adjust", "payments:reverse_any",
    "payments:bulk",
    "payments:waive_late_fee", "finance:view", "finance:write", "finance:approve",
    "ledger:view", "receipts:view", "receipts:print", "defaulters:view",
    "contacts:write", "imports:view", "reports:view", "settings:view",
    "settings:write", "staff:manage",
  ],
  accountant: [
    "dashboard:view", "students:view", "fees:view", "payments:view",
    "payments:write", "payments:waive_late_fee", "finance:view", "ledger:view",
    "receipts:view", "receipts:print", "defaulters:view", "imports:view",
    "reports:view", "settings:view",
  ],
  teacher: [
    "dashboard:view", "students:view", "students:edit_basic", "fees:view",
    "payments:view", "finance:view", "ledger:view", "receipts:view",
    "defaulters:view", "imports:view", "reports:view", "settings:view",
  ],
  fee_collector: [
    "dashboard:view", "students:view", "fees:view", "payments:view",
    "finance:view", "ledger:view", "receipts:view", "defaulters:view",
    "contacts:write", "imports:view", "reports:view", "settings:view",
  ],
  view_only: ["dashboard:view", "students:view", "defaulters:view", "receipts:view"],
};

/** `requires` is an OR, not an AND — holding any one of them opens the tool. */
export function expectedToolsFor(role) {
  const held = new Set(ROLE_PERMISSIONS[role] ?? []);
  return TOOL_NAMES.filter((name) => {
    const requires = TOOLS[name].requires;
    return requires.length === 0 || requires.some((permission) => held.has(permission));
  });
}
