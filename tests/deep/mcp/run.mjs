#!/usr/bin/env node
/**
 * MCP conformance: every tool, every lane, both sessions.
 *
 * Read-only end to end, which is why it is safe to point the oracle at the live
 * `2026-27` session — and why doing so is the single most valuable check here.
 * Nothing in this file can post, edit or send.
 *
 * Case groups, in the order they run. Transport and auth first on purpose: a
 * broken lane should fail in five seconds, not four minutes into the happy path.
 *
 *   00-transport   /health, initialize, ping, malformed JSON-RPC
 *   01-tools-list  the visible tool set per role vs the permission matrix
 *   06-negatives   bad scopes, sessions, limits, cursors, and the auth refusals
 *   02-happy-path  32 tools x 2 sessions on an admin lane
 *   03-scope       reconciliation, and the hand-maintained rowInScope twin
 *   04-cursors     round-trips: no duplicates, no gaps
 *   05-oracle      every figure recomputed from Postgres
 *   07-bridges     receipt PDF, photo, voice note
 *
 *   node tests/deep/mcp/run.mjs
 *   node tests/deep/mcp/run.mjs --session TEST-2026-27 --url http://127.0.0.1:8787
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { RULES } from "../lib/rules.mjs";
import {
  DEFAULT_MCP_URL,
  health,
  mintOAuthToken,
  oauthLane,
  serviceLane,
  sharedQaPassword,
  SERVICE_TOKEN,
} from "./lanes.mjs";
import { compare, oracleAvailable, oracleFor } from "./oracle.mjs";
import { expectedToolsFor, PAGING_TOOLS, ROLE_PERMISSIONS, TOOL_NAMES, TOOLS } from "./registry.mjs";
import { RpcError } from "./rpc.mjs";

/* ------------------------------------------------------------------ env */

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const at = trimmed.indexOf("=");
    const key = trimmed.slice(0, at).trim();
    if (!key || process.env[key]) continue;
    process.env[key] = trimmed.slice(at + 1).trim().replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const MCP_URL = (arg("url", DEFAULT_MCP_URL)).replace(/\/$/, "");
const LIVE_SESSION = "2026-27";
const TEST_SESSION = arg("session", process.env.SCHOOLFEES_SMOKE_SESSION ?? "TEST-2026-27");
const SESSIONS = [LIVE_SESSION, TEST_SESSION];

const QA_ROLES = [
  { key: "admin", email: "qa.admin@qa.vpps.local", role: "admin", mcpAllowed: true },
  { key: "accountant", email: "qa.accountant@qa.vpps.local", role: "accountant", mcpAllowed: true },
  { key: "teacher", email: "qa.teacher@qa.vpps.local", role: "teacher", mcpAllowed: false },
  { key: "collector", email: "qa.collector@qa.vpps.local", role: "fee_collector", mcpAllowed: true },
  { key: "viewonly", email: "qa.viewonly@qa.vpps.local", role: "view_only", mcpAllowed: false },
];

/* -------------------------------------------------------------- findings */

const runId = process.env.DEEP_RUN_ID ?? null;
const runDir = runId ? path.resolve(process.cwd(), "docs/smoke-reports/deep", runId) : null;
if (runDir) mkdirSync(runDir, { recursive: true });

const findings = [];

function fingerprintOf(actual) {
  return String(actual)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, "<timestamp>")
    .replace(/₹\s?[\d,]+/g, "<money>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

function record({ rule, surface, title, expected, actual, session, role = "service" }) {
  const policy = RULES[rule];
  if (!policy) throw new Error(`Unknown rule ${rule}`);

  const fingerprint = fingerprintOf(actual);
  const id = createHash("sha1").update(`${rule}|${surface}|${fingerprint}`).digest("hex").slice(0, 12);

  if (findings.some((finding) => finding.id === id)) return;

  const finding = {
    id,
    rule,
    severity: policy.severity,
    confidence: policy.confidence,
    target: "mcp",
    surface,
    role,
    device: null,
    session: session ?? "-",
    title,
    expected,
    actual: String(actual).slice(0, 2000),
    fingerprint,
    evidence: {
      reproCommand: `node tests/deep/mcp/run.mjs --session ${session ?? TEST_SESSION}`,
    },
    seenCount: 1,
    firstSeenAt: new Date().toISOString(),
  };

  findings.push(finding);
  if (runDir) {
    appendFileSync(path.join(runDir, "findings.jsonl"), `${JSON.stringify(finding)}\n`, "utf8");
  }
  console.log(`  [${finding.severity}] ${title}`);
}

const summary = {
  workerVersion: null,
  lanes: [],
  toolMatrix: {},
  roleVisibility: {},
  oracle: [],
  cursors: [],
  notes: [],
};

/* ------------------------------------------------------------ 00 transport */

async function caseTransport(client) {
  console.log("\n00-transport");
  const { status, body } = await health(MCP_URL);
  summary.workerVersion = body?.version ?? null;

  if (status !== 200 || !body?.ok) {
    record({
      rule: "mcp.transport-error",
      surface: "/health",
      title: `Worker /health answered ${status}`,
      expected: "/health is public and answers 200 with ok:true.",
      actual: JSON.stringify(body).slice(0, 300),
    });
    return;
  }

  if (body.readOnly !== true) {
    record({
      rule: "mcp.transport-error",
      surface: "/health",
      title: "Worker no longer reports itself read-only",
      expected: "The MCP server is read-only; nothing it exposes can write.",
      actual: JSON.stringify(body).slice(0, 300),
    });
  }

  if (!body.config?.documentBridge?.configured) {
    summary.notes.push(
      "Document bridge is not configured on the Worker; get_receipt_pdf will fail by design.",
    );
  }

  if (!client) return;

  await client.initialize();

  // A malformed body must be a protocol error, never a 500 and never a hang.
  const malformed = await fetch(client.url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(SERVICE_TOKEN ? { authorization: `Bearer ${SERVICE_TOKEN}` } : {}) },
    body: "{ not json",
  });
  if (malformed.status >= 500) {
    record({
      rule: "mcp.transport-error",
      surface: client.url,
      title: `Malformed JSON body produced HTTP ${malformed.status}`,
      expected: "A body that is not JSON is a 400-class protocol error.",
      actual: (await malformed.text()).slice(0, 300),
    });
  }
}

/* ------------------------------------------------------- 01 tools/list */

async function caseToolsList(lanes) {
  console.log("\n01-tools-list");

  for (const lane of lanes) {
    let tools;
    try {
      tools = await lane.client.listTools();
    } catch (error) {
      record({
        rule: "mcp.transport-error",
        surface: `${lane.label}:tools/list`,
        title: `tools/list failed for ${lane.label}`,
        expected: "Every authenticated lane can list its tools.",
        actual: error.message,
        role: lane.role ?? "service",
      });
      continue;
    }

    const visible = new Set(tools.map((tool) => tool.name));
    summary.roleVisibility[lane.label] = { count: visible.size, denied: false };

    // Everything the Worker has that this harness does not know about. Reported
    // as drift rather than skipped, so a new tool cannot arrive uncovered.
    const unknown = [...visible].filter((name) => !TOOL_NAMES.includes(name));
    if (unknown.length > 0) {
      record({
        rule: "doc.drift",
        surface: `${lane.label}:tools/list`,
        title: `${unknown.length} tool(s) the harness has no fixture for`,
        expected: "tests/deep/mcp/registry.mjs lists every tool the Worker exposes.",
        actual: unknown.join(", "),
        role: lane.role ?? "service",
      });
    }

    if (!lane.role) continue;

    const expected = new Set(expectedToolsFor(lane.role));

    // The gate this whole lane exists to test: a tool a caller cannot use must
    // not be in their tools/list, because an assistant should never propose a
    // call that will be refused.
    for (const name of visible) {
      if (!TOOL_NAMES.includes(name)) continue;
      if (expected.has(name)) continue;
      record({
        rule: "mcp.tool-visible-without-permission",
        surface: `${lane.label}:${name}`,
        title: `${lane.role} can see "${name}" without holding its permission`,
        expected: `${name} requires any of: ${TOOLS[name].requires.join(", ") || "(none)"}. ` +
          `${lane.role} holds: ${ROLE_PERMISSIONS[lane.role].join(", ")}`,
        actual: "The tool is present in tools/list.",
        role: lane.role,
      });
    }

    for (const name of expected) {
      if (visible.has(name)) continue;
      record({
        rule: "mcp.tool-missing-for-role",
        surface: `${lane.label}:${name}`,
        title: `${lane.role} cannot see "${name}" but holds its permission`,
        expected: `${name} requires any of: ${TOOLS[name].requires.join(", ")}.`,
        actual: "The tool is absent from tools/list.",
        role: lane.role,
      });
    }
  }
}

/* ------------------------------------------------------ 02 happy path */

async function caseHappyPath(client, receiptNumber) {
  console.log("\n02-happy-path");

  for (const session of SESSIONS) {
    const key = session === LIVE_SESSION ? "live" : "test";

    for (const name of TOOL_NAMES) {
      const spec = TOOLS[name];
      const callArgs = { ...spec.args };
      if (spec.session) callArgs.sessionLabel = session;
      if (spec.needsReceiptNumber) {
        if (!receiptNumber) {
          summary.toolMatrix[name] = { ...(summary.toolMatrix[name] ?? {}), [key]: "n/a" };
          continue;
        }
        callArgs.receiptNumber = receiptNumber;
      }

      try {
        const result = await client.callTool(name, callArgs);
        const structured = result.structuredContent;
        const text = result.content?.[0]?.text ?? "";

        summary.toolMatrix[name] = { ...(summary.toolMatrix[name] ?? {}), [key]: "ok" };

        if (!structured && !spec.expectsSoftError) {
          record({
            rule: "mcp.tool-error",
            surface: `${name}@${session}`,
            title: `${name} returned no structuredContent`,
            expected: "Every tool answers with structuredContent an assistant can read.",
            actual: JSON.stringify(result).slice(0, 300),
            session,
          });
        }

        if (!text && !spec.expectsSoftError) {
          record({
            rule: "mcp.tool-error",
            surface: `${name}@${session}`,
            title: `${name} returned no quotable summary`,
            expected: "content[0].text carries a summary a model can quote.",
            actual: JSON.stringify(result.content ?? null).slice(0, 200),
            session,
          });
        }

        // Money answers must say how fresh they are: the materialised views are
        // rebuilt off the payment path plus a two-minute cron, so a read right
        // after a posting can legitimately predate it — and must say so.
        if (spec.money && structured && !structured.provenance) {
          record({
            rule: "mcp.tool-error",
            surface: `${name}@${session}`,
            title: `${name} answered with money and no provenance`,
            expected: "Every money payload carries provenance.dataFreshness.",
            actual: `structuredContent keys: ${Object.keys(structured).join(", ")}`,
            session,
          });
        }
      } catch (error) {
        summary.toolMatrix[name] = { ...(summary.toolMatrix[name] ?? {}), [key]: "FAIL" };
        record({
          rule: error instanceof RpcError && error.kind === "transport"
            ? "mcp.transport-error"
            : "mcp.tool-error",
          surface: `${name}@${session}`,
          title: `${name} failed on ${session}`,
          expected: "A tool called with its documented minimal arguments answers.",
          actual: `${error.message} ${error.detail ?? ""}`.slice(0, 500),
          session,
        });
      }
    }
  }

  // The filter surface nothing has tested: groupBy, amountField and sort on
  // query_students, and the studentQuery x scope pairing on search_receipts.
  const shapes = [
    { groupBy: "class" },
    { groupBy: "route" },
    { groupBy: "enrollmentStatus" },
    { groupBy: "moneySegment" },
    { sort: "feesPendingDesc" },
    { sort: "totalPaidDesc" },
    { sort: "lastPaymentDesc" },
    { amountField: "lateFeePending", minAmount: 1 },
    { segments: ["overdue"] },
    { segments: ["lateFeePending", "onEmi"] },
    { scope: "everyone" },
    { scope: "left_owing" },
  ];

  for (const shape of shapes) {
    try {
      await client.callTool("query_students", {
        sessionLabel: TEST_SESSION,
        limit: 5,
        ...shape,
      });
    } catch (error) {
      record({
        rule: "mcp.tool-error",
        surface: `query_students ${JSON.stringify(shape)}`,
        title: `query_students failed for ${JSON.stringify(shape)}`,
        expected: "Every declared filter, grouping and sort is callable.",
        actual: error.message,
        session: TEST_SESSION,
      });
    }
  }
}

/* ----------------------------------------------------------- 03 scope */

async function caseScope(client) {
  console.log("\n03-scope");

  const counts = {};
  for (const scope of ["on_roll", "collectable", "left_owing", "everyone"]) {
    try {
      const result = await client.callTool("query_students", {
        sessionLabel: TEST_SESSION,
        scope,
        limit: 1,
        includeRows: false,
      });
      counts[scope] = result.structuredContent?.pageInfo?.totalCount ?? null;
    } catch (error) {
      record({
        rule: "mcp.tool-error",
        surface: `query_students scope=${scope}`,
        title: `Scope "${scope}" could not be counted`,
        expected: "All four named scopes are callable and report a total.",
        actual: error.message,
        session: TEST_SESSION,
      });
    }
  }

  summary.notes.push(`scope counts on ${TEST_SESSION}: ${JSON.stringify(counts)}`);

  // on_roll and left_owing partition by definition: one is active, the other is
  // explicitly not active.
  if (counts.everyone != null && counts.collectable != null && counts.everyone < counts.collectable) {
    record({
      rule: "mcp.scope-drift",
      surface: "scope:everyone vs collectable",
      title: "everyone counted fewer students than collectable",
      expected: "everyone is unfiltered, so it is a superset of every other scope.",
      actual: `everyone=${counts.everyone}, collectable=${counts.collectable}`,
      session: TEST_SESSION,
    });
  }

  // `rowInScope()` is a hand-maintained client-side twin of the PostgREST
  // predicates. Fetch the same population through the DB-filtered path
  // (search_students) and the client-sliced path (query_students) and assert
  // the two agree — that duplication is the natural place for drift.
  try {
    const dbSide = await client.callTool("search_students", {
      sessionLabel: TEST_SESSION,
      query: "TEST",
      scope: "collectable",
      limit: 50,
    });
    const clientSide = await client.callTool("query_students", {
      sessionLabel: TEST_SESSION,
      query: "TEST",
      scope: "collectable",
      limit: 50,
    });

    const idsOf = (payload) =>
      new Set((payload.structuredContent?.students ?? []).map((student) => student.studentId ?? student.id));

    const a = idsOf(dbSide);
    const b = idsOf(clientSide);
    const onlyDb = [...a].filter((id) => !b.has(id));
    const onlyClient = [...b].filter((id) => !a.has(id));

    if (onlyDb.length > 0 || onlyClient.length > 0) {
      record({
        rule: "mcp.scope-drift",
        surface: "scope:rowInScope vs scopeParams",
        title: "The DB-filtered and client-sliced scope paths disagree",
        expected:
          "rowInScope() is a hand-maintained twin of the PostgREST predicates; " +
          "the same scope must select the same students either way.",
        actual: `only in search_students: ${onlyDb.length}; only in query_students: ${onlyClient.length}`,
        session: TEST_SESSION,
      });
    }
  } catch (error) {
    summary.notes.push(`scope drift check skipped: ${error.message}`);
  }
}

/* --------------------------------------------------------- 04 cursors */

async function caseCursors(client) {
  console.log("\n04-cursors");

  for (const tool of PAGING_TOOLS) {
    const spec = TOOLS[tool];
    const base = { ...spec.args, sessionLabel: TEST_SESSION };
    // A prime page size, so the last page is partial rather than exactly full.
    const limit = 7;

    try {
      const single = await client.callTool(tool, { ...base, limit: 200 });
      const singleIds = collectIds(single.structuredContent);

      const pagedIds = [];
      let cursor;
      let pages = 0;

      for (;;) {
        const payload = await client.callTool(tool, {
          ...base,
          limit,
          ...(cursor ? { cursor } : {}),
        });
        const structured = payload.structuredContent;
        const ids = collectIds(structured);
        pagedIds.push(...ids);
        pages += 1;

        const pageInfo = structured?.pageInfo;
        if (!pageInfo?.nextCursor || ids.length === 0 || pages > 40) break;
        cursor = pageInfo.nextCursor;
      }

      const seen = new Set();
      const duplicates = pagedIds.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
      const gaps = [...singleIds].filter((id) => !seen.has(id));

      summary.cursors.push({
        tool,
        pages,
        rows: pagedIds.length,
        duplicates: duplicates.length,
        gaps: gaps.length,
      });

      if (duplicates.length > 0) {
        record({
          rule: "mcp.cursor-overlap",
          surface: `${tool}:cursor`,
          title: `${tool} returned ${duplicates.length} row(s) twice while paging`,
          expected: "Paging a result set returns each row exactly once.",
          actual: `duplicate ids: ${duplicates.slice(0, 5).join(", ")}`,
          session: TEST_SESSION,
        });
      }

      if (gaps.length > 0) {
        record({
          rule: "mcp.cursor-gap",
          surface: `${tool}:cursor`,
          title: `${tool} skipped ${gaps.length} row(s) while paging`,
          expected: "Concatenated pages equal the single-shot result set.",
          actual: `missing ids: ${gaps.slice(0, 5).join(", ")}`,
          session: TEST_SESSION,
        });
      }

      // A fabricated cursor must be a clean refusal or an empty page, never a
      // 500 and never someone else's rows.
      for (const bad of ["-1", "abc", "999999999"]) {
        const attempt = await client.tryCallTool(tool, { ...base, limit: 5, cursor: bad });
        if (attempt.error && attempt.error.kind === "transport") {
          record({
            rule: "mcp.transport-error",
            surface: `${tool}:cursor=${bad}`,
            title: `A fabricated cursor took ${tool} down`,
            expected: "An unparseable cursor is refused or treated as offset 0.",
            actual: attempt.error.message,
            session: TEST_SESSION,
          });
        }
      }
    } catch (error) {
      record({
        rule: "mcp.tool-error",
        surface: `${tool}:cursor`,
        title: `Could not page ${tool}`,
        expected: "Every tool that accepts a cursor can be paged to exhaustion.",
        actual: error.message,
        session: TEST_SESSION,
      });
    }
  }
}

/**
 * The identity of a paged row, per payload.
 *
 * Order matters and got this wrong once: every row in these payloads carries a
 * `studentId`, so keying on it made a student's four installments look like the
 * same row four times, and the first run reported three tools as returning
 * hundreds of duplicates. They were not duplicates. The key has to be the
 * identity of the *row*, which is why the array the payload used decides it.
 */
const ROW_KEYS = [
  ["installments", (row) => row.installmentId],
  ["receipts", (row) => row.receiptId ?? row.receiptNumber],
  ["payments", (row) => row.paymentId ?? row.receiptId ?? row.receiptNumber ?? row.id],
  ["students", (row) => row.studentId ?? row.id],
  ["rows", (row) => row.id ?? row.studentId],
];

function collectIds(structured) {
  if (!structured) return [];
  for (const [key, identify] of ROW_KEYS) {
    const rows = structured[key];
    if (!Array.isArray(rows)) continue;
    return rows.map(identify).filter(Boolean);
  }
  return [];
}

/* ---------------------------------------------------------- 05 oracle */

async function caseOracle(client) {
  console.log("\n05-oracle");

  if (!oracleAvailable()) {
    summary.notes.push("Oracle skipped: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absent.");
    return;
  }

  for (const session of SESSIONS) {
    const { figures } = await oracleFor(session);

    let money;
    try {
      money = (await client.callTool("get_session_money_summary", { sessionLabel: session }))
        .structuredContent;
    } catch (error) {
      record({
        rule: "mcp.tool-error",
        surface: `get_session_money_summary@${session}`,
        title: `Could not read the money summary for ${session}`,
        expected: "The money summary answers for every session the school has.",
        actual: error.message,
        session,
      });
      continue;
    }

    // Headcount and money count different students on purpose, so both are
    // checked: `studentsOnRoll` against record_status='active', and every money
    // figure against active-OR-has-paid. Conflating the two is what once hid
    // ₹17,250 of live collectable dues.
    const rows = [
      compare(`${session} headcount on roll`, money?.headcount?.studentsOnRoll, figures.headcountOnRoll),
      compare(`${session} money students`, money?.money?.studentCount, figures.moneyStudents),
      compare(`${session} expected fees`, money?.money?.totalExpectedFees, figures.expected),
      compare(`${session} collected`, money?.money?.totalPaid, figures.collected),
      compare(`${session} fees pending`, money?.money?.totalFeesPending, figures.feesPending),
      compare(`${session} late fee pending`, money?.money?.totalLateFeePending, figures.lateFeePending),
      compare(`${session} families with fees pending`, money?.money?.pendingStudentCount, figures.pendingStudents),
      compare(
        `${session} families with late fee pending`,
        money?.money?.lateFeePendingStudentCount,
        figures.lateFeePendingStudents,
      ),
    ];

    summary.oracle.push(...rows);

    for (const row of rows) {
      if (row.ok) continue;
      record({
        rule: "mcp.oracle-mismatch",
        surface: `oracle:${row.label}`,
        title: `${row.label}: MCP says ${row.mcp}, Postgres says ${row.postgres}`,
        expected:
          "The MCP and a direct recomputation of the same figure agree exactly. " +
          "Headcount counts record_status='active'; money counts active OR total_paid>0.",
        actual: `delta ${row.delta}`,
        session,
      });
    }
  }
}

/* --------------------------------------------------------- 06 negatives */

async function caseNegatives(client) {
  console.log("\n06-negatives");

  // Auth. `checkServiceToken` must fail closed on every shape of a bad token.
  const authCases = [
    { label: "no token", headers: {} },
    { label: "wrong token", headers: { authorization: "Bearer definitely-not-the-token" } },
    { label: "empty bearer", headers: { authorization: "Bearer " } },
  ];

  for (const authCase of authCases) {
    const response = await fetch(`${MCP_URL}/svc/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authCase.headers },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });

    if (response.status !== 401 && response.status !== 403) {
      record({
        rule: "mcp.auth-not-enforced",
        surface: `/svc/mcp (${authCase.label})`,
        title: `The service lane answered ${response.status} with ${authCase.label}`,
        expected: "The service lane fails closed: no unauthenticated method exemptions.",
        actual: (await response.text()).slice(0, 300),
      });
    }
  }

  const wrongPathToken = await fetch(`${MCP_URL}/svc/mcp/not-the-token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  if (wrongPathToken.status !== 401 && wrongPathToken.status !== 403 && wrongPathToken.status !== 404) {
    record({
      rule: "mcp.auth-not-enforced",
      surface: "/svc/mcp/<wrong-token>",
      title: `A wrong token in the path answered ${wrongPathToken.status}`,
      expected: "The path form of the token is checked exactly like the header form.",
      actual: (await wrongPathToken.text()).slice(0, 300),
    });
  }

  if (!client) return;

  // Schema rejections. Each of these must be a clean refusal, not a 500.
  const badCalls = [
    ["query_students", { sessionLabel: TEST_SESSION, scope: "everybody" }, "unknown scope"],
    ["query_students", { sessionLabel: "2026-2027" }, "malformed session"],
    ["query_students", { sessionLabel: TEST_SESSION, limit: 0 }, "limit 0"],
    ["query_students", { sessionLabel: TEST_SESSION, limit: 201 }, "limit above the cap"],
    ["query_students", { sessionLabel: TEST_SESSION, limit: -5 }, "negative limit"],
    ["query_students", { sessionLabel: TEST_SESSION, limit: 1.5 }, "fractional limit"],
    ["search_students", { sessionLabel: TEST_SESSION, query: "'); DROP TABLE students;--" }, "injection string"],
    ["search_students", { sessionLabel: TEST_SESSION, query: "O'Brien 😀 اختبار" }, "unicode query"],
    ["get_student", { sessionLabel: TEST_SESSION, query: "" }, "empty query"],
  ];

  for (const [tool, callArgs, label] of badCalls) {
    const attempt = await client.tryCallTool(tool, callArgs);
    if (attempt.error?.kind === "transport") {
      record({
        rule: "mcp.transport-error",
        surface: `${tool} (${label})`,
        title: `${label} produced a transport failure on ${tool}`,
        expected: "An invalid argument is a schema rejection, not an HTTP error.",
        actual: attempt.error.message,
        session: TEST_SESSION,
      });
    }
  }

  const unknownTool = await client.tryCallTool("definitely_not_a_tool", {});
  if (unknownTool.ok) {
    record({
      rule: "mcp.tool-error",
      surface: "tools/call definitely_not_a_tool",
      title: "An unknown tool name succeeded",
      expected: "An unknown tool is a JSON-RPC error.",
      actual: JSON.stringify(unknownTool.result).slice(0, 200),
    });
  }
}

/* ---------------------------------------------------------- 07 bridges */

async function caseBridges(client, receiptNumber) {
  console.log("\n07-bridges");

  // A Next.js 404 answers HTTP 200 with HTML, so `response.ok` is not enough:
  // the Worker must require BOTH `content-type: application/pdf` AND a
  // non-empty `x-document-kind` before it calls something a document.
  if (receiptNumber) {
    const attempt = await client.tryCallTool("get_receipt_pdf", { receiptNumber });
    if (!attempt.ok) {
      const detail = attempt.error?.detail ?? attempt.result?.structuredContent?.error ?? "";
      record({
        rule: "bridge.wrong-content-type",
        surface: "get_receipt_pdf",
        title: "The receipt PDF bridge refused a real receipt",
        expected:
          "The document bridge returns a PDF for a receipt that exists. It must " +
          "validate both content-type and x-document-kind, because a Next.js 404 " +
          "is served as HTTP 200 with HTML.",
        actual: `${attempt.error?.message ?? ""} ${JSON.stringify(detail)}`.slice(0, 400),
      });
    }
  } else {
    summary.notes.push("get_receipt_pdf not exercised: no receipt number was discovered.");
  }

  // A receipt that does not exist must be a clean 404 through the bridge, not
  // an HTML page dressed as a PDF.
  const ghost = await client.tryCallTool("get_receipt_pdf", { receiptNumber: "SVP-NO-SUCH-RECEIPT" });
  if (ghost.ok) {
    record({
      rule: "bridge.wrong-content-type",
      surface: "get_receipt_pdf (unknown receipt)",
      title: "The bridge returned a document for a receipt that does not exist",
      expected: "An unknown receipt number is a 404 through the bridge.",
      actual: JSON.stringify(ghost.result).slice(0, 300),
    });
  }

  // Photos are 0/614 populated, so the empty path is the common one and it must
  // be a well-formed answer rather than an error or a null.
  const photo = await client.tryCallTool("get_student_photo", {
    admissionNo: "TEST-CL7-002",
    format: "link",
  });
  if (photo.error?.kind === "transport") {
    record({
      rule: "mcp.transport-error",
      surface: "get_student_photo",
      title: "Asking for a photo that does not exist broke the transport",
      expected: "A student with no photo gets a well-formed 'no photo' answer.",
      actual: photo.error.message,
    });
  }

  // The absence of a bucket or path parameter is a security property, not an
  // oversight: a generic read_storage_object(bucket, path) would be an
  // arbitrary-file-read primitive.
  const tools = await client.listTools();
  for (const name of ["get_student_photo", "get_defaulter_voice_note"]) {
    const tool = tools.find((entry) => entry.name === name);
    if (!tool) continue;
    const properties = Object.keys(tool.inputSchema?.properties ?? {});
    const leaks = properties.filter((property) => /bucket|path|key|object/i.test(property));
    if (leaks.length > 0) {
      record({
        rule: "mcp.tool-visible-without-permission",
        surface: `${name}:inputSchema`,
        title: `${name} accepts a storage location`,
        expected:
          "No tool accepts a bucket or a path. A generic storage reader would be " +
          "an arbitrary-file-read primitive against the school's private buckets.",
        actual: `parameters: ${leaks.join(", ")}`,
      });
    }
  }
}

/* -------------------------------------------------------------- main */

async function main() {
  console.log(`MCP conformance · ${MCP_URL}`);
  console.log(`sessions: ${SESSIONS.join(", ")}`);

  const lanes = [];
  const service = serviceLane(MCP_URL);

  if (service) {
    lanes.push({ label: "svc", client: service, role: null });
    summary.lanes.push("service");
  } else {
    summary.notes.push(
      "SCHOOLFEES_MCP_TOKEN is not set, so the service lane was not tested. " +
        "The admin OAuth lane substitutes for tool coverage; only the /svc/mcp " +
        "auth negatives are lost.",
    );
    console.warn("  ! no service token; falling back to the admin OAuth lane");
  }

  const password = sharedQaPassword();
  if (!password) {
    summary.notes.push(
      "No QA password available, so no OAuth lane was tested. Set " +
        "SMOKE_TEST_STAFF_PASSWORD or keep docs/qa/credentials.local.md.",
    );
  } else {
    for (const role of QA_ROLES) {
      const minted = await mintOAuthToken(role.email, password, MCP_URL);

      if (minted.denied) {
        summary.roleVisibility[role.key] = { count: 0, denied: true };
        // The refusal is the assertion. A role outside
        // SCHOOLFEES_MCP_ALLOWED_ROLES must not be able to connect an assistant.
        if (role.mcpAllowed) {
          record({
            rule: "mcp.auth-not-enforced",
            surface: `/authorize (${role.role})`,
            title: `${role.role} is in the allowed roles but was refused`,
            expected: "SCHOOLFEES_MCP_ALLOWED_ROLES includes this role.",
            actual: `HTTP ${minted.status}: ${minted.body?.slice(0, 200)}`,
            role: role.key,
          });
        }
        continue;
      }

      if (minted.error || !minted.accessToken) {
        summary.notes.push(`OAuth lane for ${role.key}: ${minted.error ?? "no token"}`);
        continue;
      }

      if (!role.mcpAllowed) {
        record({
          rule: "mcp.auth-not-enforced",
          surface: `/authorize (${role.role})`,
          title: `${role.role} minted an MCP token but must not be able to`,
          expected:
            "SCHOOLFEES_MCP_ALLOWED_ROLES is admin,accountant,fee_collector — " +
            "teacher and view_only are refused at sign-in.",
          actual: "An access token was issued.",
          role: role.key,
        });
      }

      lanes.push({
        label: role.key,
        client: oauthLane(minted.accessToken, role.key, MCP_URL),
        role: role.role,
      });
      summary.lanes.push(`oauth:${role.key}`);
    }
  }

  const adminLane = service ?? lanes.find((lane) => lane.role === "admin")?.client ?? null;

  await caseTransport(adminLane);
  await caseToolsList(lanes);
  await caseNegatives(adminLane);

  if (!adminLane) {
    summary.notes.push("No admin-capable lane; tool, scope, cursor, oracle and bridge cases were skipped.");
  } else {
    // A receipt number for the two tools that need one.
    let receiptNumber = null;
    try {
      const receipts = await adminLane.callTool("search_receipts", {
        sessionLabel: TEST_SESSION,
        limit: 1,
      });
      receiptNumber =
        receipts.structuredContent?.receipts?.[0]?.receiptNumber ??
        receipts.structuredContent?.rows?.[0]?.receiptNumber ??
        null;
    } catch {
      receiptNumber = null;
    }

    await caseHappyPath(adminLane, receiptNumber);
    await caseScope(adminLane);
    await caseCursors(adminLane);
    await caseOracle(adminLane);
    await caseBridges(adminLane, receiptNumber);
  }

  if (runDir) {
    writeFileSync(
      path.join(runDir, "mcp-summary.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
      "utf8",
    );
  }

  const bySeverity = findings.reduce((counts, finding) => {
    counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;
    return counts;
  }, {});

  console.log(
    `\nMCP conformance done: ${findings.length} finding(s) ` +
      `(${Object.entries(bySeverity).map(([k, v]) => `${k} ${v}`).join(", ") || "none"})`,
  );
  for (const note of summary.notes) console.log(`  note: ${note}`);

  // The verdict is the reporter's job — this runner always exits 0 unless it
  // could not run at all, so a P0 here still produces a merged report.
  process.exit(0);
}

main().catch((error) => {
  console.error(`MCP conformance runner failed: ${error.stack ?? error.message}`);
  process.exit(2);
});
