/**
 * The eligibility list, reshaped for a person rather than for a provider.
 *
 * `/protected/reminders` answers "who owes money right now" and then does
 * exactly one thing with the answer: sends a WhatsApp message. This module is
 * the other thing to do with it — hand a class teacher their class, a route
 * in-charge their bus, or the office the biggest balances first.
 *
 * Three rules hold this together:
 *
 * - **Per student, never per family.** `family-grouping.ts` exists because one
 *   phone should get one message. A class teacher collects from CHILDREN, and
 *   three children of one family sit in three different classes. Grouping by
 *   phone here would put a child on another class's sheet.
 * - **Everybody the filter found is on the list.** A family paused by a snooze,
 *   already messaged today, or with no number on record still owes the money.
 *   Fee collection is not WhatsApp. The status column is what stops a teacher's
 *   sheet from silently omitting them.
 * - **Pure.** No `server-only`: the screen and the export route both build these
 *   rows, and they must not be able to disagree.
 */
import { formatRupeesPlain } from "@/platform/helpers/currency";
import {
  buildTransportRouteLabel,
  CUSTOM_TRANSPORT_BUCKET_LABEL,
  isSentinelNoTransportRoute,
  NO_TRANSPORT_LABEL,
} from "@/modules/fees/domain/label";
import type {
  PausedFamily,
  ReminderAudience,
  ReminderCandidate,
} from "@/modules/whatsapp/domain/fee-reminders";

export type CollectionStatus =
  | "eligible"
  | "sent_today"
  | "paused_never"
  | "paused_snoozed"
  | "paused_too_soon"
  | "paused_promise"
  | "unreachable";

export type CollectionRow = {
  studentId: string;
  admissionNo: string;
  studentName: string;
  studentClass: string;
  classSortOrder: number;
  transportRoute: string | null;
  /** What they are charged for transport, however it was arranged. */
  transportFeeAmount: number;
  parentName: string;
  /** The number to ring. Absent only for an unreachable family. */
  phone: string | null;
  /** True when `phone` is the mother's because the father's was missing. */
  usedMotherPhone: boolean;
  dueAmount: number;
  totalPaid: number;
  lateFeeApplied: number;
  status: CollectionStatus;
  /** Why, in words the office can act on. Empty for a plain eligible row. */
  statusDetail: string;
};

export const COLLECTION_STATUS_LABELS: Record<CollectionStatus, string> = {
  eligible: "To collect",
  sent_today: "Messaged today",
  paused_never: "Never remind",
  paused_snoozed: "Snoozed",
  paused_too_soon: "Messaged recently",
  paused_promise: "Promised to pay",
  unreachable: "No number",
};

/**
 * The five bands, measured rather than guessed.
 *
 * Live 2026-27 on 2026-09-07, across the 510 students money counts: 53 / 71 /
 * 176 / 133 / 46, with a maximum of Rs. 47,600 and a mean owed of Rs. 17,129.
 * The obvious bands (2k/5k/10k/20k) put 70% of the school in two buckets, which
 * is not a way to decide who to chase first.
 */
const BAND_BOUNDS = [
  { key: "b1", min: 1, max: 5000 },
  { key: "b2", min: 5001, max: 10000 },
  { key: "b3", min: 10001, max: 20000 },
  { key: "b4", min: 20001, max: 30000 },
  { key: "b5", min: 30001, max: Number.POSITIVE_INFINITY },
] as const;

/**
 * "Rs." rather than "₹", and this is the one deliberate divergence here.
 *
 * A band label heads a page of the printable list, and react-pdf's Helvetica
 * has no ₹ glyph — the same reason `rs()` exists in `platform/pdf/document-kit`.
 * The label also becomes an Excel tab name and a line in the pasteable text, so
 * one spelling has to serve all three.
 *
 * The DIGITS still come from `currency.ts`, so en-IN grouping is decided in one
 * place and a find-references on that file reaches these labels too.
 */
// @allow-raw-money-format — heads a react-pdf page, which cannot render ₹.
const RUPEE_PREFIX = "Rs.";

const rupees = (value: number) => `${RUPEE_PREFIX} ${formatRupeesPlain(value)}`;

export const AMOUNT_BANDS: ReadonlyArray<{
  key: string;
  label: string;
  min: number;
  max: number;
}> = BAND_BOUNDS.map((band) => ({
  key: band.key,
  min: band.min,
  max: band.max,
  label: !Number.isFinite(band.max)
    ? `Above ${rupees(band.min - 1)}`
    : band.min === 1
      ? `Up to ${rupees(band.max)}`
      : `${rupees(band.min)} - ${formatRupeesPlain(band.max)}`,
}));

/** The bucket for anything at or below zero — a paused family can sit here. */
const NOTHING_BAND = { key: "b0", label: "Nothing outstanding" };

export function bandFor(amount: number): { key: string; label: string } {
  const band = AMOUNT_BANDS.find((entry) => amount >= entry.min && amount <= entry.max);
  return band ? { key: band.key, label: band.label } : NOTHING_BAND;
}

export type CollectionGroupBy = "class" | "route" | "amount";

export const COLLECTION_GROUP_BY: ReadonlyArray<{ value: CollectionGroupBy; label: string }> = [
  { value: "class", label: "By class" },
  { value: "route", label: "By route" },
  { value: "amount", label: "By amount owed" },
];

export function isCollectionGroupBy(value: string | null | undefined): value is CollectionGroupBy {
  return value === "class" || value === "route" || value === "amount";
}

export type CollectionGroup = {
  /** Stable and URL-safe — `?scope=` uses it to download one group. */
  key: string;
  label: string;
  rows: CollectionRow[];
  total: number;
};

function detailFor(reason: PausedFamily["reason"], returnsOn: string | null): string {
  if (reason === "promise_open") return returnsOn ? `promised ${returnsOn}` : "promised to pay";
  if (reason === "never") return "set to never remind";
  if (reason === "snoozed") return returnsOn ? `returns ${returnsOn}` : "snoozed";
  return returnsOn ? `may be messaged again ${returnsOn}` : "messaged recently";
}

const PAUSED_STATUS: Record<PausedFamily["reason"], CollectionStatus> = {
  never: "paused_never",
  snoozed: "paused_snoozed",
  too_soon: "paused_too_soon",
  promise_open: "paused_promise",
};

function fromCandidate(candidate: ReminderCandidate): CollectionRow {
  return {
    studentId: candidate.studentId,
    admissionNo: candidate.admissionNo,
    studentName: candidate.studentName,
    studentClass: candidate.studentClass,
    classSortOrder: candidate.classSortOrder,
    transportRoute: candidate.transportRoute,
    transportFeeAmount: candidate.transportFeeAmount,
    parentName: candidate.parentName,
    phone: candidate.destination,
    usedMotherPhone: candidate.usedMotherPhone,
    dueAmount: candidate.dueAmount,
    totalPaid: candidate.totalPaid,
    lateFeeApplied: candidate.lateFeeApplied,
    status: candidate.sentToday ? "sent_today" : "eligible",
    statusDetail: "",
  };
}

/**
 * Flattens the audience into one list a person can work from.
 *
 * The unreachable slice is filtered on `matchesNotice`: the array itself holds
 * every family with no usable number whatever the notice, because that is what
 * `/protected/reminders/unreachable` is for. Only the ones this notice is
 * actually about belong on a collection sheet.
 */
export function buildCollectionRows(audience: ReminderAudience): CollectionRow[] {
  const rows: CollectionRow[] = audience.candidates.map(fromCandidate);

  for (const family of audience.paused) {
    rows.push({
      studentId: family.studentId,
      admissionNo: family.admissionNo,
      studentName: family.studentName,
      studentClass: family.studentClass,
      classSortOrder: family.classSortOrder,
      transportRoute: family.transportRoute,
      transportFeeAmount: family.transportFeeAmount,
      parentName: family.parentName,
      phone: family.destination,
      usedMotherPhone: false,
      dueAmount: family.dueAmount,
      totalPaid: 0,
      lateFeeApplied: 0,
      status: PAUSED_STATUS[family.reason],
      statusDetail: detailFor(family.reason, family.returnsOn),
    });
  }

  for (const family of audience.unreachable) {
    if (!family.matchesNotice) continue;
    rows.push({
      studentId: family.studentId,
      admissionNo: family.admissionNo,
      studentName: family.studentName,
      studentClass: family.studentClass,
      classSortOrder: family.classSortOrder,
      transportRoute: family.transportRoute,
      transportFeeAmount: family.transportFeeAmount,
      parentName: family.parentName,
      phone: null,
      usedMotherPhone: false,
      dueAmount: family.dueAmount,
      totalPaid: 0,
      lateFeeApplied: 0,
      status: "unreachable",
      statusDetail: family.phoneOnRecord
        ? `on record: ${family.phoneOnRecord} (not a usable mobile)`
        : "no number on record",
    });
  }

  return rows;
}

/** URL- and sheet-name-safe, and stable across loads so `?scope=` keeps working. */
function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "none"
  );
}

/**
 * Which transport bucket a student belongs in, and why this is not just
 * `transportRoute ?? "No route"`.
 *
 * Transport is charged two ways in this school: a `transport_routes` row on the
 * student, or `student_fee_overrides.custom_transport_fee_amount` with no route
 * at all. Reading the route name alone gets BOTH ends wrong, and both were
 * wrong on the first cut of this list:
 *
 * - **3 students charged Rs 29,500 a year between them** have no route, so they
 *   fell into "No route (walk-in)" — a route in-charge was never handed their
 *   names, which is exactly the report that prompted this.
 * - **8 students sit on a real route literally NAMED "No Transport"**, a ₹0
 *   placeholder row. That produced a route sheet headed "No Transport"
 *   alongside a separate "No route (walk-in)" sheet: two buckets meaning the
 *   same thing, neither of them the one that mattered.
 *
 * `migrations/20260905064925_transport_override_is_transport.sql` fixed the SQL
 * half of this for the dashboard's route board. This is the same rule, spelled
 * with the same helpers, so the two cannot drift.
 */
function transportBucket(row: CollectionRow): { label: string; order: number } {
  const name = row.transportRoute?.trim() ?? "";

  // A real route. The sentinel is not one, whatever it is called.
  if (name && !isSentinelNoTransportRoute(name)) {
    return { label: name, order: 0 };
  }

  // Charged for transport with no route to put them on. A bucket of their own,
  // sorted just before the walkers so a route in-charge still sees them.
  if (row.transportFeeAmount > 0) {
    return { label: CUSTOM_TRANSPORT_BUCKET_LABEL, order: 9998 };
  }

  return { label: NO_TRANSPORT_LABEL, order: 9999 };
}

export function groupCollectionRows(
  rows: CollectionRow[],
  groupBy: CollectionGroupBy,
): CollectionGroup[] {
  const buckets = new Map<string, { label: string; order: number; rows: CollectionRow[] }>();

  for (const row of rows) {
    let key: string;
    let label: string;
    let order: number;

    if (groupBy === "class") {
      label = row.studentClass || "No class";
      key = `class-${slug(label)}`;
      order = row.studentClass ? row.classSortOrder : 9999;
    } else if (groupBy === "route") {
      const bucket = transportBucket(row);
      label = bucket.label;
      key = `route-${slug(label)}`;
      // Real routes first, then the custom-amount students, then the walkers.
      // Around 200 of 510 are on no transport at all: a real bucket, but not
      // the first thing a route in-charge should be handed.
      order = bucket.order;
    } else {
      const band = bandFor(row.dueAmount);
      label = band.label;
      key = `amount-${band.key}`;
      // Largest first: this grouping exists to answer "who do we chase first".
      order = -AMOUNT_BANDS.findIndex((entry) => entry.key === band.key);
    }

    const bucket = buckets.get(key);
    if (bucket) bucket.rows.push(row);
    else buckets.set(key, { label, order, rows: [row] });
  }

  return [...buckets.entries()]
    .sort(([, left], [, right]) =>
      left.order !== right.order ? left.order - right.order : left.label.localeCompare(right.label),
    )
    .map(([key, bucket]) => ({
      key,
      label: bucket.label,
      // Biggest debt at the top of every sheet.
      rows: [...bucket.rows].sort((left, right) => right.dueAmount - left.dueAmount),
      total: bucket.rows.reduce((sum, row) => sum + row.dueAmount, 0),
    }));
}

/**
 * The block an office phone pastes into a staff WhatsApp group.
 *
 * Amounts go through the same `rupees` the band labels use, so a list, its
 * heading and the message about it cannot quote three different spellings.
 */
export function renderCollectionText(group: CollectionGroup): string {
  const lines = [
    `${group.label} - fees pending`,
    `${group.rows.length} student${group.rows.length === 1 ? "" : "s"}, ${rupees(group.total)} total`,
    "",
  ];

  group.rows.forEach((row, index) => {
    const phone = row.phone ?? "no number";
    const note = row.status === "eligible" ? "" : ` [${COLLECTION_STATUS_LABELS[row.status]}]`;
    lines.push(
      `${index + 1}. ${row.studentName} (${row.admissionNo}) - ${rupees(row.dueAmount)} - ${phone}${note}`,
    );
  });

  return lines.join("\n");
}

/**
 * The columns every export shares, so the XLSX and the PDF cannot disagree.
 *
 * Amounts leave as NUMBERS: a spreadsheet that cannot sum its own money column
 * is a screenshot with extra steps. Formatting happens at the render edge.
 */
export function toExportRow(row: CollectionRow): Record<string, string | number> {
  return {
    "SR no": row.admissionNo,
    "Student": row.studentName,
    "Class": row.studentClass,
    // The canonical label, not the raw name: blank here meant a student
    // charged Rs 14,000 a year through an override read as having no
    // transport at all, in a column the office reconciles against.
    "Route": buildTransportRouteLabel({
      routeName: row.transportRoute,
      transportFeeAmount: row.transportFeeAmount,
    }),
    // The amount, beside the route, because a route does NOT imply one rate.
    // Live: three of Amet City's students carry an override and pay Rs 10,000,
    // Rs 5,700 and Rs 10,000 against a standard Rs 7,000. A route in-charge
    // handed 63 names and one rate would collect the wrong money from four of
    // them.
    "Transport fee": row.transportFeeAmount,
    "Parent": row.parentName,
    "Phone": row.phone ?? "",
    "Amount owed": row.dueAmount,
    "Paid so far": row.totalPaid,
    "Late fee": row.lateFeeApplied,
    "Status": COLLECTION_STATUS_LABELS[row.status],
    "Note": row.statusDetail,
    // Blank on purpose: the office writes into these on the printed sheet, and
    // the spreadsheet keeps the same shape so a filled sheet types straight in.
    "Collected": "",
    "Signature": "",
  };
}
