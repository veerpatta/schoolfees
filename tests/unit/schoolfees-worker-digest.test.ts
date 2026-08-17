import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Behaviour tests for the MCP Worker, driven through its real transport with a
 * mocked Supabase.
 *
 * The fixture is deliberately mixed: an active student who has paid something, a
 * student who LEFT after paying, and a student who left having paid nothing. The
 * old fixture had a single active row, which is precisely why nothing here
 * caught the server reporting the wrong population — and the wrong column for
 * enrollment status — for months.
 */
type WorkerModule = {
  handleServiceMcp(request: Request, env: Record<string, string>): Promise<Response>;
  handleOAuthMcp(
    request: Request,
    env: Record<string, string>,
    props: { userId?: string; role?: string } | null | undefined,
  ): Promise<Response>;
};

const env = {
  NEXT_PUBLIC_SUPABASE_URL: "https://schoolfees.test",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  SCHOOLFEES_MCP_TOKEN: "test-token",
};

function mcpRequest(payload: unknown, path = "/svc/mcp/test-token") {
  return new Request(`https://schoolfees-worker.test${path}`, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

async function loadWorker() {
  const workerPath = new URL("../../workers/schoolfees-mcp/worker.mjs", import.meta.url).href;
  return (await import(workerPath)) as WorkerModule;
}

function okJson(data: unknown, totalCount?: number) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  // PostgREST answers `Prefer: count=exact` with a content-range whose tail is
  // the total. Without it here, a count read returned null and the server had to
  // choose between guessing and refusing — it now refuses, so the mock has to be
  // honest about what the real thing sends.
  if (typeof totalCount === "number") {
    const length = Array.isArray(data) ? data.length : 0;
    headers["content-range"] = `0-${Math.max(0, length - 1)}/${totalCount}`;
  }
  return new Response(JSON.stringify(data), { status: 200, headers });
}

function wantsExactCount(init?: RequestInit) {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  return headers.prefer === "count=exact";
}

function financialRow(overrides: Record<string, unknown>) {
  return {
    student_id: "student-1",
    admission_no: "ADM1234",
    student_name: "Test Student",
    date_of_birth: "2012-01-01",
    father_name: "Test Father",
    mother_name: "Test Mother",
    father_phone: "9000000001",
    mother_phone: "9000000002",
    record_status: "active",
    class_id: "class-1",
    class_name: "10",
    class_label: "Class 10",
    sort_order: 10,
    session_label: "2026-27",
    transport_route_id: null,
    transport_route_name: null,
    transport_route_code: null,
    student_status_code: "existing",
    // The trap: this column is the academic-fee tier, NOT the enrollment status.
    student_status_label: "Old",
    tuition_fee: 10000,
    transport_fee: 14000,
    academic_fee: 500,
    gross_base_before_discount: 24500,
    discount_amount: 0,
    conventional_discount_amount: 0,
    student_discount_amount: 0,
    conventional_discount_labels: null,
    late_fee_total: 0,
    late_fee_waiver_amount: 0,
    total_due: 24500,
    total_paid: 2500,
    total_discount_closeouts: 0,
    outstanding_amount: 22000,
    base_charge_total: 24500,
    base_outstanding_amount: 22000,
    late_fee_outstanding_amount: 0,
    next_due_date: "2026-07-20",
    next_due_amount: 8000,
    next_due_label: "Installment 2",
    last_payment_date: "2026-04-20",
    paid_installment_count: 1,
    partly_paid_installment_count: 0,
    overdue_installment_count: 1,
    inst1_pending: 0,
    inst2_pending: 8000,
    inst3_pending: 0,
    inst4_pending: 0,
    status_label: "Pending",
    duplicate_sr_flag: false,
    missing_dob_flag: false,
    ...overrides,
  };
}

/** On the roll, part paid. Counted by both headcount and money. */
const ACTIVE_PAYER = financialRow({});

/**
 * Left the school AFTER paying part of the year, so their remaining
 * installments were retained and are still collectable. Counted by money, NOT by
 * headcount. This is the row the old server dropped.
 */
const LEFT_BUT_OWING = financialRow({
  student_id: "student-2",
  admission_no: "ADM2222",
  student_name: "Left Owing",
  record_status: "left",
  total_paid: 7375,
  outstanding_amount: 2000,
  base_outstanding_amount: 2000,
  base_charge_total: 9375,
  total_due: 9375,
  overdue_installment_count: 1,
  inst2_pending: 2000,
});

/**
 * Left having paid nothing, so withdrawing cancelled their unpaid installments
 * and they carry zero. Counted by neither, and correctly invisible in money.
 */
const LEFT_NEVER_PAID = financialRow({
  student_id: "student-3",
  admission_no: "ADM3333",
  student_name: "Left Never Paid",
  record_status: "left",
  total_paid: 0,
  outstanding_amount: 0,
  base_outstanding_amount: 0,
  base_charge_total: 0,
  total_due: 0,
  overdue_installment_count: 0,
  inst1_pending: 0,
  inst2_pending: 0,
});

const ALL_ROWS = [ACTIVE_PAYER, LEFT_BUT_OWING, LEFT_NEVER_PAID];

/**
 * Applies the PostgREST filters the server actually sends, so a test can assert
 * on which population a tool asked for rather than trusting it.
 */
function applyScopeFilters(rows: Array<Record<string, unknown>>, url: URL) {
  let result = rows;

  const recordStatus = url.searchParams.get("record_status");
  if (recordStatus === "eq.active") {
    result = result.filter((row) => row.record_status === "active");
  }
  if (recordStatus === "neq.active") {
    result = result.filter((row) => row.record_status !== "active");
  }

  const or = url.searchParams.get("or");
  if (or === "(record_status.eq.active,total_paid.gt.0)") {
    result = result.filter((row) => row.record_status === "active" || Number(row.total_paid) > 0);
  }

  const outstanding = url.searchParams.get("outstanding_amount");
  if (outstanding === "gt.0") {
    result = result.filter((row) => Number(row.outstanding_amount) > 0);
  }

  const studentId = url.searchParams.get("student_id");
  if (studentId?.startsWith("eq.")) {
    result = result.filter((row) => row.student_id === studentId.slice(3));
  }

  const offset = Number(url.searchParams.get("offset") || 0);
  const limit = Number(url.searchParams.get("limit") || result.length);
  return result.slice(offset, offset + limit);
}

function directoryRow(row: Record<string, unknown>) {
  return {
    student_id: row.student_id,
    admission_no: row.admission_no,
    full_name: row.student_name,
    date_of_birth: row.date_of_birth,
    father_name: row.father_name,
    mother_name: row.mother_name,
    primary_phone: row.father_phone,
    secondary_phone: row.mother_phone,
    record_status: row.record_status,
    class_id: row.class_id,
    class_label: row.class_label,
    class_sort_order: row.sort_order,
    session_label: row.session_label,
    transport_route_id: null,
    transport_route_name: null,
    transport_route_code: null,
    transport_fee: row.transport_fee,
    status_label: row.status_label,
    student_status_label: row.student_status_label,
    outstanding_amount: row.outstanding_amount,
    base_outstanding_amount: row.base_outstanding_amount,
    late_fee_outstanding_amount: row.late_fee_outstanding_amount,
    old_balance_amount: 0,
    overdue_base_amount: row.outstanding_amount,
    pending_late_fee_amount: 0,
    total_paid: row.total_paid,
    base_charge_total: row.base_charge_total,
    discount_amount: 0,
    conventional_discount_labels: null,
    last_payment_date: row.last_payment_date,
    repayment_plan_id: null,
    seg_active: row.record_status === "active",
    seg_left: row.record_status === "left",
    seg_has_dues: Number(row.outstanding_amount) > 0,
  };
}

function installSupabaseMock(options?: {
  repaymentPlan?: Record<string, unknown> | null;
  contacts?: unknown[];
  rows?: Array<Record<string, unknown>>;
}) {
  const repaymentPlan = options?.repaymentPlan ?? null;
  const rows = options?.rows ?? ALL_ROWS;

  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").pop();

    if (table === "v_workbook_student_financials") {
      const page = applyScopeFilters(rows, url);
      // The count covers the whole matching set, not the page.
      const total = applyScopeFilters(rows, new URL(url.origin + url.pathname + "?" +
        [...url.searchParams].filter(([k]) => k !== "limit" && k !== "offset")
          .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&"))).length;
      return okJson(page, wantsExactCount(init) ? total : undefined);
    }
    if (table === "v_student_directory") {
      const query = url.searchParams.get("search_text") || "";
      const needle = query.replace(/^ilike\.\*/, "").replace(/\*$/, "");
      const matched = applyScopeFilters(rows, url).filter((row) =>
        needle
          ? `${row.student_name} ${row.admission_no}`.toLowerCase().includes(needle)
          : true,
      );
      return okJson(matched.map(directoryRow));
    }
    if (table === "workbook_materialized_view_refresh_queue") {
      return okJson([
        {
          queue_key: "workbook",
          pending: false,
          requested_at: "2026-08-14T09:00:00.000Z",
          last_refreshed_at: "2026-08-14T09:02:00.000Z",
        },
      ]);
    }
    if (table === "defaulter_contacts") {
      return okJson(
        options?.contacts ?? [
          {
            student_id: "student-1",
            contacted_at: "2026-06-01T04:30:00.000Z",
            snooze_until: "2026-06-10",
            outcome: "promised_pay",
            channel: "call",
            phone_label: "father",
          },
        ],
      );
    }
    if (table === "v_student_repayment_plan_status") {
      return okJson(repaymentPlan ? [repaymentPlan] : []);
    }
    if (table === "student_repayment_plan_items") {
      return okJson(
        repaymentPlan
          ? [{ plan_id: "plan-1", student_id: "student-1", installment_id: "installment-1" }]
          : [],
      );
    }
    if (table === "get_dashboard_analytics") {
      return okJson({
        sessionLabel: "2026-27",
        debtAge: [],
        lateFee: {
          charged: 0,
          waived: 0,
          pending: 0,
          studentsWithPending: 0,
          byWaiverSource: [],
          nextAccrual: { dueDate: null, amount: 0, installments: 0 },
        },
        monthlyCollection: [],
        classRecovery: [],
        routeRecovery: [],
        concentration: {
          studentsWithDues: 2,
          totalPending: 24000,
          top10Amount: 24000,
          top10Pct: 100,
          top50Amount: 24000,
          top50Pct: 100,
        },
      });
    }
    if (table === "get_dashboard_summary") {
      return okJson({ totalStudents: 1, students_with_pending: 2 });
    }
    if (table === "get_dashboard_fee_split") {
      return okJson([
        {
          current_year_expected: 33875,
          current_year_collected: 9875,
          current_year_pending: 24000,
          previous_year_original: 0,
          previous_year_collected: 0,
          previous_year_pending: 0,
          late_fee_pending: 0,
        },
      ]);
    }
    if (table === "student_collection_flags") {
      return okJson([]);
    }
    if (table === "students") {
      return okJson([
        {
          id: "student-1",
          admission_no: "ADM1234",
          full_name: "Test Student",
          status: "active",
          father_name: "Test Father",
          primary_phone: "9000000001",
          joined_on: "2026-04-01",
          left_on: null,
        },
      ]);
    }
    if (table === "receipts") {
      return okJson([
        {
          id: "receipt-1",
          receipt_number: "SVP-0001",
          payment_date: "2026-04-20",
          created_at: "2026-04-20T04:30:00.000Z",
          payment_mode: "upi",
          total_amount: 2500,
          reference_number: "UTR-1",
          notes: null,
          received_by: "Accounts",
          student_id: "student-1",
        },
      ]);
    }
    if (table === "payments") {
      return okJson([
        {
          id: "payment-1",
          receipt_id: "receipt-1",
          student_id: "student-1",
          installment_id: "installment-1",
          amount: 2500,
          notes: null,
          created_at: "2026-04-20T04:30:00.000Z",
          discount_applied_at_posting: 0,
          waiver_applied_at_posting: 0,
          pending_before_posting: 5000,
          pending_after_posting: 2500,
        },
      ]);
    }
    if (
      table === "payment_adjustments" ||
      table === "refund_requests" ||
      table === "v_receipt_reversal_totals" ||
      table === "student_family_members"
    ) {
      return okJson([]);
    }
    if (table === "v_workbook_installment_balances") {
      return okJson(
        applyScopeFilters(
          [
            {
              installment_id: "installment-1",
              student_id: "student-1",
              admission_no: "ADM1234",
              student_name: "Test Student",
              session_label: "2026-27",
              class_id: "class-1",
              class_label: "Class 10",
              installment_no: 1,
              installment_label: "Installment 1",
              is_carry_forward: false,
              source_session_label: null,
              is_emi_late_fee: false,
              due_date: "2026-04-20",
              base_charge: 5000,
              paid_amount: 2500,
              applied_amount: 2500,
              discount_closeout_amount: 0,
              adjustment_amount: 0,
              raw_late_fee: 0,
              waiver_applied: 0,
              final_late_fee: 0,
              total_charge: 5000,
              pending_amount: 2500,
              late_fee_pending: 0,
              total_pending: 2500,
              balance_status: "overdue",
              late_fee_status: "none",
              last_payment_date: "2026-04-20",
              record_status: "active",
              total_paid: 2500,
            },
          ],
          url,
        ),
      );
    }

    return okJson([]);
  });
}

async function callTool(name: string, args: Record<string, unknown>, id = 1) {
  const { handleServiceMcp } = await loadWorker();
  const response = await handleServiceMcp(
    mcpRequest({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }),
    env,
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  if (body.result?.isError) {
    throw new Error(`Tool ${name} errored: ${JSON.stringify(body.result.content)}`);
  }
  return body.result.structuredContent;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("schoolfees Worker MCP tools", () => {
  it("lists every tool as read-only, keeping the names existing clients call", async () => {
    // Load the Worker before spying on fetch. With the spy installed first it
    // also observes module resolution, so the assertion below would quietly
    // claim that loading worker.mjs performs no fetch — a second claim this
    // test never meant to make, and one that varies with module-cache state.
    const { handleServiceMcp } = await loadWorker();
    const fetchMock = installSupabaseMock();

    const response = await handleServiceMcp(
      mcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      env,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    const names: string[] = body.result.tools.map((item: { name: string }) => item.name);

    // The school's morning automation and connected assistants call these by
    // name. Renaming one silently breaks them.
    for (const name of [
      "today_fee_collection_brief",
      "list_defaulters_for_followup",
      "get_student_due_status",
      "get_student_financial_history",
      "get_class_due_summary",
      "get_dashboard_analytics",
      "get_ai_analysis_context",
      "get_recent_payments",
      "prepare_followup_messages",
      "get_recovery_queue",
      "get_promise_due_list",
      "get_parent_followup_context",
      "draft_recovery_plan",
      "daily_recovery_digest",
    ]) {
      expect(names).toContain(name);
    }

    for (const tool of body.result.tools) {
      expect(tool.annotations.readOnlyHint).toBe(true);
      expect(tool.annotations.destructiveHint).toBe(false);
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports enrollment status from the enrollment column, not the fee tier", async () => {
    installSupabaseMock();

    const result = await callTool("get_student_due_status", {
      sessionLabel: "2026-27",
      query: "ADM1234",
    });
    const student = result.students[0];

    // The original bug, pinned: `student_status_label` is 'New'/'Old' and only
    // decides which academic fee applies. It was being published as the
    // student's status, so "has this child left?" was answered with a fee tier.
    expect(student.enrollment).toMatchObject({ status: "active", onRoll: true, label: "On roll" });
    expect(student.feeTier).toBe("Old");
    expect(student).not.toHaveProperty("studentStatus");
  });

  it("keeps a student who left owing money in the recovery queue", async () => {
    installSupabaseMock({ contacts: [] });

    const queue = await callTool("get_recovery_queue", { sessionLabel: "2026-27", limit: 10 });
    const names = queue.rows.map((row: { studentName: string }) => row.studentName);

    // Active-only scoping hid three families and Rs 17,250 of collectable money
    // in the live session. A leaver who paid something still owes the rest.
    expect(names).toContain("Left Owing");
    expect(queue.scope.name).toBe("collectable");
    expect(queue.rows.find((row: { studentName: string }) => row.studentName === "Left Owing"))
      .toMatchObject({ enrollment: { status: "left", onRoll: false } });

    // ...and a leaver who never paid carries nothing, so is correctly absent.
    expect(names).not.toContain("Left Never Paid");
  });

  it("counts headcount and money under different rules, and says so", async () => {
    installSupabaseMock();

    const summary = await callTool("get_session_money_summary", { sessionLabel: "2026-27" });

    expect(summary.headcount.scope.name).toBe("on_roll");
    expect(summary.headcount.studentsOnRoll).toBe(1);

    expect(summary.money.scope.name).toBe("collectable");
    // Active payer + the leaver who paid. The leaver who never paid is excluded
    // by the rule itself, not by an arbitrary filter.
    expect(summary.money.studentCount).toBe(2);
    expect(summary.money.totalFeesPending).toBe(24000);
    expect(summary.money.notOnRollCount).toBe(1);

    expect(summary.reconciliation.blocks).toHaveLength(2);
    expect(summary.reconciliation.blocks[1].differenceExplained).toContain("1 student(s)");
  });

  it("keeps every money block in the AI context under one scope", async () => {
    installSupabaseMock();

    const context = await callTool("get_ai_analysis_context", {
      sessionLabel: "2026-27",
      includeStudentRows: true,
      studentLimit: 5,
    });

    // The old version mixed two populations in one payload and let them disagree
    // by lakhs without comment.
    for (const block of [
      context.summary,
      context.classSummaries,
      context.routeSummaries,
      context.enrollmentSummaries,
    ]) {
      expect(block.scope.name).toBe("collectable");
    }
    expect(context.headcount.scope.name).toBe("on_roll");

    const classTotal = context.classSummaries.groups.reduce(
      (sum: number, group: { totalFeesPending: number }) => sum + group.totalFeesPending,
      0,
    );
    expect(classTotal).toBe(context.summary.totalFeesPending);

    expect(context.reconciliation.blocks.at(-1)).toMatchObject({
      block: "dashboardAnalytics",
      agreesWithMoneyBlocks: true,
    });
    // The list the model is told to expect must match the workbook the export
    // actually builds. `_HEALTH` carries per-sheet read status, so a sheet with
    // no rows can be told apart from a sheet that could not be read.
    expect(context.fullDataExport.sheets).toHaveLength(23);
    expect(context.fullDataExport.sheets).toContain("_HEALTH");
    expect(context.studentRows[0]).toMatchObject({
      admissionNo: "ADM1234",
      routeLabel: "Custom transport (₹14,000 annual)",
      moneySegment: "partly_paid",
    });
  });

  it("stamps money answers with how fresh the underlying views are", async () => {
    installSupabaseMock();

    const brief = await callTool("today_fee_collection_brief", { sessionLabel: "2026-27" });

    expect(brief.provenance.dataFreshness).toMatchObject({
      known: true,
      refreshPending: false,
      lastRefreshedAt: "2026-08-14T09:02:00.000Z",
    });
    expect(brief.provenance.readOnly).toBe(true);
  });

  it("returns exact receipt totals and allocation history without writing", async () => {
    installSupabaseMock();

    const history = await callTool("get_student_financial_history", {
      sessionLabel: "2026-27",
      query: "ADM1234",
      limit: 1,
      receiptLimit: 10,
    });

    expect(history.safety).toMatchObject({
      readOnly: true,
      paymentsPosted: false,
      recordsChanged: false,
    });

    const receipt = history.students[0].receipts[0];
    expect(receipt).toMatchObject({
      receiptNumber: "SVP-0001",
      receiptTotalAmount: 2500,
      cashCollectedAmount: 2500,
      isWriteOff: false,
      isFullyReversed: false,
    });
    expect(receipt.allocations[0]).toMatchObject({
      installmentLabel: "Installment 1",
      amount: 2500,
      pendingBeforePosting: 5000,
      pendingAfterPosting: 2500,
    });
  });

  it("does not chase an on-track EMI family for the full underlying balance", async () => {
    installSupabaseMock({
      contacts: [],
      rows: [ACTIVE_PAYER],
      repaymentPlan: {
        plan_id: "plan-1",
        student_id: "student-1",
        session_label: "2026-27",
        scope: "old_and_current",
        lifecycle: "active",
        opening_balance: 22000,
        monthly_amount: 5000,
        first_due_date: "2026-09-20",
        term_months: 5,
        final_installment_amount: 2000,
        waived_late_fee_total: 0,
        reason: "Test plan",
        activated_at: "2026-08-14T00:00:00.000Z",
        item_count: 1,
        remaining_balance: 22000,
        paid_to_date: 0,
        expected_to_date: 0,
        expected_overdue: 0,
        catch_up_amount: 0,
        missed_installment_count: 0,
        paid_installment_count: 0,
        next_due_sequence_no: 1,
        next_due_date: "2026-09-20",
        next_due_amount: 5000,
        end_date: "2027-01-20",
        payment_status: "upcoming",
        plan_review_needed: false,
      },
    });

    const queue = await callTool("get_recovery_queue", { sessionLabel: "2026-27", limit: 10 });
    expect(queue.rows).toEqual([]);

    const drafts = await callTool("prepare_followup_messages", {
      sessionLabel: "2026-27",
      limit: 10,
    });
    expect(drafts.drafts).toEqual([]);
  });

  it("drafts follow-up messages with a UPI link and never claims to have sent one", async () => {
    installSupabaseMock({ contacts: [] });

    const drafts = await callTool("prepare_followup_messages", {
      sessionLabel: "2026-27",
      limit: 5,
    });

    expect(drafts.safety).toMatchObject({ messagesSent: false, paymentsPosted: false });
    const draft = drafts.drafts[0];
    expect(draft.upi.displayReference).toBe("Fee ADM1234");
    expect(draft.upi.uri).toContain("upi://pay?");
    expect(draft.draftMessage).toContain("UPI payment link:");
  });

  it("surfaces the left-student recovery list the defaulter queue does not cover", async () => {
    installSupabaseMock();

    const result = await callTool("get_left_student_recovery", { sessionLabel: "2026-27" });

    expect(result.scope.name).toBe("left_owing");
    expect(result.students).toHaveLength(1);
    expect(result.students[0]).toMatchObject({
      admissionNo: "ADM2222",
      enrollment: { status: "left", onRoll: false },
      feesPendingAmount: 2000,
    });
    expect(result.totals.alreadyPaid).toBe(7375);
  });
});

describe("schoolfees Worker auth lanes", () => {
  const listRequest = (path?: string) =>
    mcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }, path);

  it("refuses tools/list on the service lane without a token", async () => {
    const { handleServiceMcp } = await loadWorker();
    const fetchMock = installSupabaseMock();

    const response = await handleServiceMcp(listRequest("/svc/mcp"), env);

    expect(response.status).toBe(401);
    // The old server answered initialize/ping/tools/list unauthenticated, so a
    // misconfigured client connected happily and only failed on real data.
    expect((await response.json()).error.message).toBe("Unauthorized");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts the service lane via an Authorization bearer header", async () => {
    installSupabaseMock();
    const { handleServiceMcp } = await loadWorker();

    const request = new Request("https://schoolfees-worker.test/svc/mcp", {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        authorization: "Bearer test-token",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });

    const response = await handleServiceMcp(request, env);

    expect(response.status).toBe(200);
    expect((await response.json()).result.tools.length).toBeGreaterThan(0);
  });

  it("fails closed when no service token is configured", async () => {
    const { handleServiceMcp } = await loadWorker();
    const fetchMock = installSupabaseMock();
    const envWithoutToken = {
      NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
    };

    // A missing secret must deny everything. Defaulting to "open" would expose a
    // service-role Supabase connection to anyone holding the URL.
    const response = await handleServiceMcp(listRequest("/svc/mcp"), envWithoutToken);

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses the OAuth lane when no signed-in staff member travels with the request", async () => {
    const { handleOAuthMcp } = await loadWorker();
    const fetchMock = installSupabaseMock();

    for (const props of [null, undefined, {} as { userId?: string }]) {
      const response = await handleOAuthMcp(listRequest("/mcp"), env, props);
      expect(response.status).toBe(401);
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("narrows the tool list to what the signed-in staff member's role allows", async () => {
    installSupabaseMock();
    const { handleOAuthMcp } = await loadWorker();

    const toolsFor = async (role: string) => {
      const response = await handleOAuthMcp(listRequest("/mcp"), env, { userId: "staff-1", role });
      expect(response.status).toBe(200);
      const body = await response.json();
      return body.result.tools.map((tool: { name: string }) => tool.name) as string[];
    };

    const adminTools = await toolsFor("admin");
    const viewerTools = await toolsFor("view_only");

    expect(adminTools.length).toBeGreaterThan(viewerTools.length);
    // A viewer has no fees:view, so the fee-policy tools are not offered to them
    // at all rather than failing when called.
    expect(adminTools).toContain("get_fee_structure");
    expect(viewerTools).not.toContain("get_fee_structure");
    expect(viewerTools).toContain("search_students");
  });
});
