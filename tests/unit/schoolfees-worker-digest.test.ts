import { afterEach, describe, expect, it, vi } from "vitest";

type WorkerModule = {
  default: {
    fetch(request: Request, env: Record<string, string>): Promise<Response>;
  };
};

const env = {
  NEXT_PUBLIC_SUPABASE_URL: "https://schoolfees.test",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  SCHOOLFEES_MCP_TOKEN: "test-token",
};

function mcpRequest(payload: unknown) {
  return new Request("https://schoolfees-worker.test/mcp/test-token", {
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

function okJson(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function installSupabaseMock() {
  const financialRow = {
    student_id: "student-1",
    admission_no: "ADM1234",
    student_name: "Test Student",
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
    student_status_label: "Old",
    tuition_fee: 10000,
    transport_fee: 0,
    academic_fee: 500,
    discount_amount: 0,
    late_fee_total: 0,
    late_fee_waiver_amount: 0,
    total_due: 10500,
    total_paid: 2500,
    outstanding_amount: 8000,
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
  };

  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").pop();

    if (table === "v_workbook_student_financials") {
      return okJson([financialRow]);
    }
    if (table === "defaulter_contacts") {
      return okJson([
        {
          student_id: "student-1",
          contacted_at: "2026-06-01T04:30:00.000Z",
          snooze_until: "2026-06-10",
          outcome: "promised_pay",
          channel: "call",
          phone_label: "father",
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
          class_ref: { session_label: "2026-27", status: "active" },
        },
      ]);
    }
    if (table === "receipts") {
      return okJson([]);
    }

    return okJson([]);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("schoolfees Worker MCP tools", () => {
  it("lists recovery and AI context tools as read-only MCP tools", async () => {
    const fetchMock = installSupabaseMock();
    const { default: worker } = await loadWorker();

    const response = await worker.fetch(
      mcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      env,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    const dailyDigestTool = body.result.tools.find(
      (item: { name: string }) => item.name === "daily_recovery_digest",
    );
    const aiContextTool = body.result.tools.find(
      (item: { name: string }) => item.name === "get_ai_analysis_context",
    );

    expect(dailyDigestTool).toBeTruthy();
    expect(dailyDigestTool.annotations.readOnlyHint).toBe(true);
    expect(dailyDigestTool.annotations.destructiveHint).toBe(false);
    expect(aiContextTool).toBeTruthy();
    expect(aiContextTool.annotations.readOnlyHint).toBe(true);
    expect(aiContextTool.annotations.destructiveHint).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a bundled read-only recovery digest with UPI draft metadata", async () => {
    installSupabaseMock();
    const { default: worker } = await loadWorker();

    const response = await worker.fetch(
      mcpRequest({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "daily_recovery_digest",
          arguments: {
            sessionLabel: "2026-27",
            language: "hinglish",
            recoveryLimit: 5,
            promiseLimit: 5,
            draftLimit: 5,
          },
        },
      }),
      env,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    const digest = body.result.structuredContent;

    expect(digest.sessionLabel).toBe("2026-27");
    expect(digest.safety).toMatchObject({
      readOnly: true,
      messagesSent: false,
      paymentsPosted: false,
    });
    expect(digest.collectionSummary.summary.pendingStudentCount).toBe(1);
    expect(digest.recoveryQueue.rows[0]).toMatchObject({
      studentName: "Test Student",
      promiseState: "broken",
    });
    expect(digest.promisesDue.rows[0].studentName).toBe("Test Student");
    expect(digest.followUpDrafts.drafts[0]).toMatchObject({
      studentName: "Test Student",
      paymentReference: "Fee ADM1234",
    });
    expect(digest.followUpDrafts.drafts[0].paymentLink).toContain("upi://pay?");
    expect(digest.followUpDrafts.drafts[0].draftMessage).toContain("UPI payment link:");
  });

  it("returns whole-app AI analysis context matching the AI export coverage", async () => {
    installSupabaseMock();
    const { default: worker } = await loadWorker();

    const response = await worker.fetch(
      mcpRequest({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "get_ai_analysis_context",
          arguments: {
            sessionLabel: "2026-27",
            includeStudentRows: true,
            studentLimit: 5,
            topOutstandingLimit: 5,
            recentPaymentsLimit: 5,
          },
        },
      }),
      env,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    const context = body.result.structuredContent;

    expect(context.safety).toMatchObject({
      readOnly: true,
      messagesSent: false,
      paymentsPosted: false,
      recordsChanged: false,
    });
    expect(context.sourceOfTruth).toMatchObject({
      studentMaster: "Students",
      feePolicy: "Fee Setup",
      paymentPosting: "Payment Desk only",
    });
    expect(context.aiWorkbookExport.sheetCoverage).toEqual(
      expect.arrayContaining([
        "Recovery Follow-Up",
        "Previous Year Dues",
        "Left Student Recovery",
      ]),
    );
    expect(context.summary.studentCount).toBe(1);
    expect(context.topOutstandingRows[0]).toMatchObject({
      studentName: "Test Student",
      outstandingAmount: 8000,
    });
    expect(context.studentRows[0]).toMatchObject({
      admissionNo: "ADM1234",
      studentName: "Test Student",
    });
  });
});
