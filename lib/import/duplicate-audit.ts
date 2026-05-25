import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getMappedCellValue } from "@/lib/import/mapping";
import { stringifyImportCell } from "@/lib/import/validation";
import type {
  DuplicateAuditCandidate,
  DuplicateAuditDecision,
  DuplicateAuditMatchKind,
  DuplicateAuditRow,
  DuplicateAuditSummary,
  RawImportRowPayload,
  StudentImportColumnMapping,
} from "@/lib/import/types";

type ImportRowAuditRecord = {
  id: string;
  row_index: number;
  raw_payload: unknown;
  status: string;
  duplicate_audit_decision: string | null;
  duplicate_audit_target_student_id: string | null;
};

type ImportBatchAuditRecord = {
  id: string;
  status: string;
  import_mode: string | null;
  target_session_label: string | null;
  column_mapping: unknown;
};

type ExistingStudentAuditRow = {
  id: string;
  full_name: string;
  admission_no: string;
  father_name: string | null;
  primary_phone: string | null;
  secondary_phone: string | null;
  class_ref:
    | { label: string; session_label: string }
    | Array<{ label: string; session_label: string }>
    | null;
};

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizePhone(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const digits = value.replace(/\D+/g, "");

  if (digits.length === 0) {
    return "";
  }

  return digits.slice(-10);
}

function toColumnMapping(value: unknown): StudentImportColumnMapping {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, mappingValue]) => {
      if (typeof mappingValue !== "string" || !mappingValue.trim()) {
        return [];
      }

      return [[key, mappingValue]];
    }),
  ) as StudentImportColumnMapping;
}

function toRawPayload(value: unknown): RawImportRowPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
      key,
      entryValue === null ||
      typeof entryValue === "string" ||
      typeof entryValue === "number" ||
      typeof entryValue === "boolean"
        ? entryValue
        : null,
    ]),
  );
}

function toSingleRecord<T>(value: T | T[] | null) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function toDecision(value: unknown): DuplicateAuditDecision | null {
  if (
    value === "proceed_new" ||
    value === "mark_duplicate" ||
    value === "mark_update"
  ) {
    return value;
  }

  return null;
}

export async function getDuplicateAuditSummary(batchId: string): Promise<DuplicateAuditSummary> {
  const supabase = await createClient();

  const { data: batchData, error: batchError } = await supabase
    .from("import_batches")
    .select("id, status, import_mode, target_session_label, column_mapping")
    .eq("id", batchId)
    .maybeSingle();

  if (batchError) {
    throw new Error(`Unable to load import batch for audit: ${batchError.message}`);
  }

  const batchRow = (batchData as ImportBatchAuditRecord | null) ?? null;

  if (!batchRow) {
    return { pendingCount: 0, decidedCount: 0, rows: [] };
  }

  if (batchRow.import_mode !== "add") {
    return { pendingCount: 0, decidedCount: 0, rows: [] };
  }

  const { data: rowsData, error: rowsError } = await supabase
    .from("import_rows")
    .select(
      "id, row_index, raw_payload, status, duplicate_audit_decision, duplicate_audit_target_student_id",
    )
    .eq("batch_id", batchId)
    .order("row_index", { ascending: true });

  if (rowsError) {
    throw new Error(`Unable to load import rows for audit: ${rowsError.message}`);
  }

  const importRows = ((rowsData ?? []) as ImportRowAuditRecord[]).filter(
    (row) => row.status === "valid" || row.status === "pending",
  );

  if (importRows.length === 0) {
    return { pendingCount: 0, decidedCount: 0, rows: [] };
  }

  const mapping = toColumnMapping(batchRow.column_mapping);

  const { data: studentsData, error: studentsError } = await supabase
    .from("students")
    .select(
      "id, full_name, admission_no, father_name, primary_phone, secondary_phone, class_ref:classes(label, session_label)",
    );

  if (studentsError) {
    throw new Error(`Unable to load students for audit: ${studentsError.message}`);
  }

  const existingStudents = (studentsData ?? []) as ExistingStudentAuditRow[];
  const targetSessionLabel = batchRow.target_session_label?.trim() ?? "";

  const studentsByNameFather = new Map<string, ExistingStudentAuditRow[]>();
  const studentsByPhone = new Map<string, ExistingStudentAuditRow[]>();

  for (const student of existingStudents) {
    const nameFatherKey = `${normalizeName(student.full_name)}|${normalizeName(student.father_name ?? "")}`;

    if (normalizeName(student.full_name) && normalizeName(student.father_name ?? "")) {
      const existing = studentsByNameFather.get(nameFatherKey) ?? [];
      existing.push(student);
      studentsByNameFather.set(nameFatherKey, existing);
    }

    for (const phone of [student.primary_phone, student.secondary_phone]) {
      const normalized = normalizePhone(phone);
      if (!normalized) {
        continue;
      }

      const existing = studentsByPhone.get(normalized) ?? [];
      existing.push(student);
      studentsByPhone.set(normalized, existing);
    }
  }

  const rows: DuplicateAuditRow[] = [];
  let pendingCount = 0;
  let decidedCount = 0;

  for (const row of importRows) {
    const rawPayload = toRawPayload(row.raw_payload);
    const fullName = stringifyImportCell(getMappedCellValue(rawPayload, mapping, "fullName"));
    const fatherName = stringifyImportCell(getMappedCellValue(rawPayload, mapping, "fatherName"));
    const fatherPhone = stringifyImportCell(getMappedCellValue(rawPayload, mapping, "fatherPhone"));
    const motherPhone = stringifyImportCell(getMappedCellValue(rawPayload, mapping, "motherPhone"));
    const admissionNo = stringifyImportCell(getMappedCellValue(rawPayload, mapping, "admissionNo"));
    const classLabel = stringifyImportCell(getMappedCellValue(rawPayload, mapping, "classLabel"));

    const candidateMap = new Map<string, { student: ExistingStudentAuditRow; kinds: Set<DuplicateAuditMatchKind> }>();

    if (fullName && fatherName) {
      const nameFatherKey = `${normalizeName(fullName)}|${normalizeName(fatherName)}`;
      const matches = studentsByNameFather.get(nameFatherKey);
      if (matches) {
        for (const student of matches) {
          const entry = candidateMap.get(student.id) ?? { student, kinds: new Set() };
          entry.kinds.add("name_father");
          candidateMap.set(student.id, entry);
        }
      }
    }

    for (const phone of [fatherPhone, motherPhone]) {
      const normalized = normalizePhone(phone);
      if (!normalized) {
        continue;
      }

      const matches = studentsByPhone.get(normalized);
      if (!matches) {
        continue;
      }

      for (const student of matches) {
        const entry = candidateMap.get(student.id) ?? { student, kinds: new Set() };
        entry.kinds.add("phone");
        candidateMap.set(student.id, entry);
      }
    }

    if (candidateMap.size === 0) {
      continue;
    }

    const decision = toDecision(row.duplicate_audit_decision);
    if (decision) {
      decidedCount += 1;
    } else {
      pendingCount += 1;
    }

    const candidates: DuplicateAuditCandidate[] = [...candidateMap.values()].map(
      ({ student, kinds }) => ({
        studentId: student.id,
        fullName: student.full_name,
        fatherName: student.father_name,
        admissionNo: student.admission_no,
        primaryPhone: student.primary_phone,
        secondaryPhone: student.secondary_phone,
        classLabel: toSingleRecord(student.class_ref)?.label ?? "",
        matchKinds: [...kinds],
      }),
    );

    candidates.sort((a, b) => {
      const aSession = toSingleRecord(
        existingStudents.find((entry) => entry.id === a.studentId)?.class_ref ?? null,
      )?.session_label ?? "";
      const bSession = toSingleRecord(
        existingStudents.find((entry) => entry.id === b.studentId)?.class_ref ?? null,
      )?.session_label ?? "";

      if (targetSessionLabel) {
        const aMatches = aSession === targetSessionLabel ? 0 : 1;
        const bMatches = bSession === targetSessionLabel ? 0 : 1;
        if (aMatches !== bMatches) {
          return aMatches - bMatches;
        }
      }

      return a.fullName.localeCompare(b.fullName);
    });

    rows.push({
      rowId: row.id,
      rowIndex: row.row_index,
      fullName,
      fatherName: fatherName || null,
      admissionNo,
      classLabel,
      primaryPhone: fatherPhone || null,
      secondaryPhone: motherPhone || null,
      decision,
      decisionTargetStudentId: row.duplicate_audit_target_student_id,
      candidates,
    });
  }

  return {
    pendingCount,
    decidedCount,
    rows,
  };
}

export async function recordDuplicateAuditDecision({
  batchId,
  rowId,
  decision,
  targetStudentId,
}: {
  batchId: string;
  rowId: string;
  decision: DuplicateAuditDecision;
  targetStudentId?: string | null;
}) {
  const supabase = await createClient();

  if (decision === "mark_update" && !targetStudentId) {
    throw new Error("Choose which existing student this row updates.");
  }

  const { error } = await supabase
    .from("import_rows")
    .update({
      duplicate_audit_decision: decision,
      duplicate_audit_target_student_id:
        decision === "mark_update" ? targetStudentId ?? null : null,
    })
    .eq("id", rowId)
    .eq("batch_id", batchId);

  if (error) {
    throw new Error(`Unable to record duplicate audit decision: ${error.message}`);
  }
}

export async function clearDuplicateAuditDecision({
  batchId,
  rowId,
}: {
  batchId: string;
  rowId: string;
}) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("import_rows")
    .update({
      duplicate_audit_decision: null,
      duplicate_audit_target_student_id: null,
    })
    .eq("id", rowId)
    .eq("batch_id", batchId);

  if (error) {
    throw new Error(`Unable to clear duplicate audit decision: ${error.message}`);
  }
}
