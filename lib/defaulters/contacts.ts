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
  voiceNotePath?: string | null;
};

type RawContactRow = {
  student_id: string;
  contacted_at: string;
  snooze_until: string | null;
  outcome:
    | "reached"
    | "no_answer"
    | "promised_pay"
    | "dispute"
    | "other"
    | null;
  channel:
    | "call"
    | "whatsapp"
    | "sms"
    | "in_person"
    | "email"
    | null;
  voice_note_path: string | null;
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
      voice_note_path: args.voiceNotePath ?? null,
    });
  if (error) throw new Error(`Failed to log contact: ${error.message}`);
}

export type DefaulterContactEntry = {
  contactedAt: string;
  channel: ContactChannel | null;
  outcome: ContactOutcome | null;
  note: string | null;
  voiceNotePath: string | null;
};

/**
 * Returns the recent contact log for a student (most recent first).
 * Gracefully returns an empty list if the table or column does not exist.
 */
export async function getStudentContactLog(
  studentId: string,
  sessionLabel: string,
  options: { limit?: number } = {},
): Promise<DefaulterContactEntry[]> {
  const supabase = await createClient();
  const limit = options.limit ?? 20;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("defaulter_contacts")
    .select("contacted_at, channel, outcome, note, voice_note_path")
    .eq("student_id", studentId)
    .eq("session_label", sessionLabel)
    .order("contacted_at", { ascending: false })
    .limit(limit);

  if (error) {
    if ((error as { code?: string }).code === "42P01") return [];
    if ((error as { code?: string }).code === "42703") return [];
    throw new Error(`Failed to fetch contact log: ${error.message}`);
  }

  return ((data ?? []) as Array<{
    contacted_at: string;
    channel: ContactChannel | null;
    outcome: ContactOutcome | null;
    note: string | null;
    voice_note_path: string | null;
  }>).map((row) => ({
    contactedAt: row.contacted_at,
    channel: row.channel,
    outcome: row.outcome,
    note: row.note,
    voiceNotePath: row.voice_note_path,
  }));
}

const VOICE_NOTES_BUCKET = "defaulter-voice-notes";
const SIGNED_URL_TTL_SECONDS = 60 * 30;

export async function createVoiceNoteSignedUrl(path: string): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(VOICE_NOTES_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
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
    .select("student_id, contacted_at, snooze_until, outcome, channel, voice_note_path")
    .eq("session_label", sessionLabel)
    .in("student_id", studentIds)
    .order("contacted_at", { ascending: false });

  if (error) {
    // 42P01 = relation does not exist — migration not yet applied.
    if ((error as { code?: string }).code === "42P01") return new Map();
    throw new Error(`Failed to fetch contact summaries: ${error.message}`);
  }

  const result = new Map<string, DefaulterContactSummary>();
  const counts = new Map<string, number>();
  const streaks = new Map<string, number>();
  const streakBroken = new Set<string>();

  for (const row of (data ?? []) as RawContactRow[]) {
    counts.set(row.student_id, (counts.get(row.student_id) ?? 0) + 1);
    if (!streakBroken.has(row.student_id)) {
      if (row.outcome === "no_answer") {
        streaks.set(row.student_id, (streaks.get(row.student_id) ?? 0) + 1);
      } else if (row.outcome) {
        streakBroken.add(row.student_id);
      }
    }
    if (!result.has(row.student_id)) {
      result.set(row.student_id, {
        snoozeUntil: row.snooze_until ?? null,
        lastContactedAt: row.contacted_at ?? null,
        lastOutcome: row.outcome ?? null,
        lastChannel: row.channel ?? null,
        noAnswerStreak: 0,
        totalAttempts: 0,
      });
    }
  }

  // Backfill streak / total now that we've scanned every row.
  for (const [studentId, summary] of result.entries()) {
    result.set(studentId, {
      ...summary,
      noAnswerStreak: streaks.get(studentId) ?? 0,
      totalAttempts: counts.get(studentId) ?? 0,
    });
  }

  return result;
}
