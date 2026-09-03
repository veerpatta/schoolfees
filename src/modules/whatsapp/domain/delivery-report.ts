/**
 * Reading AiSensy's campaign report CSV.
 *
 * The Basic plan has no delivery webhooks — that is the Pro "Project API" — so
 * `submitted_message_id` is an acceptance receipt and nothing more. Until the
 * plan changes, the only way to know whether a parent's phone lit up is the CSV
 * an admin downloads from the AiSensy dashboard and uploads here.
 *
 * Pure: parsing and matching are decided here and the writing happens elsewhere,
 * so every column-name variant and every status spelling can be pinned in
 * `tests/unit/whatsapp-delivery-report.test.ts` without a database.
 *
 * AiSensy has changed its column headings at least once, so nothing here matches
 * an exact header. Columns are found by what they CONTAIN, and a report missing
 * every recognisable column is reported as such rather than silently importing
 * zero rows.
 */

export type DeliveryStatus = "submitted" | "delivered" | "read" | "failed";

export type DeliveryReportRow = {
  /** The provider id, when the report carries one. The strong match. */
  providerMessageId: string | null;
  /** Digits only, for the fallback match. */
  destinationDigits: string | null;
  status: DeliveryStatus;
  /** ISO timestamp, when the report carries one. */
  at: string | null;
};

export type DeliveryReportParse = {
  rows: DeliveryReportRow[];
  /** Rows the file had that could not be read at all. */
  skipped: number;
  /** Set when no recognisable columns were found. */
  error: string | null;
};

/**
 * The four statuses this app stores, and everything AiSensy has been seen to
 * call them.
 *
 * Order matters twice over, and the second one is a trap.
 *
 * Most-progressed first, so a cell reading "sent / read" is understood as read
 * rather than as merely submitted.
 *
 * And **`failed` is checked before `delivered`**, because "undelivered"
 * CONTAINS "delivered". With the obvious order, every undelivered message in the
 * report is imported as delivered — silently overstating delivery on the exact
 * screen the office uses to judge whether reminders work. "delivery failed"
 * fails the same way round.
 */
const STATUS_WORDS: ReadonlyArray<{ status: DeliveryStatus; words: readonly string[] }> = [
  { status: "read", words: ["read", "seen"] },
  { status: "failed", words: ["failed", "failure", "undelivered", "rejected", "error"] },
  { status: "delivered", words: ["delivered", "delivery"] },
  { status: "submitted", words: ["submitted", "sent", "accepted", "queued"] },
];

/** How far along a status is, so a later report never moves a message backwards. */
export const STATUS_RANK: Record<DeliveryStatus, number> = {
  submitted: 1,
  // Above `submitted` and below `delivered`, deliberately. A failure is more
  // informative than a bare acceptance, so it may overwrite one — but a message
  // already reported delivered and then reported failed is a report error, not
  // a retraction, and must not be moved backwards.
  failed: 2,
  delivered: 3,
  read: 4,
};

export function readDeliveryStatus(value: string | null | undefined): DeliveryStatus | null {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return null;
  for (const entry of STATUS_WORDS) {
    if (entry.words.some((word) => text.includes(word))) return entry.status;
  }
  return null;
}

/** Digits only. `+91 93522 05884`, `919352205884` and `9352205884` all match. */
export function phoneDigits(value: string | null | undefined): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  // The last ten are the number; the country code is not always present and is
  // not always 91 in the file even when it is on the row we stored.
  return digits.slice(-10);
}

/**
 * Split one CSV line, honouring double quotes.
 *
 * Hand-rolled rather than a dependency: this parses one narrow, known file that
 * an admin uploads, and `npm run scan` counts every new dependency.
 */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      // A doubled quote inside a quoted cell is one literal quote.
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (character === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  cells.push(current.trim());
  return cells;
}

/** Find a column by what its heading contains, not by an exact match. */
function findColumn(headers: string[], candidates: readonly string[]): number {
  return headers.findIndex((header) =>
    candidates.some((candidate) => header.includes(candidate)),
  );
}

export function parseDeliveryReport(csv: string): DeliveryReportParse {
  const lines = String(csv ?? "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");

  if (lines.length < 2) {
    return { rows: [], skipped: 0, error: "The file has no rows under its heading." };
  }

  const headers = splitCsvLine(lines[0]!).map((header) => header.toLowerCase());
  const messageIdColumn = findColumn(headers, ["message id", "message_id", "messageid", "msg id"]);
  const destinationColumn = findColumn(headers, ["destination", "phone", "mobile", "number", "to"]);
  const statusColumn = findColumn(headers, ["status", "state", "delivery"]);
  const atColumn = findColumn(headers, ["time", "date", "timestamp", "updated"]);

  if (statusColumn === -1 || (messageIdColumn === -1 && destinationColumn === -1)) {
    return {
      rows: [],
      skipped: 0,
      error:
        "Could not find a status column, or anything to match a message on. Export the campaign report from AiSensy without renaming its columns.",
    };
  }

  const rows: DeliveryReportRow[] = [];
  let skipped = 0;

  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const status = readDeliveryStatus(statusColumn === -1 ? null : cells[statusColumn]);
    if (!status) {
      skipped += 1;
      continue;
    }

    const providerMessageId =
      messageIdColumn === -1 ? null : (cells[messageIdColumn] || "").trim() || null;
    const destinationDigits =
      destinationColumn === -1 ? null : phoneDigits(cells[destinationColumn]);

    // Nothing to match on is not a row, it is noise.
    if (!providerMessageId && !destinationDigits) {
      skipped += 1;
      continue;
    }

    const rawAt = atColumn === -1 ? null : (cells[atColumn] || "").trim();
    const parsedAt = rawAt ? new Date(rawAt) : null;

    rows.push({
      providerMessageId,
      destinationDigits,
      status,
      at: parsedAt && !Number.isNaN(parsedAt.getTime()) ? parsedAt.toISOString() : null,
    });
  }

  return { rows, skipped, error: null };
}

export type SendRowForMatching = {
  id: string;
  providerMessageId: string | null;
  destinationDigits: string | null;
  sentOn: string;
  /** Only a row this app actually sent may receive a delivery result. */
  status: string;
  currentDeliveryStatus: DeliveryStatus | null;
};

export type DeliveryUpdate = {
  id: string;
  status: DeliveryStatus;
  at: string | null;
};

export type DeliveryMatchResult = {
  updates: DeliveryUpdate[];
  /** Report rows that matched nothing we sent. */
  unmatched: number;
  /** Report rows that matched a row already at least as far along. */
  unchanged: number;
};

/**
 * Match report rows onto send rows.
 *
 * Two rules that are easy to get wrong and expensive on the screen the office
 * trusts:
 *
 * - **Only `status = 'sent'` rows are eligible.** A `covered_by_sibling` row
 *   carries its sibling's `provider_message_id`, so matching on the id alone
 *   would write one delivery result onto every child in the family and report a
 *   family of three as three delivered messages.
 * - **A status never moves backwards.** Reports arrive out of order and get
 *   re-uploaded; a "submitted" row must not overwrite a "read" one.
 */
export function matchDeliveryReport(
  report: readonly DeliveryReportRow[],
  sends: readonly SendRowForMatching[],
): DeliveryMatchResult {
  const eligible = sends.filter((send) => send.status === "sent");

  const byMessageId = new Map<string, SendRowForMatching>();
  const byDestination = new Map<string, SendRowForMatching[]>();
  for (const send of eligible) {
    if (send.providerMessageId) byMessageId.set(send.providerMessageId, send);
    if (send.destinationDigits) {
      const list = byDestination.get(send.destinationDigits);
      if (list) list.push(send);
      else byDestination.set(send.destinationDigits, [send]);
    }
  }

  // One update per send row, keeping the most progressed status seen.
  const best = new Map<string, DeliveryUpdate>();
  let unmatched = 0;
  let unchanged = 0;

  for (const row of report) {
    let send: SendRowForMatching | undefined;

    if (row.providerMessageId) send = byMessageId.get(row.providerMessageId);

    // Fallback: destination plus the day. Only when it is unambiguous — a phone
    // that received two messages the same day cannot be told apart, and guessing
    // would put a delivery result on the wrong notice.
    if (!send && row.destinationDigits) {
      const candidates = byDestination.get(row.destinationDigits) ?? [];
      const sameDay = row.at
        ? candidates.filter((candidate) => candidate.sentOn === row.at!.slice(0, 10))
        : candidates;
      if (sameDay.length === 1) send = sameDay[0];
    }

    if (!send) {
      unmatched += 1;
      continue;
    }

    const currentRank = send.currentDeliveryStatus
      ? STATUS_RANK[send.currentDeliveryStatus]
      : 0;
    const incomingRank = STATUS_RANK[row.status];
    const existing = best.get(send.id);
    const bestRankSoFar = existing ? STATUS_RANK[existing.status] : currentRank;

    if (incomingRank <= bestRankSoFar) {
      if (!existing) unchanged += 1;
      continue;
    }

    best.set(send.id, { id: send.id, status: row.status, at: row.at });
  }

  return { updates: [...best.values()], unmatched, unchanged };
}
