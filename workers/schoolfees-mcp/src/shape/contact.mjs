/**
 * Follow-up history: who was called, what they said, and who must not be called.
 *
 * These two reads used to swallow their errors, log a warning nobody sees, and
 * return an empty result. The visible effect was that every promise-due row and
 * every no-call suppression silently switched off — a queue that looked healthy
 * while quietly telling staff to ring families who had asked not to be rung.
 * They still degrade rather than failing a whole report, but now the payload
 * says so.
 */

import { selectAll } from "../supabase.mjs";

const CONTACT_FIELDS = "student_id,contacted_at,snooze_until,outcome,channel,phone_label";
const LEGACY_CONTACT_FIELDS = "student_id,contacted_at,snooze_until,outcome,channel";

/** Three consecutive unanswered calls is the point at which we change tactic. */
export const NOT_RESPONDING_STREAK = 3;
/** A family owing this much gets escalated regardless of promise state. */
export const HIGH_EXPOSURE_AMOUNT = 30_000;

export function summarizeContactRows(rows, wantedStudentIds) {
  const wanted = new Set(wantedStudentIds);
  const summaries = new Map();
  const attempts = new Map();
  const streaks = new Map();
  const streakBroken = new Set();

  // Rows arrive newest first, so the first row per student is the latest contact
  // and the streak runs backwards from it until any non-"no answer" outcome.
  for (const row of rows || []) {
    if (!wanted.has(row.student_id)) continue;
    attempts.set(row.student_id, (attempts.get(row.student_id) || 0) + 1);

    if (!streakBroken.has(row.student_id)) {
      if (row.outcome === "no_answer") {
        streaks.set(row.student_id, (streaks.get(row.student_id) || 0) + 1);
      } else if (row.outcome) {
        streakBroken.add(row.student_id);
      }
    }

    if (!summaries.has(row.student_id)) {
      summaries.set(row.student_id, {
        snoozeUntil: row.snooze_until || null,
        lastContactedAt: row.contacted_at || null,
        lastOutcome: row.outcome || null,
        lastChannel: row.channel || null,
        suggestedPhoneLabel: row.phone_label || null,
        noAnswerStreak: 0,
        totalAttempts: 0,
      });
    }
  }

  for (const [studentId, summary] of summaries.entries()) {
    summaries.set(studentId, {
      ...summary,
      noAnswerStreak: streaks.get(studentId) || 0,
      totalAttempts: attempts.get(studentId) || 0,
    });
  }

  return summaries;
}

export async function getContactSummaries(env, sessionLabel, studentIds, degradation) {
  if (studentIds.length === 0) return new Map();

  return degradation.tolerate(
    "defaulter_contacts",
    async () => {
      try {
        const { rows } = await selectAll(env, "defaulter_contacts", {
          select: CONTACT_FIELDS,
          session_label: `eq.${sessionLabel}`,
          order: "contacted_at.desc",
        });
        return summarizeContactRows(rows, studentIds);
      } catch (error) {
        // Older deployments have no phone_label column; retry without it before
        // giving up, so a partial schema still yields promise tracking.
        if (!/phone_label/i.test(String(error?.message || error))) throw error;
        const { rows } = await selectAll(env, "defaulter_contacts", {
          select: LEGACY_CONTACT_FIELDS,
          session_label: `eq.${sessionLabel}`,
          order: "contacted_at.desc",
        });
        return summarizeContactRows(
          rows.map((row) => ({ ...row, phone_label: null })),
          studentIds,
        );
      }
    },
    new Map(),
  );
}

export async function getNoCallStudentIds(env, sessionLabel, studentIds, degradation) {
  if (studentIds.length === 0) return new Set();

  return degradation.tolerate(
    "student_collection_flags",
    async () => {
      const { rows } = await selectAll(env, "student_collection_flags", {
        select: "student_id,no_call",
        session_label: `eq.${sessionLabel}`,
        no_call: "eq.true",
      });
      const wanted = new Set(studentIds);
      return new Set(rows.filter((row) => wanted.has(row.student_id)).map((row) => row.student_id));
    },
    new Set(),
  );
}

/**
 * Where a promise to pay currently stands. A promise whose date has passed is
 * the strongest signal in the queue; one due today is next.
 */
export function promiseState(summary, todayKey) {
  if (summary?.lastOutcome !== "promised_pay" || !summary.snoozeUntil) return null;
  if (summary.snoozeUntil < todayKey) return "broken";
  if (summary.snoozeUntil === todayKey) return "due_today";
  return "scheduled";
}

/** Full contact log for one student. */
export async function getContactLog(env, studentId, sessionLabel, limit = 20) {
  const { rows } = await selectAll(env, "defaulter_contacts", {
    select: "id,student_id,contacted_at,channel,outcome,note,snooze_until,phone_label,created_by",
    student_id: `eq.${studentId}`,
    session_label: `eq.${sessionLabel}`,
    order: "contacted_at.desc",
    limit,
  });

  return rows.map((row) => ({
    contactId: row.id,
    contactedAt: row.contacted_at,
    channel: row.channel,
    outcome: row.outcome,
    note: row.note || null,
    snoozeUntil: row.snooze_until || null,
    phoneLabel: row.phone_label || null,
  }));
}
