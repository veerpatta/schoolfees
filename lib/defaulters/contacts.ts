import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  callWindowForHour,
  pickBestCallWindow,
  suggestPhoneLabel,
  type CallWindow,
  type DefaulterContactSummary,
  type PhoneResponsiveness,
} from "@/lib/defaulters/cadence";

/** Hour-of-day (0–23) in Asia/Kolkata for an ISO timestamp. */
function istHour(iso: string | null): number | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(parsed);
  const hour = Number(formatted);
  return Number.isFinite(hour) ? hour : null;
}

export type ContactChannel = "call" | "whatsapp" | "sms" | "in_person" | "email";
export type ContactOutcome = "reached" | "no_answer" | "promised_pay" | "dispute" | "other";

export type InsertContactArgs = {
  studentId: string;
  sessionLabel: string;
  channel: ContactChannel;
  outcome: ContactOutcome;
  /** ISO yyyy-mm-dd. When outcome=promised_pay this is the promised date. */
  snoozeUntil?: string | null;
  note?: string | null;
  voiceNotePath?: string | null;
  /** The number actually dialed/messaged, when known. */
  contactedPhone?: string | null;
  /** Which stored number was used, e.g. "Father" / "Mother". */
  phoneLabel?: string | null;
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
  phone_label: string | null;
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
      contacted_phone: args.contactedPhone ?? null,
      phone_label: args.phoneLabel ?? null,
    });
  if (error) throw new Error(`Failed to log contact: ${error.message}`);
}

export type DefaulterContactEntry = {
  contactedAt: string;
  channel: ContactChannel | null;
  outcome: ContactOutcome | null;
  note: string | null;
  voiceNotePath: string | null;
  snoozeUntil: string | null;
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
    .select("contacted_at, channel, outcome, note, voice_note_path, snooze_until")
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
    snooze_until: string | null;
  }>).map((row) => ({
    contactedAt: row.contacted_at,
    channel: row.channel,
    outcome: row.outcome,
    note: row.note,
    voiceNotePath: row.voice_note_path,
    snoozeUntil: row.snooze_until,
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
  const db = supabase as any;
  // `phone_label` is additive (migration 20260529121602). Select it, but fall
  // back to the legacy column set if the column isn't present yet so the page
  // never breaks mid-rollout.
  // Scope by session only (not a giant student_id IN list, which would blow the
  // request-URL limit once the defaulter set is large) and filter to the
  // requested students in memory. defaulter_contacts is session-scoped + small.
  const wanted = new Set(studentIds);
  let data: RawContactRow[] | null = null;
  let error: { code?: string } | null = null;
  {
    const res = await db
      .from("defaulter_contacts")
      .select("student_id, contacted_at, snooze_until, outcome, channel, voice_note_path, phone_label")
      .eq("session_label", sessionLabel)
      .order("contacted_at", { ascending: false });
    data = res.data as RawContactRow[] | null;
    error = res.error as { code?: string } | null;
    if (error && error.code === "42703") {
      // Column not yet migrated — retry without phone_label.
      const legacy = await db
        .from("defaulter_contacts")
        .select("student_id, contacted_at, snooze_until, outcome, channel, voice_note_path")
        .eq("session_label", sessionLabel)
        .order("contacted_at", { ascending: false });
      data = (legacy.data as RawContactRow[] | null)?.map((r: RawContactRow) => ({ ...r, phone_label: null })) ?? null;
      error = legacy.error as { code?: string } | null;
    }
  }

  if (error) {
    // 42P01 = relation does not exist — migration not yet applied.
    if (error.code === "42P01") return new Map();
    console.error("[contacts] summaries fetch failed", error);
    return new Map();
  }

  const result = new Map<string, DefaulterContactSummary>();
  const counts = new Map<string, number>();
  const streaks = new Map<string, number>();
  const streakBroken = new Set<string>();
  // Per-number bookkeeping, keyed by studentId then phone label.
  const perNumber = new Map<string, Map<string, PhoneResponsiveness>>();
  const numberStreakBroken = new Set<string>(); // `${studentId}::${label}`
  // Reached-call time-of-day tally per student → best-time-to-call.
  const callWindows = new Map<string, Partial<Record<CallWindow, number>>>();

  for (const row of (data ?? []) as RawContactRow[]) {
    if (!wanted.has(row.student_id)) continue;
    counts.set(row.student_id, (counts.get(row.student_id) ?? 0) + 1);
    if (row.outcome === "reached") {
      const hour = istHour(row.contacted_at);
      if (hour !== null) {
        const window = callWindowForHour(hour);
        const tally = callWindows.get(row.student_id) ?? {};
        tally[window] = (tally[window] ?? 0) + 1;
        callWindows.set(row.student_id, tally);
      }
    }
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

    // Per-number stats. Rows arrive most-recent first, so the first row per
    // label is its latest attempt and the trailing no-answer streak ends there.
    const label = row.phone_label?.trim();
    if (label) {
      let byLabel = perNumber.get(row.student_id);
      if (!byLabel) {
        byLabel = new Map<string, PhoneResponsiveness>();
        perNumber.set(row.student_id, byLabel);
      }
      const stat =
        byLabel.get(label) ??
        ({ label, attempts: 0, reached: 0, noAnswerStreak: 0, lastReachedAt: null } satisfies PhoneResponsiveness);
      stat.attempts += 1;
      if (row.outcome === "reached") {
        stat.reached += 1;
        if (!stat.lastReachedAt) stat.lastReachedAt = row.contacted_at ?? null;
      }
      const streakKey = `${row.student_id}::${label}`;
      if (!numberStreakBroken.has(streakKey)) {
        if (row.outcome === "no_answer") {
          stat.noAnswerStreak += 1;
        } else if (row.outcome) {
          numberStreakBroken.add(streakKey);
        }
      }
      byLabel.set(label, stat);
    }
  }

  // Backfill streak / total + per-number suggestion now that every row is scanned.
  for (const [studentId, summary] of result.entries()) {
    const byLabel = perNumber.get(studentId);
    const perNumberObj = byLabel ? Object.fromEntries(byLabel) : undefined;
    result.set(studentId, {
      ...summary,
      noAnswerStreak: streaks.get(studentId) ?? 0,
      totalAttempts: counts.get(studentId) ?? 0,
      perNumber: perNumberObj,
      suggestedPhoneLabel: suggestPhoneLabel(perNumberObj),
      bestCallWindow: pickBestCallWindow(callWindows.get(studentId) ?? {}),
    });
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* No-call / "will pay anyway" flags (admin-only writes, per session)          */
/* -------------------------------------------------------------------------- */

export type NoCallFlag = {
  noCall: boolean;
  reason: string | null;
};

export async function refreshDefaulterRecoveryState(sessionLabel: string): Promise<void> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("refresh_defaulter_recovery_state", {
    p_session_label: sessionLabel,
  });

  if (error) {
    if ((error as { code?: string }).code === "42883") return;
    if ((error as { code?: string }).code === "42P01") return;
    console.error("[contacts] recovery state refresh failed", error);
  }
}

export type PromiseReliability = {
  promiseKeptCount: number;
  promiseBrokenCount: number;
  promiseKeptRate: number | null;
};

type RecoveryStateRow = {
  student_id: string;
  family_group_id: string | null;
  promise_kept_count: number | null;
  promise_broken_count: number | null;
};

function toPromiseReliability(kept: number, broken: number): PromiseReliability {
  const total = kept + broken;
  return {
    promiseKeptCount: kept,
    promiseBrokenCount: broken,
    promiseKeptRate: total > 0 ? Math.round((kept / total) * 100) : null,
  };
}

/**
 * Returns per-row promise reliability. Family rows receive family-level totals
 * so sibling promises influence the same parent follow-up score.
 */
export async function getPromiseReliabilityForStudents(
  studentIds: string[],
  sessionLabel: string,
): Promise<Map<string, PromiseReliability>> {
  if (studentIds.length === 0) return new Map();

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("defaulter_recovery_state")
    .select("student_id, family_group_id, promise_kept_count, promise_broken_count")
    .eq("session_label", sessionLabel)
    .in("student_id", studentIds);

  if (error) {
    if ((error as { code?: string }).code === "42P01") return new Map();
    console.error("[contacts] recovery state fetch failed", error);
    return new Map();
  }

  const rows = (data ?? []) as RecoveryStateRow[];
  const familyTotals = new Map<string, { kept: number; broken: number }>();
  for (const row of rows) {
    if (!row.family_group_id) continue;
    const current = familyTotals.get(row.family_group_id) ?? { kept: 0, broken: 0 };
    current.kept += row.promise_kept_count ?? 0;
    current.broken += row.promise_broken_count ?? 0;
    familyTotals.set(row.family_group_id, current);
  }

  const result = new Map<string, PromiseReliability>();
  for (const row of rows) {
    const ownKept = row.promise_kept_count ?? 0;
    const ownBroken = row.promise_broken_count ?? 0;
    const familyTotal = row.family_group_id ? familyTotals.get(row.family_group_id) : null;
    const kept = familyTotal ? familyTotal.kept : ownKept;
    const broken = familyTotal ? familyTotal.broken : ownBroken;
    result.set(row.student_id, toPromiseReliability(kept, broken));
  }

  return result;
}

/**
 * Returns the set of no-call flags for the given students in a session.
 * Gracefully returns an empty Map if the table does not exist yet
 * (pre-migration) so the Defaulters page never breaks during rollout.
 */
export async function getNoCallFlags(
  studentIds: string[],
  sessionLabel: string,
): Promise<Map<string, NoCallFlag>> {
  if (studentIds.length === 0) return new Map();

  const supabase = await createClient();
  // Session-scoped read + in-memory filter (the flags table is tiny and this
  // avoids a request-URL-busting student_id IN list for large defaulter sets).
  const wanted = new Set(studentIds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("student_collection_flags")
    .select("student_id, no_call, reason")
    .eq("session_label", sessionLabel);

  if (error) {
    if ((error as { code?: string }).code === "42P01") return new Map();
    console.error("[contacts] no-call flags fetch failed", error);
    return new Map();
  }

  const result = new Map<string, NoCallFlag>();
  for (const row of (data ?? []) as Array<{
    student_id: string;
    no_call: boolean;
    reason: string | null;
  }>) {
    if (!wanted.has(row.student_id)) continue;
    result.set(row.student_id, { noCall: row.no_call, reason: row.reason ?? null });
  }
  return result;
}

export type SetNoCallFlagArgs = {
  studentId: string;
  sessionLabel: string;
  noCall: boolean;
  reason?: string | null;
};

/**
 * Upserts the per-session no-call flag for a student. RLS gates the write on
 * the admin-only `students:write` permission; the calling server action also
 * enforces it upstream (defense in depth).
 */
export async function setNoCallFlag(args: SetNoCallFlagArgs): Promise<void> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("student_collection_flags")
    .upsert(
      {
        student_id: args.studentId,
        session_label: args.sessionLabel,
        no_call: args.noCall,
        reason: args.reason ?? null,
      },
      { onConflict: "student_id,session_label" },
    );
  if (error) throw new Error(`Failed to update no-call flag: ${error.message}`);
}
