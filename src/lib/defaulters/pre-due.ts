import type { DefaulterSummaryRow } from "@/lib/defaulters/types";

export type PreDueReminderEntry = {
  row: DefaulterSummaryRow;
  daysUntilDue: number;
};

export type PreDueReminderList = {
  entries: PreDueReminderEntry[];
  metrics: {
    totalRows: number;
    totalAmount: number;
    dueTodayRows: number;
    next7DaysRows: number;
    next14DaysRows: number;
  };
};

export type PreDueReminderInput = {
  rows: DefaulterSummaryRow[];
  today?: Date;
  windowDays?: number;
};

function dateKey(date: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function daysBetween(startKey: string, endKey: string) {
  const start = new Date(`${startKey}T00:00:00+05:30`).getTime();
  const end = new Date(`${endKey}T00:00:00+05:30`).getTime();
  return Math.round((end - start) / 86_400_000);
}

function sortEntries(left: PreDueReminderEntry, right: PreDueReminderEntry) {
  if (left.daysUntilDue !== right.daysUntilDue) {
    return left.daysUntilDue - right.daysUntilDue;
  }
  if ((right.row.nextDueAmount ?? 0) !== (left.row.nextDueAmount ?? 0)) {
    return (right.row.nextDueAmount ?? 0) - (left.row.nextDueAmount ?? 0);
  }
  return left.row.fullName.localeCompare(right.row.fullName);
}

export function buildPreDueReminderList({
  rows,
  today = new Date(),
  windowDays = 14,
}: PreDueReminderInput): PreDueReminderList {
  const todayKey = dateKey(today);
  const entries = rows
    .filter((row) => !row.noCall)
    .filter((row) => row.followUpStatus === "pending")
    .filter((row) => (row.nextDueAmount ?? 0) > 0)
    .flatMap((row) => {
      if (!row.nextDueDate) return [];
      const daysUntilDue = daysBetween(todayKey, row.nextDueDate);
      if (daysUntilDue < 0 || daysUntilDue > windowDays) return [];
      return [{ row, daysUntilDue }];
    })
    .sort(sortEntries);

  return {
    entries,
    metrics: {
      totalRows: entries.length,
      totalAmount: entries.reduce((sum, entry) => sum + (entry.row.nextDueAmount ?? 0), 0),
      dueTodayRows: entries.filter((entry) => entry.daysUntilDue === 0).length,
      next7DaysRows: entries.filter((entry) => entry.daysUntilDue <= 7).length,
      next14DaysRows: entries.filter((entry) => entry.daysUntilDue <= 14).length,
    },
  };
}
