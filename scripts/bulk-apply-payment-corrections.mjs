import { randomUUID } from "node:crypto";

/**
 * Bulk correction of wrongly-entered payment data.
 *
 * A second execution mode for `scripts/bulk-apply.mjs`, not a new operation in
 * its registry. The registry's engine issues column UPDATEs against one table
 * with a writable allowlist, and that mechanism cannot be pointed at `payments`
 * or `receipts`: the append-only triggers raise for the service role too, and
 * `FORBIDDEN_TABLES` names all four money tables. Both of those stay exactly as
 * they are.
 *
 * So corrections go the only way money has ever moved after posting — by
 * appending. Every money-moving correction is reverse + repost:
 *
 *     reverse_receipt_admin(receipt)     -> compensating payment_adjustments
 *     post_corrected_payment(...)        -> a fresh receipt with the right data
 *
 * Nothing is edited, nothing is deleted, and every downstream number recomputes
 * itself because `pending_amount` is derived from payments + adjustments rather
 * than stored. The one exception is `metadata`, which touches three descriptive
 * columns that carry no money — see `protect_receipt_money_columns`.
 *
 * There is deliberately no UI for any of this.
 */

export const CORRECTION_OPS = Object.freeze({
  reverse: {
    describe: "Receipt should not exist at all — a duplicate, or money never received.",
    needs: ["receiptNumber", "fromAmount"],
  },
  amount: {
    describe: "Receipt was entered for the wrong rupee figure.",
    needs: ["receiptNumber", "fromAmount", "toAmount"],
  },
  student: {
    describe: "Receipt was posted against the wrong child.",
    needs: ["receiptNumber", "fromAdmissionNo", "toAdmissionNo"],
  },
  "date-mode": {
    describe: "Right money, wrong payment date or payment mode.",
    needs: ["receiptNumber"],
  },
  allocation: {
    describe: "Right money on the right child, applied to the wrong installment.",
    needs: ["receiptNumber", "allocations"],
  },
  metadata: {
    describe:
      "Reference number, notes or received-by only. Edited in place — no money moves, so the receipt is not voided.",
    needs: ["receiptNumber"],
  },
});

/** Descriptive columns a correction may write in place. Nothing else. */
const METADATA_COLUMNS = Object.freeze(["referenceNumber", "notes", "receivedBy"]);

const METADATA_COLUMN_TO_DB = Object.freeze({
  referenceNumber: "reference_number",
  notes: "notes",
  receivedBy: "received_by",
});

export function describeCorrectionOps() {
  return Object.entries(CORRECTION_OPS)
    .map(([name, meta]) => `  ${name.padEnd(12)} ${meta.describe}`)
    .join("\n");
}

/**
 * Load every receipt named by the plan, with its allocation and its student,
 * scoped to the session the CLI was given.
 *
 * Scoping is by the session frozen on the payment's installment, not the
 * student's current class — a promoted student's prior-year receipt must not
 * become writable just because they moved up a year.
 */
export async function loadCorrectionContext(supabase, plan, sessionLabel) {
  const receiptNumbers = [...new Set(plan.rows.map((row) => row.receiptNumber).filter(Boolean))];

  if (receiptNumbers.length !== plan.rows.length) {
    throw new Error("Every correction row needs a unique receiptNumber.");
  }

  const { data: receiptRows, error: receiptError } = await supabase
    .from("receipts")
    .select(
      "id, receipt_number, student_id, payment_date, payment_mode, total_amount, reference_number, notes, received_by",
    )
    .in("receipt_number", receiptNumbers);

  if (receiptError) {
    throw new Error(`Could not read receipts: ${receiptError.message}`);
  }

  const receipts = new Map((receiptRows ?? []).map((row) => [row.receipt_number, row]));
  const receiptIds = (receiptRows ?? []).map((row) => row.id);

  const { data: paymentRows, error: paymentError } = await supabase
    .from("payments")
    .select(
      "id, receipt_id, student_id, installment_id, amount, installment_ref:installments(installment_no, due_date, class_ref:classes(session_label))",
    )
    .in("receipt_id", receiptIds.length > 0 ? receiptIds : ["00000000-0000-0000-0000-000000000000"]);

  if (paymentError) {
    throw new Error(`Could not read payment allocations: ${paymentError.message}`);
  }

  const allocationsByReceipt = new Map();
  const sessionByReceipt = new Map();

  for (const row of paymentRows ?? []) {
    const installment = firstOf(row.installment_ref);
    const classRef = installment ? firstOf(installment.class_ref) : null;

    if (classRef?.session_label) {
      sessionByReceipt.set(row.receipt_id, classRef.session_label);
    }

    const list = allocationsByReceipt.get(row.receipt_id) ?? [];
    list.push({
      paymentId: row.id,
      installmentId: row.installment_id,
      installmentNo: installment?.installment_no ?? null,
      dueDate: installment?.due_date ?? null,
      amount: row.amount,
    });
    allocationsByReceipt.set(row.receipt_id, list);
  }

  for (const list of allocationsByReceipt.values()) {
    list.sort((left, right) => String(left.dueDate).localeCompare(String(right.dueDate)));
  }

  // Reversal state, so a receipt already given back is refused rather than
  // reversed to zero and silently reposted.
  const { data: reversalRows } = await supabase
    .from("v_receipt_reversal_totals")
    .select("receipt_id, reversed_amount")
    .in("receipt_id", receiptIds.length > 0 ? receiptIds : ["00000000-0000-0000-0000-000000000000"]);

  const reversedByReceipt = new Map(
    (reversalRows ?? []).map((row) => [row.receipt_id, row.reversed_amount]),
  );

  const { data: openRefundRows } = await supabase
    .from("refund_requests")
    .select("receipt_id, status")
    .in("receipt_id", receiptIds.length > 0 ? receiptIds : ["00000000-0000-0000-0000-000000000000"])
    .neq("status", "rejected");

  const openRefundReceiptIds = new Set((openRefundRows ?? []).map((row) => row.receipt_id));

  const studentIds = [...new Set((receiptRows ?? []).map((row) => row.student_id))];
  const targetAdmissionNos = [
    ...new Set(plan.rows.map((row) => row.toAdmissionNo).filter(Boolean)),
  ];

  const { data: studentRows } = await supabase
    .from("students")
    .select("id, admission_no, full_name")
    .or(
      [
        studentIds.length > 0 ? `id.in.(${studentIds.join(",")})` : null,
        targetAdmissionNos.length > 0
          ? `admission_no.in.(${targetAdmissionNos.map((value) => `"${value}"`).join(",")})`
          : null,
      ]
        .filter(Boolean)
        .join(","),
    );

  const studentsById = new Map((studentRows ?? []).map((row) => [row.id, row]));
  const studentsByAdmissionNo = new Map((studentRows ?? []).map((row) => [row.admission_no, row]));

  return {
    sessionLabel,
    receipts,
    allocationsByReceipt,
    sessionByReceipt,
    reversedByReceipt,
    openRefundReceiptIds,
    studentsById,
    studentsByAdmissionNo,
  };
}

/**
 * Turn one plan row into either a rejection or a concrete change.
 *
 * The `from*` fields are required and re-checked here, not merely echoed: a
 * reviewed dry run only means something if the row is still what it was when it
 * was reviewed. A row that has moved is skipped and reported, never forced.
 */
export function planCorrection(row, index, context) {
  const reject = (why) => ({ ok: false, index, key: row.receiptNumber ?? `row ${index}`, why });

  const op = CORRECTION_OPS[row.op];
  if (!op) {
    return reject(`Unknown correction op "${row.op}". Known: ${Object.keys(CORRECTION_OPS).join(" | ")}`);
  }

  for (const field of op.needs) {
    if (row[field] === undefined || row[field] === null || row[field] === "") {
      return reject(`"${row.op}" needs "${field}".`);
    }
  }

  const receipt = context.receipts.get(row.receiptNumber);
  if (!receipt) {
    return reject(`No receipt ${row.receiptNumber} in the database.`);
  }

  const receiptSession = context.sessionByReceipt.get(receipt.id);
  if (receiptSession !== context.sessionLabel) {
    return reject(
      `Receipt ${row.receiptNumber} belongs to ${receiptSession ?? "an unknown session"}, not ${context.sessionLabel}.`,
    );
  }

  const allocations = context.allocationsByReceipt.get(receipt.id) ?? [];
  if (allocations.length === 0) {
    return reject(`Receipt ${row.receiptNumber} has no payment rows to correct.`);
  }

  const alreadyReversed = context.reversedByReceipt.get(receipt.id) ?? 0;
  if (alreadyReversed >= receipt.total_amount) {
    return reject(`Receipt ${row.receiptNumber} is already fully reversed.`);
  }

  if (context.openRefundReceiptIds.has(receipt.id)) {
    return reject(`Receipt ${row.receiptNumber} has a refund request in progress.`);
  }

  const student = context.studentsById.get(receipt.student_id);

  if (row.op === "metadata") {
    const patch = {};
    for (const field of METADATA_COLUMNS) {
      if (row[field] !== undefined) {
        const next = row[field] === null ? null : String(row[field]).trim() || null;
        if (next !== (receipt[METADATA_COLUMN_TO_DB[field]] ?? null)) {
          patch[METADATA_COLUMN_TO_DB[field]] = next;
        }
      }
    }

    const unknown = Object.keys(row).filter(
      (key) =>
        !["op", "receiptNumber", ...METADATA_COLUMNS].includes(key) &&
        !key.startsWith("from"),
    );
    if (unknown.length > 0) {
      return reject(
        `"metadata" may only write ${METADATA_COLUMNS.join(", ")} — not ${unknown.join(", ")}. Anything else moves money and needs its own op.`,
      );
    }

    if (Object.keys(patch).length === 0) {
      return { ok: true, skip: true, index, key: row.receiptNumber, why: "already correct" };
    }

    return {
      ok: true,
      kind: "metadata",
      index,
      key: row.receiptNumber,
      receipt,
      student,
      patch,
      describe: Object.entries(patch)
        .map(([column, value]) => `${column}: ${receipt[column] ?? "—"} → ${value ?? "—"}`)
        .join(", "),
    };
  }

  // The only op that reverses WITHOUT posting a replacement. A duplicate
  // receipt has no corrected version — the right amount for it is nothing, and
  // `amount` cannot express that because a receipt of ₹0 is not a receipt.
  if (row.op === "reverse") {
    if (Number(row.fromAmount) !== receipt.total_amount) {
      return reject(
        `Receipt ${row.receiptNumber} is ${receipt.total_amount}, not the ${row.fromAmount} the plan expected. Re-run the dry run.`,
      );
    }

    return {
      ok: true,
      kind: "reverse",
      index,
      key: row.receiptNumber,
      receipt,
      student,
      targetStudent: student,
      describe: `reverse ${receipt.total_amount}, no replacement`,
    };
  }

  // Everything below reverses and reposts.
  if (row.op === "amount") {
    if (Number(row.fromAmount) !== receipt.total_amount) {
      return reject(
        `Receipt ${row.receiptNumber} is ${receipt.total_amount}, not the ${row.fromAmount} the plan expected. Re-run the dry run.`,
      );
    }

    const toAmount = Number(row.toAmount);
    if (!Number.isInteger(toAmount) || toAmount <= 0) {
      return reject(`"toAmount" must be a positive whole number of rupees.`);
    }
    if (toAmount === receipt.total_amount) {
      return { ok: true, skip: true, index, key: row.receiptNumber, why: "already correct" };
    }
    if (toAmount > receipt.total_amount) {
      return reject(
        `"toAmount" is larger than the original. Take the extra as a new payment at the desk rather than rewriting this one.`,
      );
    }

    return {
      ok: true,
      kind: "repost",
      index,
      key: row.receiptNumber,
      receipt,
      student,
      targetStudent: student,
      // Spread the corrected total over the same installments, earliest due
      // first — the order the desk would have used.
      allocations: spread(toAmount, allocations),
      paymentDate: receipt.payment_date,
      paymentMode: receipt.payment_mode,
      describe: `amount ${receipt.total_amount} → ${toAmount}`,
    };
  }

  if (row.op === "student") {
    if (!student || student.admission_no !== row.fromAdmissionNo) {
      return reject(
        `Receipt ${row.receiptNumber} belongs to ${student?.admission_no ?? "an unknown student"}, not the ${row.fromAdmissionNo} the plan expected.`,
      );
    }

    const target = context.studentsByAdmissionNo.get(row.toAdmissionNo);
    if (!target) {
      return reject(`No student with admission no ${row.toAdmissionNo}.`);
    }
    if (target.id === receipt.student_id) {
      return { ok: true, skip: true, index, key: row.receiptNumber, why: "already correct" };
    }
    if (!Array.isArray(row.allocations) || row.allocations.length === 0) {
      return reject(
        `Moving a receipt to another child needs an explicit "allocations" list — their installments are different rows, so the original allocation cannot carry over.`,
      );
    }

    return {
      ok: true,
      kind: "repost",
      index,
      key: row.receiptNumber,
      receipt,
      student,
      targetStudent: target,
      allocations: row.allocations.map((entry) => ({
        installmentId: entry.installmentId,
        amount: Number(entry.amount),
      })),
      paymentDate: receipt.payment_date,
      paymentMode: receipt.payment_mode,
      describe: `student ${student?.admission_no ?? "?"} → ${target.admission_no}`,
    };
  }

  if (row.op === "date-mode") {
    const paymentDate = row.toPaymentDate ?? receipt.payment_date;
    const paymentMode = row.toPaymentMode ?? receipt.payment_mode;

    if (paymentDate === receipt.payment_date && paymentMode === receipt.payment_mode) {
      return { ok: true, skip: true, index, key: row.receiptNumber, why: "already correct" };
    }
    if (paymentMode === "discount") {
      return reject(
        `"discount" is a write-off, not a payment mode a correction may set. Use the close-balance-as-discount flow.`,
      );
    }

    return {
      ok: true,
      kind: "repost",
      index,
      key: row.receiptNumber,
      receipt,
      student,
      targetStudent: student,
      allocations: allocations.map((entry) => ({
        installmentId: entry.installmentId,
        amount: entry.amount,
      })),
      paymentDate,
      paymentMode,
      describe: `${receipt.payment_date}/${receipt.payment_mode} → ${paymentDate}/${paymentMode}`,
    };
  }

  // allocation
  const requested = row.allocations.map((entry) => ({
    installmentId: entry.installmentId,
    amount: Number(entry.amount),
  }));
  const requestedTotal = requested.reduce((sum, entry) => sum + entry.amount, 0);

  if (requestedTotal !== receipt.total_amount) {
    return reject(
      `Allocations total ${requestedTotal} but the receipt is ${receipt.total_amount}. Re-allocating must not change the amount — use "amount" for that.`,
    );
  }

  return {
    ok: true,
    kind: "repost",
    index,
    key: row.receiptNumber,
    receipt,
    student,
    targetStudent: student,
    allocations: requested,
    paymentDate: receipt.payment_date,
    paymentMode: receipt.payment_mode,
    describe: `re-allocated across ${requested.length} installment(s)`,
  };
}

/** Greedy spread of a corrected total over the original installments, earliest due first. */
function spread(total, allocations) {
  let remaining = total;
  const out = [];

  for (const entry of allocations) {
    if (remaining <= 0) break;
    const amount = Math.min(remaining, entry.amount);
    if (amount > 0) {
      out.push({ installmentId: entry.installmentId, amount });
      remaining -= amount;
    }
  }

  return out;
}

/**
 * Apply one planned correction.
 *
 * Reverse then repost, in that order and never the reverse: the repost is
 * validated against what the installment still owes, so it only fits once the
 * wrong receipt has been given back.
 */
export async function applyCorrection(supabase, change, plan, sessionLabel, actor, runId) {
  if (change.kind === "metadata") {
    const { error } = await supabase
      .from("receipts")
      .update(change.patch)
      .eq("id", change.receipt.id);

    if (error) {
      return { key: change.key, ok: false, why: error.message };
    }

    await writeAuditRow(supabase, {
      table: "receipts",
      recordId: change.receipt.id,
      before: Object.fromEntries(
        Object.keys(change.patch).map((column) => [column, change.receipt[column] ?? null]),
      ),
      after: change.patch,
      plan,
      sessionLabel,
      actor,
      runId,
      op: "metadata",
    });

    return { key: change.key, ok: true, studentIds: [change.receipt.student_id] };
  }

  const { data: reversal, error: reversalError } = await supabase.rpc("reverse_receipt_admin", {
    p_receipt_id: change.receipt.id,
    p_reason: `Bulk correction (${plan.reason})`,
  });

  if (reversalError) {
    return { key: change.key, ok: false, why: `reversal failed: ${reversalError.message}` };
  }

  const reversalRow = Array.isArray(reversal) ? reversal[0] : reversal;

  if (change.kind === "reverse") {
    await writeAuditRow(supabase, {
      table: "receipts",
      recordId: change.receipt.id,
      before: {
        receipt_number: change.receipt.receipt_number,
        student_id: change.receipt.student_id,
        total_amount: change.receipt.total_amount,
      },
      after: {
        reversed_amount: reversalRow?.reversed_amount ?? null,
        replacement_receipt_number: null,
      },
      plan,
      sessionLabel,
      actor,
      runId,
      op: "reverse",
    });

    return { key: change.key, ok: true, studentIds: [change.receipt.student_id] };
  }

  const { data: reposted, error: repostError } = await supabase.rpc("post_corrected_payment", {
    p_student_id: change.targetStudent.id,
    p_payment_date: change.paymentDate,
    p_payment_mode: change.paymentMode,
    p_allocations: change.allocations.map((entry) => ({
      installment_id: entry.installmentId,
      amount: entry.amount,
    })),
    // A fresh id per correction: reusing the original receipt's would short-circuit
    // the idempotency check and hand back the receipt we just reversed.
    p_client_request_id: randomUUID(),
    p_reference_number: change.receipt.reference_number,
    p_received_by: change.receipt.received_by,
    p_notes: `Corrected from ${change.receipt.receipt_number}`,
  });

  if (repostError) {
    // The reversal has already landed and is append-only, so it cannot be taken
    // back. Say so loudly rather than reporting a tidy failure — the receipt is
    // reversed and NOT yet reposted, and somebody has to finish it.
    return {
      key: change.key,
      ok: false,
      why:
        `REVERSED BUT NOT REPOSTED — repost failed: ${repostError.message}. ` +
        `Receipt ${change.receipt.receipt_number} is now reversed with nothing in its place. Post the corrected receipt at the desk.`,
    };
  }

  const newReceipt = Array.isArray(reposted) ? reposted[0] : reposted;

  await writeAuditRow(supabase, {
    table: "receipts",
    recordId: change.receipt.id,
    before: {
      receipt_number: change.receipt.receipt_number,
      student_id: change.receipt.student_id,
      payment_date: change.receipt.payment_date,
      payment_mode: change.receipt.payment_mode,
      total_amount: change.receipt.total_amount,
    },
    after: {
      reversed_amount: reversalRow?.reversed_amount ?? null,
      replacement_receipt_id: newReceipt?.receipt_id ?? null,
      replacement_receipt_number: newReceipt?.receipt_number ?? null,
      replacement_total: newReceipt?.allocated_total ?? null,
      replacement_student_id: change.targetStudent.id,
    },
    plan,
    sessionLabel,
    actor,
    runId,
    op: change.kind,
  });

  return {
    key: change.key,
    ok: true,
    replacement: newReceipt?.receipt_number ?? null,
    studentIds: [...new Set([change.receipt.student_id, change.targetStudent.id])],
  };
}

/**
 * `recordActivity()` returns early without a userId, so a headless correction is
 * invisible in the Activity feed. The DB's own audit triggers fire on every
 * insert but carry no reason and no actor — this row is the only place the two
 * meet.
 */
async function writeAuditRow(supabase, payload) {
  const { error } = await supabase.from("audit_logs").insert({
    table_name: payload.table,
    record_id: payload.recordId,
    action: "update",
    before_data: payload.before,
    after_data: {
      ...payload.after,
      _bulk_apply: {
        runId: payload.runId,
        operation: `payment-correction:${payload.op}`,
        sessionLabel: payload.sessionLabel,
        reason: payload.plan.reason,
        actor: payload.actor,
      },
    },
    changed_by: null,
  });

  if (error) {
    console.error(`  audit row failed for ${payload.recordId}: ${error.message}`);
  }
}

function firstOf(value) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** The plan `operation` value that selects this mode. */
export const PAYMENT_CORRECTION_OPERATION = "payment-correction";

export const CORRECTION_FOLLOW_UP = [
  "Every correction reverses a posted receipt and posts a replacement. Both stay on",
  "  file forever, the reversed one is stamped VOID, and a parent scanning the QR on",
  "  their printed copy sees it as reversed straight away.",
].join("\n");

/**
 * The correction mode's runner.
 *
 * Lives here rather than in `bulk-apply.mjs` so the money path is one file you
 * can read end to end. The host passes its own guards in — dry-run flag, live
 * session label, table printer — so there is exactly one implementation of each.
 */
export async function runPaymentCorrections({
  supabase,
  plan,
  planPath,
  sessionLabel,
  apply,
  actor,
  liveSessionLabel,
  baseUrl,
  printTable,
  fail,
}) {
  console.log(`\n## Payment corrections — ${sessionLabel}${apply ? "" : " (dry run)"}\n`);
  console.log(`  Plan:   ${planPath}`);
  console.log(`  Reason: ${plan.reason}`);
  console.log(`  Rows:   ${plan.rows.length} requested\n`);

  const context = await loadCorrectionContext(supabase, plan, sessionLabel);
  const planned = plan.rows.map((row, index) => planCorrection(row, index, context));

  const rejected = planned.filter((entry) => !entry.ok);
  const skipped = planned.filter((entry) => entry.ok && entry.skip);
  const changes = planned.filter((entry) => entry.ok && !entry.skip);

  if (rejected.length > 0) {
    console.log("### Rejected rows — the plan is wrong, not the data\n");
    printTable(rejected, [
      { header: "#", get: (row) => row.index + 1 },
      { header: "Receipt", get: (row) => row.key },
      { header: "Why", get: (row) => row.why },
    ]);
    fail(`${rejected.length} row(s) rejected. Nothing was written. Fix the plan and re-run.`);
  }

  if (skipped.length > 0) {
    console.log(`### Already correct — ${skipped.length} row(s) skipped\n`);
  }

  if (changes.length === 0) {
    console.log("Nothing to change — every receipt already holds the requested values.\n");
    return;
  }

  console.log("### Planned corrections\n");
  printTable(changes, [
    { header: "Receipt", get: (row) => row.key },
    { header: "Student", get: (row) => row.student?.admission_no ?? "?" },
    {
      header: "Kind",
      get: (row) =>
        row.kind === "metadata"
          ? "metadata"
          : row.kind === "reverse"
            ? "reverse only"
            : "reverse + repost",
    },
    { header: "Change", get: (row) => row.describe },
  ]);

  const reposts = changes.filter((change) => change.kind === "repost").length;
  const reversals = changes.filter((change) => change.kind === "reverse").length;
  console.log(
    `
  ${reposts} to reverse and repost, ${reversals} to reverse with no replacement, ` +
      `${changes.length - reposts - reversals} metadata-only.
`,
  );

  if (!apply) {
    console.log(
      "Dry run — nothing was written. Re-run with --apply once the diff above is right.\n",
    );
    return;
  }

  if (sessionLabel === liveSessionLabel) {
    console.log(`\n  ⚠  Writing to the LIVE session ${liveSessionLabel}.\n`);
  }

  const runId = randomUUID();
  const outcomes = [];

  // Sequential on purpose. Each correction takes a per-student advisory lock and
  // prices its repost against what the installment still owes, so concurrency
  // would only queue on the lock — and a mid-run failure is far easier to read
  // when the order on screen is the order in the plan.
  for (const change of changes) {
    outcomes.push(await applyCorrection(supabase, change, plan, sessionLabel, actor, runId));
  }

  const failed = outcomes.filter((outcome) => !outcome.ok);
  const succeeded = outcomes.filter((outcome) => outcome.ok);

  console.log(`Applied ${succeeded.length} of ${outcomes.length}.\n`);

  if (failed.length > 0) {
    console.log("### Failed\n");
    printTable(failed, [
      { header: "Receipt", get: (row) => row.key },
      { header: "Why", get: (row) => row.why },
    ]);
  }

  const replacements = succeeded.filter((outcome) => outcome.replacement);
  if (replacements.length > 0) {
    console.log("\n### Replacement receipts\n");
    printTable(replacements, [
      { header: "Was", get: (row) => row.key },
      { header: "Now", get: (row) => row.replacement },
    ]);
  }

  await revalidateAfterCorrections({
    sessionLabel,
    baseUrl,
    studentIds: [...new Set(succeeded.flatMap((outcome) => outcome.studentIds ?? []))],
  });

  console.log("");

  if (failed.length > 0) {
    process.exit(1);
  }
}

/**
 * Ask the app to refresh what it has cached.
 *
 * The database self-corrects the moment the adjustments land — every balance is
 * derived. The caches do not. `get_dashboard_summary` and friends hang off the
 * `session:{label}` tag, and the insert trigger only ENQUEUES the workbook
 * matview refresh. Neither is reachable from a plain Node process, so this posts
 * to the same CRON_SECRET-guarded shape `repair-discount-drift.mjs` uses.
 *
 * Failing to refresh is reported, never swallowed: "the repair worked but the
 * dashboard kept showing the old number" has happened here before, and a silent
 * skip is exactly what made it hard to spot.
 */
async function revalidateAfterCorrections({ sessionLabel, baseUrl, studentIds }) {
  const secret = process.env.CRON_SECRET?.trim();
  const target = baseUrl ?? process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? "http://localhost:3000";

  const warn = (why) => {
    console.log(
      `\n### Caches NOT refreshed\n\n  ${why}\n` +
        "  The database is correct. The screens may show pre-correction numbers until the\n" +
        "  two-minute refresh cron catches up.",
    );
  };

  if (!secret) {
    warn("CRON_SECRET is not set, so the app could not be asked to refresh.");
    return;
  }

  try {
    const response = await fetch(`${target}/api/admin/revalidate-after-bulk`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
      body: JSON.stringify({ sessionLabel, studentIds }),
    });

    if (!response.ok) {
      warn(`${target} answered ${response.status}.`);
      return;
    }

    console.log("\n### Caches refreshed\n\n  Matviews drained and the session tag busted.");
  } catch (error) {
    warn(error instanceof Error ? error.message : String(error));
  }
}
