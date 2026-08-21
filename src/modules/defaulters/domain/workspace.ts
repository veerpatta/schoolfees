import type { DefaulterContactSummary } from "@/modules/defaulters/domain/cadence";
import type { RecoveryDeskEntry } from "@/modules/defaulters/domain/recovery";

export function getSelectedRecoveryEntry(
  queue: RecoveryDeskEntry[],
  selectedStudentId: string | null,
) {
  return (
    queue.find((entry) => entry.row.studentId === selectedStudentId) ??
    queue[0] ??
    null
  );
}

export function getRecoveryQueuePosition(
  queue: RecoveryDeskEntry[],
  selectedStudentId: string | null,
) {
  if (!selectedStudentId) return -1;
  return queue.findIndex((entry) => entry.row.studentId === selectedStudentId);
}

export function buildDefaulterCallProgress(input: {
  queue: RecoveryDeskEntry[];
  summaries: Record<string, DefaulterContactSummary>;
  loggedOrder: string[];
  now?: Date;
}) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(input.now ?? new Date());

  let logged = 0;
  let promises = 0;

  for (const entry of input.queue) {
    const summary = input.summaries[entry.row.studentId];
    if (!summary?.lastContactedAt?.startsWith(today)) continue;
    logged += 1;
    if (summary.lastOutcome === "promised_pay") promises += 1;
  }

  const recent = input.loggedOrder
    .map<{
      entry: RecoveryDeskEntry;
      summary: DefaulterContactSummary | null;
    } | null>((studentId) => {
      const entry = input.queue.find((item) => item.row.studentId === studentId);
      if (!entry) return null;
      return {
        entry,
        summary: Object.prototype.hasOwnProperty.call(input.summaries, studentId)
          ? input.summaries[studentId]
          : null,
      };
    })
    .filter(
      (
        item,
      ): item is {
        entry: RecoveryDeskEntry;
        summary: DefaulterContactSummary | null;
      } => item !== null,
    )
    .slice(0, 3);

  return { logged, promises, total: input.queue.length, recent };
}
