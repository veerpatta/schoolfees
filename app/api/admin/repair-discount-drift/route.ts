import { NextResponse } from "next/server";

import {
  generateSessionLedgersAction,
  previewLedgerGenerationDetailed,
} from "@/lib/fees/generator";
import { createAdminClient } from "@/lib/supabase/admin";
import { drainFinancialViewRefresh } from "@/lib/system-sync/financial-view-refresh";

/**
 * Repair students whose fee ledger disagrees with their resolved fee policy.
 *
 * Two bugs left live data drifted:
 *
 *  1. `v_workbook_student_financials` could not see conventional discounts
 *     (RTE / Staff Child / 3rd Child), so its `discount_amount` read Rs 0 for
 *     students whose installments already carried the discount. Fixed by
 *     migration 20260807120000 — no data change needed for that half.
 *  2. A discount applied to a student who had ALREADY PAID was silently
 *     discarded: every installment carrying money was frozen and the whole plan
 *     thrown away. Those students still owe the pre-discount amount, and only
 *     re-running the generator fixes them.
 *
 * Deliberately a route, not a migration: the repair has to recompute amounts
 * through resolveStudentPolicyBreakdown → buildWorkbookInstallmentCharges →
 * allocateChargesRespectingPaidFloors. Reimplementing that chain in PL/pgSQL
 * would create a second fee engine that drifts from the first — the exact class
 * of bug being repaired. A route can also be re-run; a migration cannot.
 *
 * Idempotent by construction: the generator converges, and the drift query is
 * its own fixpoint test. A second run finds nothing and writes nothing.
 *
 * POST { sessionLabel, dryRun?: true, studentIds?: string[] }
 * Authorised with CRON_SECRET, same as the day-close cron.
 */

export const maxDuration = 300;

type DriftRow = {
  student_id: string;
  admission_no: string;
  student_name: string;
  class_label: string;
  session_label: string;
  view_net: number;
  ledger_net: number;
  drift: number;
};

function authorize(request: Request): { ok: boolean; reason?: string } {
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    return { ok: false, reason: "CRON_SECRET env var not configured." };
  }

  const url = new URL(request.url);
  const provided =
    url.searchParams.get("secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (provided !== expectedSecret) {
    return { ok: false, reason: "Invalid or missing secret." };
  }

  return { ok: true };
}

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Students whose current-year installment total disagrees with
 * `gross_base_before_discount - discount_amount`.
 *
 * Carry-forward rows are excluded on purpose. They are a deliberate prior-year
 * balance carried into this session (`installment_no >= 90`), so they are NOT
 * part of the current policy total — leaving them in flags every student with
 * previous-year dues as drifted.
 */
async function findDrift(
  supabase: AdminClient,
  sessionLabel: string,
  studentIds?: string[],
): Promise<DriftRow[]> {
  const { data: financials, error: financialsError } = await supabase
    .from("v_workbook_student_financials")
    .select(
      "student_id, admission_no, student_name, class_label, session_label, gross_base_before_discount, discount_amount",
    )
    .eq("session_label", sessionLabel)
    .eq("record_status", "active");

  if (financialsError) {
    throw new Error(`Unable to read financials: ${financialsError.message}`);
  }

  const scoped = (financials ?? []).filter(
    (row) => !studentIds || studentIds.includes(row.student_id as string),
  );

  if (scoped.length === 0) {
    return [];
  }

  const ledgerNetByStudent = new Map<string, number>();
  const ids = scoped.map((row) => row.student_id as string);

  // Chunked: `in` on several hundred uuids blows past the URL length limit.
  for (let index = 0; index < ids.length; index += 200) {
    const slice = ids.slice(index, index + 200);
    const { data: rows, error } = await supabase
      .from("installments")
      .select("student_id, amount_due, status, is_carry_forward")
      .in("student_id", slice)
      .neq("status", "cancelled");

    if (error) {
      throw new Error(`Unable to read installments: ${error.message}`);
    }

    for (const row of rows ?? []) {
      if (row.is_carry_forward) {
        continue;
      }

      const studentId = row.student_id as string;
      ledgerNetByStudent.set(
        studentId,
        (ledgerNetByStudent.get(studentId) ?? 0) + Number(row.amount_due ?? 0),
      );
    }
  }

  const drifted: DriftRow[] = [];

  for (const row of scoped) {
    const studentId = row.student_id as string;

    // A student with no ledger at all is not "drifted" — they are "dues not
    // prepared", which is a different (and already reported) condition.
    if (!ledgerNetByStudent.has(studentId)) {
      continue;
    }

    const viewNet =
      Number(row.gross_base_before_discount ?? 0) - Number(row.discount_amount ?? 0);
    const ledgerNet = ledgerNetByStudent.get(studentId) ?? 0;

    if (viewNet === ledgerNet) {
      continue;
    }

    drifted.push({
      student_id: studentId,
      admission_no: row.admission_no as string,
      student_name: row.student_name as string,
      class_label: row.class_label as string,
      session_label: row.session_label as string,
      view_net: viewNet,
      ledger_net: ledgerNet,
      drift: viewNet - ledgerNet,
    });
  }

  return drifted.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));
}

export async function POST(request: Request) {
  const auth = authorize(request);

  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 });
  }

  let body: { sessionLabel?: string; dryRun?: boolean; studentIds?: string[] };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be JSON." }, { status: 400 });
  }

  const sessionLabel = body.sessionLabel?.trim();

  if (!sessionLabel) {
    return NextResponse.json({ ok: false, error: "sessionLabel is required." }, { status: 400 });
  }

  // Dry run is the DEFAULT. Repairing live fee records is opt-in, every time.
  const dryRun = body.dryRun !== false;
  const supabase = createAdminClient();

  try {
    const before = await findDrift(supabase, sessionLabel, body.studentIds);

    if (before.length === 0) {
      return NextResponse.json({
        ok: true,
        sessionLabel,
        dryRun,
        driftedCount: 0,
        message: "No drift found. Every active student's ledger matches their resolved fee policy.",
        before: [],
        after: [],
        remaining: [],
        residualCreditStudents: [],
      });
    }

    const scopedStudentIds = before.map((row) => row.student_id);
    const preview = await previewLedgerGenerationDetailed({
      scopedSessionLabel: sessionLabel,
      scopedStudentIds,
      useAdminClient: true,
    });

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        sessionLabel,
        dryRun: true,
        driftedCount: before.length,
        before,
        plan: {
          installmentsToInsert: preview.installmentsToInsert,
          installmentsToUpdate: preview.installmentsToUpdate,
          installmentsToCancel: preview.installmentsToCancel,
          lockedInstallments: preview.lockedInstallments,
          residualCreditTotal: preview.residualCreditTotal,
        },
        residualCreditStudents: preview.residualCreditStudents,
        blockedInstallmentsForReview: preview.blockedInstallmentsForReview,
        skippedStudents: preview.skippedStudents,
        message: "Dry run only. Nothing was written.",
      });
    }

    const result = await generateSessionLedgersAction({
      scopedSessionLabel: sessionLabel,
      scopedStudentIds,
      useAdminClient: true,
    });

    // The matview is what every screen reads. Drain before re-checking, or the
    // "remaining drift" figure below is measured against stale data.
    await drainFinancialViewRefresh();

    const remaining = await findDrift(supabase, sessionLabel, scopedStudentIds);

    // Same table Session Health writes to, so the repair shows up in the
    // existing audit trail rather than a private log.
    await supabase.from("session_reconcile_log").insert({
      session_label: sessionLabel,
      finished_at: new Date().toISOString(),
      prepared_count: result.installmentsToInsert,
      updated_count: result.installmentsToUpdate,
      locked_count: result.lockedInstallments,
      attention_count: remaining.length,
      // The table has no free-text "reason" column, so the note rides on
      // error_message — the only text field — and stays null on a clean run.
      error_message:
        remaining.length > 0
          ? `Discount drift repair: ${remaining.length} student(s) still drifted.`
          : null,
    });

    return NextResponse.json({
      ok: true,
      sessionLabel,
      dryRun: false,
      driftedCount: before.length,
      before,
      applied: {
        installmentsToInsert: result.installmentsToInsert,
        installmentsToUpdate: result.installmentsToUpdate,
        installmentsToCancel: result.installmentsToCancel,
        lockedInstallments: result.lockedInstallments,
        residualCreditTotal: result.residualCreditTotal,
      },
      residualCreditStudents: result.residualCreditStudents,
      blockedInstallmentsForReview: result.blockedInstallmentsForReview,
      skippedStudents: result.skippedStudents,
      remaining,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Repair failed." },
      { status: 500 },
    );
  }
}
