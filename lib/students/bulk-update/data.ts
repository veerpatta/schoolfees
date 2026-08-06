import "server-only";

import {
  buildLookupResolver,
  type BulkUpdateRowResult,
  type BulkUpdateSnapshotStudent,
} from "@/lib/students/bulk-update/diff";
import type { BulkUpdateField } from "@/lib/students/bulk-update/fields";
import { compareStudentRowsByName } from "@/lib/students/sort";
import { createClient } from "@/lib/supabase/server";

/**
 * How many student UPDATEs are in flight at once.
 *
 * The staged student import commits rows strictly one at a time, which is why a
 * 531-row file ran for 299s and was killed at the platform's 300s ceiling with
 * no resume (batch 59fb0977, 2026-08-06). Bounded concurrency keeps a 500-row
 * apply in the low seconds while staying well clear of the connection pool.
 */
const APPLY_CONCURRENCY = 20;

export type BulkUpdateClassOption = {
  classId: string;
  label: string;
  sessionLabel: string;
  studentCount: number;
};

type ClassRow = {
  id: string;
  session_label: string;
  class_name: string;
  section: string | null;
  stream_name: string | null;
  sort_order: number | null;
};

export function formatClassLabel(row: {
  class_name: string;
  section: string | null;
  stream_name: string | null;
}) {
  return [row.class_name, row.section, row.stream_name].filter(Boolean).join(" - ");
}

export async function getBulkUpdateClassOptions(
  sessionLabel: string,
): Promise<BulkUpdateClassOption[]> {
  const supabase = await createClient();

  const [{ data: classRows, error: classError }, { data: studentRows, error: studentError }] =
    await Promise.all([
      supabase
        .from("classes")
        .select("id, session_label, class_name, section, stream_name, sort_order")
        .eq("session_label", sessionLabel)
        .order("sort_order", { ascending: true })
        .order("class_name", { ascending: true }),
      supabase.from("students").select("class_id"),
    ]);

  if (classError) {
    throw new Error(`Unable to load classes: ${classError.message}`);
  }

  if (studentError) {
    throw new Error(`Unable to count students: ${studentError.message}`);
  }

  const counts = new Map<string, number>();
  for (const row of (studentRows ?? []) as Array<{ class_id: string | null }>) {
    if (row.class_id) {
      counts.set(row.class_id, (counts.get(row.class_id) ?? 0) + 1);
    }
  }

  return ((classRows ?? []) as ClassRow[]).map((row) => ({
    classId: row.id,
    label: formatClassLabel(row),
    sessionLabel: row.session_label,
    studentCount: counts.get(row.id) ?? 0,
  }));
}

export async function getBulkUpdateRouteOptions() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transport_routes")
    .select("id, route_name, route_code")
    .eq("is_active", true)
    .order("route_name", { ascending: true });

  if (error) {
    throw new Error(`Unable to load transport routes: ${error.message}`);
  }

  return ((data ?? []) as Array<{ id: string; route_name: string; route_code: string | null }>).map(
    (row) => ({ id: row.id, label: row.route_name, code: row.route_code }),
  );
}

type StudentSnapshotRow = {
  id: string;
  admission_no: string;
  full_name: string;
  primary_phone: string | null;
  secondary_phone: string | null;
  father_name: string | null;
  mother_name: string | null;
  email: string | null;
  date_of_birth: string | null;
  address: string | null;
  class_id: string;
  transport_route_id: string | null;
  status: string;
  notes: string | null;
};

const SNAPSHOT_COLUMNS =
  "id, admission_no, full_name, primary_phone, secondary_phone, father_name, mother_name, email, date_of_birth, address, class_id, transport_route_id, status, notes";

function toSnapshotStudent(
  row: StudentSnapshotRow,
  studentType: string | null,
): BulkUpdateSnapshotStudent {
  return {
    studentId: row.id,
    admissionNo: row.admission_no,
    fullName: row.full_name,
    values: {
      fatherPhone: row.primary_phone,
      motherPhone: row.secondary_phone,
      fatherName: row.father_name,
      motherName: row.mother_name,
      email: row.email,
      dateOfBirth: row.date_of_birth,
      address: row.address,
      class: row.class_id,
      route: row.transport_route_id,
      status: row.status,
      notes: row.notes,
      // A student with no active override row has no stored type, and the fee
      // engine reads that absence as "existing" (Rs 500). Mirror that here so
      // the preview compares against what the student is actually billed,
      // rather than showing a spurious change for every such student.
      studentType: studentType ?? "existing",
    },
  };
}

/**
 * Loads the students the sheet is allowed to touch. Scoping the snapshot to the
 * chosen classes is the outer safety net: a row for a student in another class
 * simply will not match, so an edited or pasted-together sheet cannot reach
 * beyond the selection the user made.
 */
export async function loadBulkUpdateSnapshot(classIds: readonly string[]) {
  if (classIds.length === 0) {
    return [] as BulkUpdateSnapshotStudent[];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("students")
    .select(SNAPSHOT_COLUMNS)
    .in("class_id", classIds)
    .order("full_name", { ascending: true });

  if (error) {
    throw new Error(`Unable to load students for these classes: ${error.message}`);
  }

  // Re-sorted in JS so the order does not depend on the database collation.
  const rows = ((data ?? []) as StudentSnapshotRow[]).sort(compareStudentRowsByName);

  if (rows.length === 0) {
    return [] as BulkUpdateSnapshotStudent[];
  }

  const { data: overrideRows, error: overrideError } = await supabase
    .from("student_fee_overrides")
    .select("student_id, student_type_override")
    .in(
      "student_id",
      rows.map((row) => row.id),
    )
    .eq("is_active", true);

  if (overrideError) {
    throw new Error(`Unable to load student fee profiles: ${overrideError.message}`);
  }

  const typeByStudent = new Map(
    ((overrideRows ?? []) as Array<{ student_id: string; student_type_override: string | null }>)
      .map((row) => [row.student_id, row.student_type_override]),
  );

  return rows.map((row) => toSnapshotStudent(row, typeByStudent.get(row.id) ?? null));
}

export async function buildBulkUpdateLookups(sessionLabel: string) {
  const [classes, routes] = await Promise.all([
    getBulkUpdateClassOptions(sessionLabel),
    getBulkUpdateRouteOptions(),
  ]);

  return {
    classes,
    routes,
    resolver: buildLookupResolver({
      classes: classes.map((item) => ({ id: item.classId, label: item.label })),
      routes,
    }),
  };
}

export type BulkUpdateApplyOutcome = {
  updatedStudentCount: number;
  updatedFieldCount: number;
  failures: Array<{ admissionNo: string; message: string }>;
};

async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
) {
  let cursor = 0;

  async function pump() {
    for (;;) {
      const index = cursor++;

      if (index >= items.length) {
        return;
      }

      await worker(items[index]!);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, pump));
}

/** Reason stamped on any fee-override row this workspace creates or edits. */
const OVERRIDE_REASON = "Bulk student update";

/**
 * Finds the active fee setting for a student's class. Required because
 * `student_fee_overrides.fee_setting_id` is NOT NULL, so a student who has
 * never had an override cannot get one without it.
 */
async function resolveFeeSettingIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studentIds: readonly string[],
) {
  const { data: students, error: studentError } = await supabase
    .from("students")
    .select("id, class_id")
    .in("id", studentIds);

  if (studentError) {
    throw new Error(`Unable to resolve classes for fee profiles: ${studentError.message}`);
  }

  const classIds = [
    ...new Set(
      ((students ?? []) as Array<{ id: string; class_id: string }>).map((row) => row.class_id),
    ),
  ];

  const { data: settings, error: settingError } = await supabase
    .from("fee_settings")
    .select("id, class_id")
    .in("class_id", classIds)
    .eq("is_active", true);

  if (settingError) {
    throw new Error(`Unable to resolve fee settings: ${settingError.message}`);
  }

  const settingByClass = new Map(
    ((settings ?? []) as Array<{ id: string; class_id: string }>).map((row) => [
      row.class_id,
      row.id,
    ]),
  );

  return new Map(
    ((students ?? []) as Array<{ id: string; class_id: string }>).map((row) => [
      row.id,
      settingByClass.get(row.class_id) ?? null,
    ]),
  );
}

/**
 * Writes the previewed changes. Per student it is one UPDATE on `students` for
 * the ordinary columns, plus at most one fee-override upsert — so a student is
 * never left half-updated.
 */
export async function applyBulkUpdate(
  rows: readonly BulkUpdateRowResult[],
): Promise<BulkUpdateApplyOutcome> {
  const supabase = await createClient();
  const failures: BulkUpdateApplyOutcome["failures"] = [];
  let updatedStudentCount = 0;
  let updatedFieldCount = 0;

  const applicable = rows.filter(
    (row) => row.studentId && row.changes.length > 0 && row.errors.length === 0,
  );

  // Only pay for the lookup when a fee-profile field is actually in play.
  const needsOverride = applicable.filter((row) =>
    row.changes.some((change) => change.target === "feeOverride"),
  );
  const feeSettingByStudent =
    needsOverride.length > 0
      ? await resolveFeeSettingIds(
          supabase,
          needsOverride.map((row) => row.studentId!),
        )
      : new Map<string, string | null>();

  await runWithConcurrency(applicable, APPLY_CONCURRENCY, async (row) => {
    const studentId = row.studentId!;
    const studentPatch: Record<string, string | null> = {};
    const overridePatch: Record<string, string | null> = {};

    for (const change of row.changes) {
      if (change.target === "feeOverride") {
        overridePatch[change.column] = change.toValue;
      } else {
        studentPatch[change.column] = change.toValue;
      }
    }

    if (Object.keys(studentPatch).length > 0) {
      const { error } = await supabase.from("students").update(studentPatch).eq("id", studentId);

      if (error) {
        failures.push({ admissionNo: row.admissionNo, message: error.message });
        return;
      }
    }

    if (Object.keys(overridePatch).length > 0) {
      const { data: existing, error: readError } = await supabase
        .from("student_fee_overrides")
        .select("id")
        .eq("student_id", studentId)
        .eq("is_active", true)
        .limit(1);

      if (readError) {
        failures.push({ admissionNo: row.admissionNo, message: readError.message });
        return;
      }

      const existingId = ((existing ?? []) as Array<{ id: string }>)[0]?.id ?? null;

      if (existingId) {
        const { error } = await supabase
          .from("student_fee_overrides")
          .update({ ...overridePatch, reason: OVERRIDE_REASON })
          .eq("id", existingId);

        if (error) {
          failures.push({ admissionNo: row.admissionNo, message: error.message });
          return;
        }
      } else {
        const feeSettingId = feeSettingByStudent.get(studentId) ?? null;

        if (!feeSettingId) {
          failures.push({
            admissionNo: row.admissionNo,
            message:
              "No active fee setting for this student's class, so a fee profile could not be created. Save class fees in Fee Setup first.",
          });
          return;
        }

        const { error } = await supabase.from("student_fee_overrides").insert({
          student_id: studentId,
          fee_setting_id: feeSettingId,
          is_active: true,
          reason: OVERRIDE_REASON,
          ...overridePatch,
        });

        if (error) {
          failures.push({ admissionNo: row.admissionNo, message: error.message });
          return;
        }
      }
    }

    updatedStudentCount += 1;
    updatedFieldCount += row.changes.length;
  });

  return { updatedStudentCount, updatedFieldCount, failures };
}

export type { BulkUpdateField };
