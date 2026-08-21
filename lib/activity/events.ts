import "server-only";

import { createClient } from "@/lib/supabase/server";

export const ACTIVITY_KINDS = [
  "payment_posted",
  "payment_undone",
  "payment_reversed",
  "receipt_printed",
  "student_edited",
  "student_view",
  "export_downloaded",
  "defaulter_contacted",
  "defaulter_no_call_set",
  "import_committed",
] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

const KIND_TONE: Record<ActivityKind, "success" | "info" | "warning" | "muted"> = {
  payment_posted: "success",
  payment_undone: "warning",
  payment_reversed: "warning",
  receipt_printed: "info",
  student_edited: "warning",
  student_view: "muted",
  export_downloaded: "info",
  defaulter_contacted: "info",
  defaulter_no_call_set: "warning",
  import_committed: "warning",
};

export function activityKindTone(kind: string): "success" | "info" | "warning" | "muted" {
  return (KIND_TONE as Record<string, "success" | "info" | "warning" | "muted">)[kind] ?? "muted";
}

export type ActivityEvent = {
  id: string;
  userId: string;
  kind: string;
  refId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

type RawRow = {
  id: string;
  user_id: string;
  kind: string;
  ref_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

/**
 * Records a user activity. Best-effort: any failure is logged but never
 * propagates — activity logging must never break the user's flow.
 */
export async function recordActivity(input: {
  userId: string | null | undefined;
  kind: ActivityKind | string;
  refId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  if (!input.userId) return;
  try {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("user_activity_events").insert({
      user_id: input.userId,
      kind: input.kind,
      ref_id: input.refId ?? null,
      payload: input.payload ?? {},
    });
    if (error && (error as { code?: string }).code !== "42P01") {
      // Log but don't throw — activity logging is informational.
      console.warn("[activity] insert failed", error.message);
    }
  } catch (caught) {
    console.warn("[activity] unexpected", caught);
  }
}

export type ActivityFilter = {
  userId?: string;
  kinds?: string[];
  since?: string;
  refId?: string;
  limit?: number;
};

export async function listActivity(filter: ActivityFilter = {}): Promise<ActivityEvent[]> {
  const supabase = await createClient();
  const limit = Math.min(200, Math.max(1, filter.limit ?? 50));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("user_activity_events")
    .select("id, user_id, kind, ref_id, payload, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filter.userId) query = query.eq("user_id", filter.userId);
  if (filter.refId) query = query.eq("ref_id", filter.refId);
  if (filter.kinds && filter.kinds.length > 0) query = query.in("kind", filter.kinds);
  if (filter.since) query = query.gte("created_at", filter.since);

  const { data, error } = await query;

  if (error) {
    if ((error as { code?: string }).code === "42P01") return [];
    throw new Error(`Failed to load activity: ${error.message}`);
  }

  return ((data ?? []) as RawRow[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    refId: row.ref_id,
    payload: row.payload ?? {},
    createdAt: row.created_at,
  }));
}

/**
 * Daily tally of kinds for the given user. Returns counts keyed by kind.
 */
export async function getTodayActivityCounts(
  userId: string,
  now: Date = new Date(),
): Promise<Record<string, number>> {
  const supabase = await createClient();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("user_activity_events")
    .select("kind")
    .eq("user_id", userId)
    .gte("created_at", startOfDay.toISOString());

  if (error) {
    if ((error as { code?: string }).code === "42P01") return {};
    throw new Error(`Failed to load today's activity: ${error.message}`);
  }

  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as Array<{ kind: string }>) {
    counts[row.kind] = (counts[row.kind] ?? 0) + 1;
  }
  return counts;
}

