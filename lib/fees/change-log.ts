import "server-only";

import { createClient } from "@/lib/supabase/server";

type ConfigChangeStatus =
  | "preview_ready"
  | "applied"
  | "stale"
  | "failed"
  | "cancelled";

type ConfigChangeScope =
  | "global_policy"
  | "school_defaults"
  | "class_defaults"
  | "transport_defaults"
  | "student_override"
  | "workbook_setup";

type ConfigChangeBatchRow = {
  id: string;
  change_scope: ConfigChangeScope;
  status: ConfigChangeStatus;
  target_label: string;
  changed_fields: unknown;
  apply_summary: unknown;
  apply_notes: string | null;
  created_at: string;
  applied_at: string | null;
  created_by: string | null;
};

type UserRow = {
  id: string;
  full_name: string | null;
};

function getScopeLabel(scope: ConfigChangeScope) {
  switch (scope) {
    case "global_policy":
      return "Canonical policy";
    case "school_defaults":
      return "School defaults";
    case "class_defaults":
      return "Class defaults";
    case "transport_defaults":
      return "Transport defaults";
    case "student_override":
      return "Student override";
    case "workbook_setup":
      return "Workbook Fee Setup";
  }
}

function getStatusLabel(status: ConfigChangeStatus) {
  switch (status) {
    case "preview_ready":
      return "Preview ready";
    case "applied":
      return "Applied";
    case "stale":
      return "Stale";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
  }
}

function toFieldLabels(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const label = (item as { label?: unknown }).label;
      return typeof label === "string" && label.trim() ? label.trim() : null;
    })
    .filter((item): item is string => Boolean(item));
}

function toSummaryNumbers(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const readNumber = (key: string) => {
    const raw = record[key];
    return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
  };

  return {
    studentsAffected: readNumber("studentsAffected"),
    installmentsToInsert: readNumber("installmentsToInsert"),
    installmentsToUpdate: readNumber("installmentsToUpdate"),
    installmentsToCancel: readNumber("installmentsToCancel"),
    blockedInstallments: readNumber("blockedInstallments"),
  };
}

export type RecentConfigChangeLogItem = {
  id: string;
  scopeLabel: string;
  status: ConfigChangeStatus;
  statusLabel: string;
  targetLabel: string;
  changedFieldLabels: string[];
  summary: {
    studentsAffected: number;
    installmentsToInsert: number;
    installmentsToUpdate: number;
    installmentsToCancel: number;
    blockedInstallments: number;
  } | null;
  blockedInstallmentCount: number;
  applyNotes: string | null;
  createdAt: string;
  appliedAt: string | null;
  createdByName: string | null;
};

export async function getRecentConfigChangeLog(
  limit = 8,
): Promise<RecentConfigChangeLogItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("config_change_batches")
    .select(
      "id, change_scope, status, target_label, changed_fields, apply_summary, apply_notes, created_at, applied_at, created_by",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Unable to load config change audit log: ${error.message}`);
  }

  const rows = (data ?? []) as ConfigChangeBatchRow[];

  if (rows.length === 0) {
    return [];
  }

  const batchIds = rows.map((row) => row.id);
  const actorIds = Array.from(
    new Set(rows.map((row) => row.created_by).filter((value): value is string => Boolean(value))),
  );

  const [{ data: blockedRows, error: blockedError }, { data: usersRaw, error: usersError }] =
    await Promise.all([
      supabase
        .from("config_change_blocked_installments")
        .select("batch_id")
        .in("batch_id", batchIds),
      actorIds.length > 0
        ? supabase.from("users").select("id, full_name").in("id", actorIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (blockedError) {
    throw new Error(
      `Unable to load blocked-installment audit rows: ${blockedError.message}`,
    );
  }

  if (usersError) {
    throw new Error(`Unable to load config change actors: ${usersError.message}`);
  }

  const blockedCountByBatch = ((blockedRows ?? []) as Array<{ batch_id: string }>).reduce(
    (acc, row) => {
      acc.set(row.batch_id, (acc.get(row.batch_id) ?? 0) + 1);
      return acc;
    },
    new Map<string, number>(),
  );
  const userNameById = new Map(
    ((usersRaw ?? []) as UserRow[]).map((row) => [row.id, row.full_name ?? row.id]),
  );

  return rows.map((row) => ({
    id: row.id,
    scopeLabel: getScopeLabel(row.change_scope),
    status: row.status,
    statusLabel: getStatusLabel(row.status),
    targetLabel: row.target_label,
    changedFieldLabels: toFieldLabels(row.changed_fields),
    summary: toSummaryNumbers(row.apply_summary),
    blockedInstallmentCount: blockedCountByBatch.get(row.id) ?? 0,
    applyNotes: row.apply_notes,
    createdAt: row.created_at,
    appliedAt: row.applied_at,
    createdByName: row.created_by ? (userNameById.get(row.created_by) ?? row.created_by) : null,
  }));
}
