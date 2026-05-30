import "server-only";

import { copyAcademicSessionSetup } from "@/lib/master-data/data";
import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/supabase/session";
import { prepareDuesForStudentsAutomatically } from "@/lib/system-sync/finance-sync";
import { revalidateFinanceSurfaces } from "@/lib/system-sync/finance-sync";
import type { StudentStatus } from "@/lib/db/types";

export type PromotionRunStatus = "preview" | "applied" | "rolled_back";
export type PromotionEntryDecision = "pending" | "promote" | "graduate" | "skip" | "manual";

export type PromotionRunSummary = {
  id: string;
  sourceSessionLabel: string;
  targetSessionLabel: string;
  status: PromotionRunStatus;
  triggeredAt: string;
  appliedAt: string | null;
  rolledBackAt: string | null;
  previewCount: number;
  appliedCount: number;
  graduatedCount: number;
  creditCarryForwardCount: number;
  creditCarryForwardTotal: number;
  notes: string | null;
};

export type PromotionEntryRow = {
  id: string;
  runId: string;
  studentId: string;
  studentName: string;
  studentAdmissionNo: string;
  previousClassId: string | null;
  previousClassLabel: string;
  newClassId: string | null;
  newClassLabel: string;
  previousStatus: StudentStatus | null;
  newStatus: StudentStatus | null;
  creditBalance: number;
  openingCreditAmount: number;
  applied: boolean;
  decision: PromotionEntryDecision;
  reason: string | null;
};

export type PromotionPreviewResult = {
  run: PromotionRunSummary;
  entries: PromotionEntryRow[];
  unmatchedClasses: string[];
  feeSetupGaps: string[];
};

type ClassRow = {
  id: string;
  session_label: string;
  class_name: string;
  section: string | null;
  stream_name: string | null;
};

type StudentRow = {
  id: string;
  full_name: string;
  admission_no: string;
  status: StudentStatus;
  class_id: string;
  class_ref:
    | { id: string; session_label: string; class_name: string; section: string | null; stream_name: string | null }
    | { id: string; session_label: string; class_name: string; section: string | null; stream_name: string | null }[]
    | null;
};

function classRefAsSingle(value: StudentRow["class_ref"]) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function buildClassLookupKey(value: { class_name: string; section: string | null; stream_name: string | null }) {
  return [
    value.class_name.trim().toLowerCase(),
    (value.section ?? "").trim().toLowerCase(),
    (value.stream_name ?? "").trim().toLowerCase(),
  ].join("|");
}

function classLabel(value: { class_name: string; section: string | null; stream_name: string | null } | null) {
  if (!value) return "Unknown class";
  const parts = [value.class_name];
  if (value.section?.trim()) parts.push(value.section.trim());
  if (value.stream_name?.trim()) parts.push(`(${value.stream_name.trim()})`);
  return parts.join(" ");
}

function computeNextClassName(currentName: string): { nextName: string | null; graduates: boolean } {
  const trimmed = currentName.trim();
  const match = trimmed.match(/^(class|grade|std|standard)?\s*([0-9]+|nursery|lkg|ukg|pre[-\s]?nursery|prep|kg1|kg2)\s*$/i);
  if (!match) return { nextName: null, graduates: false };

  const prefix = match[1] ?? "Class";
  const numericValue = match[2];

  if (/^\d+$/.test(numericValue)) {
    const next = Number.parseInt(numericValue, 10) + 1;
    if (Number.parseInt(numericValue, 10) >= 12) {
      return { nextName: null, graduates: true };
    }
    return { nextName: `${prefix} ${next}`.replace(/\s+/g, " ").trim(), graduates: false };
  }

  const lowerName = numericValue.toLowerCase().replace(/[-\s]/g, "");

  if (lowerName === "prenursery" || lowerName === "playgroup") {
    return { nextName: `${prefix} Nursery`.replace(/\s+/g, " ").trim(), graduates: false };
  }
  if (lowerName === "nursery") {
    return { nextName: `${prefix} LKG`.replace(/\s+/g, " ").trim(), graduates: false };
  }
  if (lowerName === "lkg" || lowerName === "kg1") {
    return { nextName: `${prefix} UKG`.replace(/\s+/g, " ").trim(), graduates: false };
  }
  if (lowerName === "ukg" || lowerName === "kg2" || lowerName === "prep") {
    return { nextName: `${prefix} 1`.replace(/\s+/g, " ").trim(), graduates: false };
  }

  return { nextName: null, graduates: false };
}

export async function listPromotionRuns(limit = 25): Promise<PromotionRunSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("promotion_runs")
    .select(
      "id, source_session_label, target_session_label, status, triggered_at, applied_at, rolled_back_at, preview_count, applied_count, graduated_count, credit_carry_forward_count, credit_carry_forward_total, notes",
    )
    .order("triggered_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Unable to load promotion runs: ${error.message}`);
  }

  return ((data ?? []) as Array<{
    id: string;
    source_session_label: string;
    target_session_label: string;
    status: PromotionRunStatus;
    triggered_at: string;
    applied_at: string | null;
    rolled_back_at: string | null;
    preview_count: number;
    applied_count: number;
    graduated_count: number;
    credit_carry_forward_count: number;
    credit_carry_forward_total: number;
    notes: string | null;
  }>).map((row) => ({
    id: row.id,
    sourceSessionLabel: row.source_session_label,
    targetSessionLabel: row.target_session_label,
    status: row.status,
    triggeredAt: row.triggered_at,
    appliedAt: row.applied_at,
    rolledBackAt: row.rolled_back_at,
    previewCount: row.preview_count,
    appliedCount: row.applied_count,
    graduatedCount: row.graduated_count,
    creditCarryForwardCount: row.credit_carry_forward_count,
    creditCarryForwardTotal: row.credit_carry_forward_total,
    notes: row.notes,
  }));
}

export async function getPromotionRun(runId: string): Promise<PromotionPreviewResult | null> {
  const supabase = await createClient();

  const [runResult, entriesResult] = await Promise.all([
    supabase
      .from("promotion_runs")
      .select(
        "id, source_session_label, target_session_label, status, triggered_at, applied_at, rolled_back_at, preview_count, applied_count, graduated_count, credit_carry_forward_count, credit_carry_forward_total, notes",
      )
      .eq("id", runId)
      .maybeSingle(),
    supabase
      .from("promotion_run_entries")
      .select(
        "id, run_id, student_id, previous_class_id, new_class_id, previous_status, new_status, credit_balance, opening_credit_amount, applied, decision, reason",
      )
      .eq("run_id", runId)
      .order("created_at", { ascending: true }),
  ]);

  if (runResult.error) {
    throw new Error(`Unable to load promotion run: ${runResult.error.message}`);
  }

  if (!runResult.data) return null;

  const runRow = runResult.data as {
    id: string;
    source_session_label: string;
    target_session_label: string;
    status: PromotionRunStatus;
    triggered_at: string;
    applied_at: string | null;
    rolled_back_at: string | null;
    preview_count: number;
    applied_count: number;
    graduated_count: number;
    credit_carry_forward_count: number;
    credit_carry_forward_total: number;
    notes: string | null;
  };

  const entriesRaw = (entriesResult.data ?? []) as Array<{
    id: string;
    run_id: string;
    student_id: string;
    previous_class_id: string | null;
    new_class_id: string | null;
    previous_status: StudentStatus | null;
    new_status: StudentStatus | null;
    credit_balance: number;
    opening_credit_amount: number;
    applied: boolean;
    decision: PromotionEntryDecision;
    reason: string | null;
  }>;

  const studentIds = entriesRaw.map((row) => row.student_id);
  const classIds = Array.from(
    new Set(
      entriesRaw
        .flatMap((row) => [row.previous_class_id, row.new_class_id])
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const [studentsResult, classesResult] = await Promise.all([
    studentIds.length > 0
      ? supabase
          .from("students")
          .select("id, full_name, admission_no")
          .in("id", studentIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string; admission_no: string }>, error: null as null | { message: string } }),
    classIds.length > 0
      ? supabase
          .from("classes")
          .select("id, class_name, section, stream_name, session_label")
          .in("id", classIds)
      : Promise.resolve({ data: [] as ClassRow[], error: null as null | { message: string } }),
  ]);

  if (studentsResult.error) {
    throw new Error(`Unable to load students for run: ${studentsResult.error.message}`);
  }
  if (classesResult.error) {
    throw new Error(`Unable to load classes for run: ${classesResult.error.message}`);
  }

  const studentMap = new Map(
    ((studentsResult.data ?? []) as Array<{ id: string; full_name: string; admission_no: string }>).map((row) => [row.id, row]),
  );
  const classMap = new Map(
    ((classesResult.data ?? []) as ClassRow[]).map((row) => [row.id, row]),
  );

  const entries: PromotionEntryRow[] = entriesRaw.map((row) => {
    const student = studentMap.get(row.student_id) ?? null;
    return {
      id: row.id,
      runId: row.run_id,
      studentId: row.student_id,
      studentName: student?.full_name ?? "Unknown student",
      studentAdmissionNo: student?.admission_no ?? "",
      previousClassId: row.previous_class_id,
      previousClassLabel: classLabel(row.previous_class_id ? classMap.get(row.previous_class_id) ?? null : null),
      newClassId: row.new_class_id,
      newClassLabel: classLabel(row.new_class_id ? classMap.get(row.new_class_id) ?? null : null),
      previousStatus: row.previous_status,
      newStatus: row.new_status,
      creditBalance: row.credit_balance,
      openingCreditAmount: row.opening_credit_amount,
      applied: row.applied,
      decision: row.decision,
      reason: row.reason,
    };
  });

  return {
    run: {
      id: runRow.id,
      sourceSessionLabel: runRow.source_session_label,
      targetSessionLabel: runRow.target_session_label,
      status: runRow.status,
      triggeredAt: runRow.triggered_at,
      appliedAt: runRow.applied_at,
      rolledBackAt: runRow.rolled_back_at,
      previewCount: runRow.preview_count,
      appliedCount: runRow.applied_count,
      graduatedCount: runRow.graduated_count,
      creditCarryForwardCount: runRow.credit_carry_forward_count,
      creditCarryForwardTotal: runRow.credit_carry_forward_total,
      notes: runRow.notes,
    },
    entries,
    unmatchedClasses: [],
    feeSetupGaps: [],
  };
}

async function loadCreditBalances(
  studentIds: readonly string[],
): Promise<Map<string, number>> {
  if (studentIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_student_financial_state")
    .select("student_id, credit_balance")
    .in("student_id", studentIds);

  if (error) {
    if (error.message.toLowerCase().includes("does not exist")) return new Map();
    throw new Error(`Unable to load credit balances: ${error.message}`);
  }

  return new Map(
    ((data ?? []) as Array<{ student_id: string; credit_balance: number | null }>).map((row) => [
      row.student_id,
      row.credit_balance ?? 0,
    ]),
  );
}

export async function createPromotionPreview(payload: {
  sourceSessionLabel: string;
  targetSessionLabel: string;
}): Promise<PromotionPreviewResult> {
  const staff = await requireStaffPermission("students:write");
  const sourceSession = payload.sourceSessionLabel.trim();
  const targetSession = payload.targetSessionLabel.trim();

  if (!sourceSession || !targetSession) {
    throw new Error("Source and target sessions are required.");
  }

  if (sourceSession.toLowerCase() === targetSession.toLowerCase()) {
    throw new Error("Source and target sessions must be different.");
  }

  const supabase = await createClient();

  // Professional transfer: if the target session does not exist yet, create it
  // by copying the source session's setup — classes, fee policy, conventional
  // discount policies, and per-class fee settings. Routes are global and shared
  // automatically. All copied values stay editable in Fee Setup afterwards.
  const { data: existingTargetSession, error: existingTargetSessionError } = await supabase
    .from("academic_sessions")
    .select("id")
    .ilike("session_label", targetSession)
    .maybeSingle();

  if (existingTargetSessionError) {
    throw new Error(`Unable to check target session: ${existingTargetSessionError.message}`);
  }

  if (!existingTargetSession) {
    // Creating the next session writes academic_sessions / fee_policy_configs /
    // classes / fee_settings rows, which RLS gates on settings:write.
    await requireStaffPermission("settings:write");
    await copyAcademicSessionSetup({
      sourceSessionLabel: sourceSession,
      targetSessionLabel: targetSession,
    });
  }

  const [sourceClassesResult, targetClassesResult] = await Promise.all([
    supabase
      .from("classes")
      .select("id, session_label, class_name, section, stream_name")
      .eq("session_label", sourceSession),
    supabase
      .from("classes")
      .select("id, session_label, class_name, section, stream_name")
      .eq("session_label", targetSession),
  ]);

  if (sourceClassesResult.error) {
    throw new Error(`Unable to load source classes: ${sourceClassesResult.error.message}`);
  }
  if (targetClassesResult.error) {
    throw new Error(`Unable to load target classes: ${targetClassesResult.error.message}`);
  }

  const sourceClasses = ((sourceClassesResult.data ?? []) as ClassRow[]);
  const targetClasses = ((targetClassesResult.data ?? []) as ClassRow[]);
  const sourceClassIds = sourceClasses.map((row) => row.id);

  if (sourceClasses.length === 0) {
    throw new Error(`No classes found for source session ${sourceSession}.`);
  }
  if (targetClasses.length === 0) {
    throw new Error(`No classes found for target session ${targetSession}. Add target session classes first.`);
  }

  const targetClassByKey = new Map(targetClasses.map((row) => [buildClassLookupKey(row), row]));

  const studentsResult = await supabase
    .from("students")
    .select(
      "id, full_name, admission_no, status, class_id, class_ref:classes(id, session_label, class_name, section, stream_name)",
    )
    .in("class_id", sourceClassIds)
    .in("status", ["active", "inactive"]);

  if (studentsResult.error) {
    throw new Error(`Unable to load source-session students: ${studentsResult.error.message}`);
  }

  const studentRows = ((studentsResult.data ?? []) as StudentRow[]).filter(
    (row) => classRefAsSingle(row.class_ref) !== null,
  );

  const studentIds = studentRows.map((row) => row.id);
  const creditMap = await loadCreditBalances(studentIds);

  const unmatchedClassNames = new Set<string>();
  const feeSetupGapsSet = new Set<string>();

  const targetClassIdsNeeded = new Set<string>();
  const entriesPlan: Array<{
    student: StudentRow;
    nextClass: ClassRow | null;
    graduates: boolean;
    creditBalance: number;
  }> = [];

  for (const student of studentRows) {
    const sourceClass = classRefAsSingle(student.class_ref);
    if (!sourceClass) continue;
    const { nextName, graduates } = computeNextClassName(sourceClass.class_name);
    const credit = creditMap.get(student.id) ?? 0;

    if (graduates) {
      entriesPlan.push({
        student,
        nextClass: null,
        graduates: true,
        creditBalance: credit,
      });
      continue;
    }

    if (!nextName) {
      unmatchedClassNames.add(sourceClass.class_name);
      entriesPlan.push({
        student,
        nextClass: null,
        graduates: false,
        creditBalance: credit,
      });
      continue;
    }

    const candidateKey = buildClassLookupKey({
      class_name: nextName,
      section: sourceClass.section,
      stream_name: sourceClass.stream_name,
    });
    const fallbackKey = buildClassLookupKey({
      class_name: nextName,
      section: null,
      stream_name: null,
    });

    const candidate =
      targetClassByKey.get(candidateKey) ?? targetClassByKey.get(fallbackKey) ?? null;

    if (!candidate) {
      unmatchedClassNames.add(nextName);
    }

    if (candidate) {
      targetClassIdsNeeded.add(candidate.id);
    }

    entriesPlan.push({
      student,
      nextClass: candidate,
      graduates: false,
      creditBalance: credit,
    });
  }

  // Verify each promoted-to class has an active fee_settings row.
  if (targetClassIdsNeeded.size > 0) {
    const feeSettingsResult = await supabase
      .from("fee_settings")
      .select("class_id")
      .in("class_id", [...targetClassIdsNeeded])
      .eq("is_active", true);

    if (feeSettingsResult.error) {
      throw new Error(`Unable to verify fee settings: ${feeSettingsResult.error.message}`);
    }

    const classesWithFeeSettings = new Set(
      ((feeSettingsResult.data ?? []) as Array<{ class_id: string }>).map((row) => row.class_id),
    );

    for (const classId of targetClassIdsNeeded) {
      if (!classesWithFeeSettings.has(classId)) {
        const targetClass = targetClasses.find((row) => row.id === classId);
        if (targetClass) feeSetupGapsSet.add(classLabel(targetClass));
      }
    }
  }

  const previewCount = entriesPlan.length;
  const graduatedCount = entriesPlan.filter((entry) => entry.graduates).length;
  const creditEntries = entriesPlan.filter((entry) => entry.creditBalance > 0);
  const creditCarryForwardCount = creditEntries.length;
  const creditCarryForwardTotal = creditEntries.reduce(
    (sum, entry) => sum + entry.creditBalance,
    0,
  );

  const { data: insertedRun, error: insertRunError } = await supabase
    .from("promotion_runs")
    .insert({
      source_session_label: sourceSession,
      target_session_label: targetSession,
      status: "preview",
      triggered_by: (staff?.id as string | undefined) ?? null,
      preview_count: previewCount,
      applied_count: 0,
      graduated_count: graduatedCount,
      credit_carry_forward_count: creditCarryForwardCount,
      credit_carry_forward_total: creditCarryForwardTotal,
    })
    .select("id")
    .single();

  if (insertRunError || !insertedRun) {
    throw new Error(`Unable to save promotion preview: ${insertRunError?.message ?? "unknown"}`);
  }

  const runId = insertedRun.id as string;

  const entryRows = entriesPlan.map((entry) => {
    const decision: PromotionEntryDecision = entry.graduates
      ? "graduate"
      : entry.nextClass
        ? "promote"
        : "manual";

    return {
      run_id: runId,
      student_id: entry.student.id,
      previous_class_id: entry.student.class_id,
      new_class_id: entry.nextClass?.id ?? null,
      previous_status: entry.student.status,
      new_status: entry.graduates ? ("graduated" as StudentStatus) : entry.student.status,
      credit_balance: entry.creditBalance,
      opening_credit_amount: entry.creditBalance,
      applied: false,
      decision,
      reason: entry.graduates
        ? "Last grade reached"
        : entry.nextClass
          ? null
          : "No matching class in target session",
    };
  });

  if (entryRows.length > 0) {
    const chunkSize = 200;
    for (let i = 0; i < entryRows.length; i += chunkSize) {
      const chunk = entryRows.slice(i, i + chunkSize);
      const { error: insertEntriesError } = await supabase
        .from("promotion_run_entries")
        .insert(chunk);
      if (insertEntriesError) {
        throw new Error(`Unable to save promotion preview rows: ${insertEntriesError.message}`);
      }
    }
  }

  const fullRun = await getPromotionRun(runId);
  if (!fullRun) {
    throw new Error("Promotion run created but could not be re-read.");
  }

  return {
    ...fullRun,
    unmatchedClasses: [...unmatchedClassNames].sort(),
    feeSetupGaps: [...feeSetupGapsSet].sort(),
  };
}

export async function applyPromotionRun(runId: string) {
  await requireStaffPermission("students:write");
  const supabase = await createClient();

  const runDetail = await getPromotionRun(runId);
  if (!runDetail) {
    throw new Error("Promotion run not found.");
  }
  if (runDetail.run.status !== "preview") {
    throw new Error(`Promotion run is already ${runDetail.run.status}.`);
  }

  const eligibleEntries = runDetail.entries.filter(
    (entry) => entry.decision === "promote" || entry.decision === "graduate",
  );

  if (eligibleEntries.length === 0) {
    throw new Error("No entries are eligible to apply. Mark students for promotion or graduation first.");
  }

  let appliedCount = 0;
  let graduatedCount = 0;
  let creditCarryForwardCount = 0;
  let creditCarryForwardTotal = 0;
  const affectedStudentIds: string[] = [];

  for (const entry of eligibleEntries) {
    const updates: Record<string, unknown> = {};
    if (entry.decision === "promote" && entry.newClassId) {
      updates.class_id = entry.newClassId;
    } else if (entry.decision === "graduate") {
      updates.status = "graduated";
    }

    if (Object.keys(updates).length === 0) continue;

    const { error: studentUpdateError } = await supabase
      .from("students")
      .update(updates)
      .eq("id", entry.studentId);

    if (studentUpdateError) {
      throw new Error(`Failed to update student ${entry.studentName}: ${studentUpdateError.message}`);
    }

    affectedStudentIds.push(entry.studentId);

    if (entry.decision === "graduate") {
      graduatedCount += 1;
    } else {
      appliedCount += 1;
    }

    if (entry.openingCreditAmount > 0 && entry.decision === "promote" && entry.newClassId) {
      const { data: feeSettingRow, error: feeSettingError } = await supabase
        .from("fee_settings")
        .select("id")
        .eq("class_id", entry.newClassId)
        .eq("is_active", true)
        .maybeSingle();

      if (feeSettingError) {
        throw new Error(`Failed to load fee setting for ${entry.newClassLabel}: ${feeSettingError.message}`);
      }

      if (feeSettingRow) {
        const { data: existingOverride, error: overrideLookupError } = await supabase
          .from("student_fee_overrides")
          .select("id, discount_amount, notes, reason")
          .eq("student_id", entry.studentId)
          .eq("is_active", true)
          .maybeSingle();

        if (overrideLookupError) {
          throw new Error(`Failed to load override for ${entry.studentName}: ${overrideLookupError.message}`);
        }

        const carryNote = `Credit carried forward from ${runDetail.run.sourceSessionLabel}: ₹${entry.openingCreditAmount}.`;

        if (existingOverride) {
          const nextDiscount = (existingOverride.discount_amount ?? 0) + entry.openingCreditAmount;
          const { error: overrideUpdateError } = await supabase
            .from("student_fee_overrides")
            .update({
              fee_setting_id: feeSettingRow.id,
              discount_amount: nextDiscount,
              notes: existingOverride.notes
                ? `${existingOverride.notes}\n${carryNote}`
                : carryNote,
              reason: existingOverride.reason ?? "Credit carried forward at promotion",
            })
            .eq("id", existingOverride.id);

          if (overrideUpdateError) {
            throw new Error(`Failed to update override for ${entry.studentName}: ${overrideUpdateError.message}`);
          }
        } else {
          const { error: overrideInsertError } = await supabase
            .from("student_fee_overrides")
            .insert({
              student_id: entry.studentId,
              fee_setting_id: feeSettingRow.id,
              discount_amount: entry.openingCreditAmount,
              notes: carryNote,
              reason: "Credit carried forward at promotion",
              is_active: true,
            });

          if (overrideInsertError) {
            throw new Error(`Failed to create override for ${entry.studentName}: ${overrideInsertError.message}`);
          }
        }

        creditCarryForwardCount += 1;
        creditCarryForwardTotal += entry.openingCreditAmount;
      }
    }

    const { error: entryUpdateError } = await supabase
      .from("promotion_run_entries")
      .update({
        applied: true,
      })
      .eq("id", entry.id);

    if (entryUpdateError) {
      throw new Error(`Failed to mark entry applied: ${entryUpdateError.message}`);
    }
  }

  const { error: runUpdateError } = await supabase
    .from("promotion_runs")
    .update({
      status: "applied",
      applied_at: new Date().toISOString(),
      applied_count: appliedCount,
      graduated_count: graduatedCount,
      credit_carry_forward_count: creditCarryForwardCount,
      credit_carry_forward_total: creditCarryForwardTotal,
    })
    .eq("id", runId);

  if (runUpdateError) {
    throw new Error(`Failed to mark run applied: ${runUpdateError.message}`);
  }

  if (affectedStudentIds.length > 0) {
    try {
      await prepareDuesForStudentsAutomatically({
        studentIds: affectedStudentIds,
        reason: `Promotion run ${runId}`,
      });
    } catch (error) {
      console.error("Promotion dues prep failed", error);
    }
    revalidateFinanceSurfaces({ studentIds: affectedStudentIds });
  }

  return {
    runId,
    appliedCount,
    graduatedCount,
    creditCarryForwardCount,
    creditCarryForwardTotal,
  };
}

export async function rollbackPromotionRun(runId: string) {
  await requireStaffPermission("students:write");
  const supabase = await createClient();

  const runDetail = await getPromotionRun(runId);
  if (!runDetail) {
    throw new Error("Promotion run not found.");
  }
  if (runDetail.run.status !== "applied") {
    throw new Error(`Promotion run is ${runDetail.run.status}; only applied runs can be rolled back.`);
  }

  const affectedStudentIds: string[] = [];

  for (const entry of runDetail.entries) {
    if (!entry.applied) continue;

    const updates: Record<string, unknown> = {};

    if (entry.decision === "promote" && entry.previousClassId) {
      updates.class_id = entry.previousClassId;
    }
    if (entry.decision === "graduate" && entry.previousStatus) {
      updates.status = entry.previousStatus;
    }

    if (Object.keys(updates).length > 0) {
      const { error: studentUpdateError } = await supabase
        .from("students")
        .update(updates)
        .eq("id", entry.studentId);
      if (studentUpdateError) {
        throw new Error(`Failed to roll back ${entry.studentName}: ${studentUpdateError.message}`);
      }
      affectedStudentIds.push(entry.studentId);
    }

    if (entry.openingCreditAmount > 0) {
      const { data: existingOverride } = await supabase
        .from("student_fee_overrides")
        .select("id, discount_amount, notes")
        .eq("student_id", entry.studentId)
        .eq("is_active", true)
        .maybeSingle();

      if (existingOverride) {
        const remainingDiscount = Math.max(0, (existingOverride.discount_amount ?? 0) - entry.openingCreditAmount);
        const carryNote = `Credit carried forward from ${runDetail.run.sourceSessionLabel}: ₹${entry.openingCreditAmount}.`;
        const cleanedNotes = (existingOverride.notes ?? "")
          .split("\n")
          .filter((line: string) => line !== carryNote)
          .join("\n")
          .trim();

        const { error: overrideUpdateError } = await supabase
          .from("student_fee_overrides")
          .update({
            discount_amount: remainingDiscount,
            notes: cleanedNotes.length > 0 ? cleanedNotes : null,
          })
          .eq("id", existingOverride.id);

        if (overrideUpdateError) {
          throw new Error(`Failed to roll back credit for ${entry.studentName}: ${overrideUpdateError.message}`);
        }
      }
    }

    await supabase
      .from("promotion_run_entries")
      .update({ applied: false })
      .eq("id", entry.id);
  }

  const { error: runUpdateError } = await supabase
    .from("promotion_runs")
    .update({
      status: "rolled_back",
      rolled_back_at: new Date().toISOString(),
    })
    .eq("id", runId);

  if (runUpdateError) {
    throw new Error(`Failed to mark run rolled back: ${runUpdateError.message}`);
  }

  if (affectedStudentIds.length > 0) {
    try {
      await prepareDuesForStudentsAutomatically({
        studentIds: affectedStudentIds,
        reason: `Promotion rollback ${runId}`,
      });
    } catch (error) {
      console.error("Rollback dues prep failed", error);
    }
    revalidateFinanceSurfaces({ studentIds: affectedStudentIds });
  }

  return { runId };
}

export async function updatePromotionEntryDecision(payload: {
  runId: string;
  entryId: string;
  decision: PromotionEntryDecision;
}) {
  await requireStaffPermission("students:write");
  const supabase = await createClient();

  const { error } = await supabase
    .from("promotion_run_entries")
    .update({ decision: payload.decision })
    .eq("id", payload.entryId)
    .eq("run_id", payload.runId);

  if (error) {
    throw new Error(`Unable to update decision: ${error.message}`);
  }
}
