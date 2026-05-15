import "server-only";

import { createClient } from "@/lib/supabase/server";

const RECENT_IMPORT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type ImportBatchIdRow = {
  id: string;
};

type ImportStudentRow = {
  imported_student_id: string | null;
  target_student_id: string | null;
};

export async function countRecentImportStudentsOutsideSession(
  activeSessionLabel: string,
) {
  const normalizedActiveSession = activeSessionLabel.trim();

  if (!normalizedActiveSession) {
    return 0;
  }

  const supabase = await createClient();
  const cutoff = new Date(Date.now() - RECENT_IMPORT_WINDOW_MS).toISOString();
  const { data: batchRows, error: batchError } = await supabase
    .from("import_batches")
    .select("id")
    .gte("created_at", cutoff)
    .not("target_session_label", "is", null)
    .neq("target_session_label", normalizedActiveSession);

  if (batchError) {
    throw new Error(`Unable to check recent import sessions: ${batchError.message}`);
  }

  const batchIds = ((batchRows ?? []) as ImportBatchIdRow[]).map((row) => row.id);

  if (batchIds.length === 0) {
    return 0;
  }

  const { data: importRows, error: rowError } = await supabase
    .from("import_rows")
    .select("imported_student_id, target_student_id")
    .in("batch_id", batchIds);

  if (rowError) {
    throw new Error(`Unable to check imported students: ${rowError.message}`);
  }

  const studentIds = new Set<string>();

  ((importRows ?? []) as ImportStudentRow[]).forEach((row) => {
    const studentId = row.imported_student_id ?? row.target_student_id;

    if (studentId) {
      studentIds.add(studentId);
    }
  });

  return studentIds.size;
}
