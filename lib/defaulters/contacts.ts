import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { DefaulterContactSummary } from "@/lib/defaulters/cadence";

export type ContactChannel = "call" | "whatsapp" | "sms" | "in_person" | "email";
export type ContactOutcome = "reached" | "no_answer" | "promised_pay" | "dispute" | "other";

export type InsertContactArgs = {
  studentId: string;
  sessionLabel: string;
  channel: ContactChannel;
  outcome: ContactOutcome;
  snoozeUntil?: string | null;
  note?: string | null;
};

type RawContactRow = {
  student_id: string;
  contacted_at: string;
  snooze_until: string | null;
};

export async function insertDefaulterContact(args: InsertContactArgs): Promise<void> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("defaulter_contacts")
    .insert({
      student_id: args.studentId,
      session_label: args.sessionLabel,
      channel: args.channel,
      outcome: args.outcome,
      snooze_until: args.snoozeUntil ?? null,
      note: args.note ?? null,
    });
  if (error) throw new Error(`Failed to log contact: ${error.message}`);
}

/**
 * Returns the most-recent contact summary per student.
 * Gracefully returns an empty Map if the table does not exist yet (pre-migration).
 */
export async function getContactSummariesForStudents(
  studentIds: string[],
  sessionLabel: string,
): Promise<Map<string, DefaulterContactSummary>> {
  if (studentIds.length === 0) return new Map();

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("defaulter_contacts")
    .select("student_id, contacted_at, snooze_until")
    .eq("session_label", sessionLabel)
    .in("student_id", studentIds)
    .order("contacted_at", { ascending: false });

  if (error) {
    // 42P01 = relation does not exist — migration not yet applied.
    if ((error as { code?: string }).code === "42P01") return new Map();
    throw new Error(`Failed to fetch contact summaries: ${error.message}`);
  }

  const result = new Map<string, DefaulterContactSummary>();
  for (const row of (data ?? []) as RawContactRow[]) {
    if (!result.has(row.student_id)) {
      result.set(row.student_id, {
        snoozeUntil: row.snooze_until ?? null,
        lastContactedAt: row.contacted_at ?? null,
      });
    }
  }
  return result;
}
