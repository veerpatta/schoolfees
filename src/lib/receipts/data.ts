import "server-only";

import { createClient } from "@/platform/supabase/server";

/**
 * A Supabase client this module can read through. Widened to the operations
 * actually used so the service-role client (from @supabase/supabase-js) and the
 * cookie client (from @supabase/ssr) are both acceptable.
 */
type ReceiptDataClient = Pick<Awaited<ReturnType<typeof createClient>>, "from">;
import { getDisplayInstallmentLabel } from "@/lib/prev-year-dues/display";
import { buildReceiptAdjustmentTotals } from "@/lib/receipts/amounts";
import {
  resolveDateRange,
  schoolTodayIso,
  type ReceiptFilters,
} from "@/lib/receipts/filters";
import {
  getAllReceiptReversalTotals,
  getReceiptReversalTotals,
  isReceiptReversed,
} from "@/lib/receipts/reversals";
import { resolveReceiptSessionLabel } from "@/lib/receipts/session-label";
import { buildTransportRouteLabel } from "@/lib/transport/label";
import type {
  ConventionalDiscountAssignmentSummary,
  ReceiptBreakdownItem,
  ReceiptDetail,
  ReceiptFeeSummaryItem,
  ReceiptHistoryItem,
  ReceiptInstallmentStatusItem,
  ReceiptListItem,
} from "@/lib/receipts/types";

type StudentClassRow = {
  session_label: string;
  class_name: string;
  section: string | null;
  stream_name: string | null;
};

type StudentRouteRow = {
  route_name: string;
  route_code: string | null;
};

/** Family membership is session-scoped, so a student carries one row per year
 *  and the caller has to pick the one matching the receipt's session. */
type StudentFamilyLinkRow = {
  family_group_id: string;
  academic_session_label: string;
};

type StudentRow = {
  id: string;
  full_name: string;
  admission_no: string;
  father_name: string | null;
  primary_phone: string | null;
  email: string | null;
  // Optional: the receipt-list select is narrower than the detail select and
  // shares this row type. Only the detail query asks for these two.
  secondary_phone?: string | null;
  family_links?: StudentFamilyLinkRow[] | null;
  class_ref: StudentClassRow | StudentClassRow[] | null;
  route_ref: StudentRouteRow | StudentRouteRow[] | null;
};

type ReceiptListRow = {
  id: string;
  receipt_number: string;
  payment_date: string;
  payment_mode: "cash" | "upi" | "bank_transfer" | "cheque";
  total_amount: number;
  reference_number: string | null;
  notes: string | null;
  received_by: string | null;
  created_at: string;
  student_ref: StudentRow | StudentRow[] | null;
};

type PaymentInstallmentRow = {
  installment_no: number;
  installment_label: string;
  class_ref: Pick<StudentClassRow, "session_label"> | Array<Pick<StudentClassRow, "session_label">> | null;
  due_date: string;
};

type ReceiptPaymentRow = {
  id: string;
  amount: number;
  notes: string | null;
  // Allocation snapshot columns added by migration
  // 20260527000000_persist_payment_allocation_snapshot.sql. Optional here so
  // the code keeps working pre-migration; once applied, every newly posted
  // row carries them.
  discount_applied_at_posting?: number | null;
  waiver_applied_at_posting?: number | null;
  pending_before_posting?: number | null;
  pending_after_posting?: number | null;
  installment_ref: PaymentInstallmentRow | PaymentInstallmentRow[] | null;
};

type ReceiptDetailRow = {
  id: string;
  student_id: string;
  receipt_number: string;
  payment_date: string;
  payment_mode: "cash" | "upi" | "bank_transfer" | "cheque";
  total_amount: number;
  reference_number: string | null;
  notes: string | null;
  received_by: string | null;
  created_at: string;
  created_by: string | null;
  student_ref: StudentRow | StudentRow[] | null;
};

type HistoricalReceiptRow = {
  id: string;
  receipt_number: string;
  total_amount: number;
  payment_date: string;
  created_at: string;
};

type WorkbookInstallmentBalanceRow = {
  installment_no: number;
  installment_label: string;
  session_label: string;
  due_date: string;
  base_charge: number;
  total_charge: number;
  paid_amount: number;
  applied_amount: number;
  discount_closeout_amount: number;
  pending_amount: number;
  final_late_fee: number;
  balance_status: string;
};

type ReceiptAdjustmentRow = {
  receipt_id: string;
  adjustment_type: "discount" | "writeoff" | "correction" | "reversal";
  amount_delta: number;
};

type WorkbookFinancialRow = {
  student_id: string;
  session_label: string;
  student_status_label: "New" | "Old";
  tuition_fee: number;
  transport_fee: number;
  academic_fee: number;
  other_adjustment_head: string | null;
  other_adjustment_amount: number;
  discount_amount: number;
  base_charge_total: number;
  late_fee_total: number;
  late_fee_waiver_amount: number;
  total_due: number;
  total_paid: number;
  outstanding_amount: number;
};

type UserRow = {
  id: string;
  full_name: string;
};

type ConventionalDiscountPolicyRow = {
  code: string;
  display_name: string;
};

type ConventionalDiscountAssignmentRow = {
  id: string;
  academic_session_label: string;
  before_tuition_amount: number;
  resulting_tuition_amount: number;
  policy_ref: ConventionalDiscountPolicyRow | ConventionalDiscountPolicyRow[] | null;
};

function toSingleRecord<T>(value: T | T[] | null) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function buildClassLabel(classRef: StudentClassRow | StudentClassRow[] | null) {
  const value = toSingleRecord(classRef);

  if (!value) {
    return "Unknown class";
  }

  const parts = [value.class_name];

  if (value.section) {
    parts.push(`Section ${value.section}`);
  }

  if (value.stream_name) {
    parts.push(value.stream_name);
  }

  return parts.join(" - ");
}

function buildRouteLabel(
  routeRef: StudentRouteRow | StudentRouteRow[] | null,
  transportFeeAmount?: number | null,
) {
  return buildTransportRouteLabel({ route: toSingleRecord(routeRef), transportFeeAmount });
}

function buildFeeSummary(
  row: WorkbookFinancialRow | null,
  receiptAdjustments: {
    discountAmount: number;
    lateFeeAmount: number;
    lateFeeWaived: number;
  },
): ReceiptFeeSummaryItem[] {
  if (!row) {
    return [];
  }

  const discountAmount =
    receiptAdjustments.discountAmount > 0 ? receiptAdjustments.discountAmount : row.discount_amount;
  const lateFeeWaived =
    receiptAdjustments.lateFeeWaived > 0 ? receiptAdjustments.lateFeeWaived : row.late_fee_waiver_amount;

  return [
    { label: "Tuition fee", amount: row.tuition_fee },
    { label: "Transport fee", amount: row.transport_fee },
    { label: "Academic fee", amount: row.academic_fee },
    {
      label: row.other_adjustment_head ? `Other adj. (${row.other_adjustment_head})` : "Other adjustment",
      amount: row.other_adjustment_amount,
    },
    { label: "Discount", amount: -discountAmount },
    { label: "Late fee", amount: receiptAdjustments.lateFeeAmount },
    { label: "Late fee waived", amount: -lateFeeWaived },
  ];
}

function normalizeBalanceStatus(
  status: string,
  pending: number,
): ReceiptInstallmentStatusItem["status"] {
  const normalized = status?.toLowerCase();
  if (normalized === "paid" || pending <= 0) return "paid";
  if (normalized === "overdue") return "overdue";
  if (normalized === "partial") return "partial";
  return "pending";
}

/**
 * `v_workbook_installment_balances` emits more than one row per installment
 * number when the same number carries different label variants, so a receipt
 * would list "Installment 2" twice. Collapse to one row per `installment_no`,
 * keeping the longer (more descriptive) label, and sort by installment number.
 */
function buildInstallmentStatus(
  rows: WorkbookInstallmentBalanceRow[],
): ReceiptInstallmentStatusItem[] {
  const byInstallment = new Map<number, WorkbookInstallmentBalanceRow>();

  for (const row of rows) {
    const existing = byInstallment.get(row.installment_no);
    if (!existing || (row.installment_label?.length ?? 0) > (existing.installment_label?.length ?? 0)) {
      byInstallment.set(row.installment_no, row);
    }
  }

  return [...byInstallment.values()]
    .map((row) => {
      // Late fees are fines, not part of "expected" — so an installment is
      // settled once its BASE charge is covered, regardless of any unpaid late
      // fee. Pending and status therefore track the base charge only (mirrors
      // the view's internal base_pending_amount). The late fee still surfaces
      // separately in the fee summary and in the `lateFee` field below.
      const applied = row.applied_amount ?? row.paid_amount ?? 0;
      const basePending = Math.max(
        0,
        (row.base_charge ?? 0) - applied - (row.discount_closeout_amount ?? 0),
      );
      return {
        installmentNo: row.installment_no,
        label: getDisplayInstallmentLabel({
          installmentNo: row.installment_no,
          installmentLabel: row.installment_label,
        }),
        dueDate: row.due_date,
        expected: row.base_charge ?? 0,
        paid: applied,
        pending: basePending,
        lateFee: row.final_late_fee ?? 0,
        status: normalizeBalanceStatus(row.balance_status, basePending),
      };
    })
    .sort((left, right) => left.installmentNo - right.installmentNo);
}

/** Everything `getReceiptsPage` can narrow by, beyond the text query. */
export type ReceiptPageFilters = Omit<ReceiptFilters, "query" | "sessionLabel"> & {
  /** Mode and staff counts for the filter sheet. Costs an extra pass. */
  withFacets?: boolean;
};

export type ReceiptPageAggregate = {
  totalAmount: number;
  receiptCount: number;
  averageAmount: number;
  /** The set was larger than the aggregate could read; the UI says "about". */
  truncated: boolean;
};

export type ReceiptPageFacets = {
  byMode: Array<{ mode: string; count: number }>;
  byStaff: Array<{ receivedBy: string; count: number }>;
};

/**
 * How many rows the aggregate passes will read.
 *
 * Node-side summing over a session's receipts, in the manner of
 * `loadExtendedCollectionHeatmap`. A live session is in the low hundreds, so
 * this is generous by an order of magnitude — and `truncated` says so out loud
 * rather than reporting a total that is quietly short. Past ~5,000 receipts,
 * replace both passes with one `get_receipt_filter_facets` RPC cached on
 * `session:{label}`.
 */
const AGGREGATE_ROW_CAP = 5000;

/** The filter-only embed that scopes a receipts read to one academic session. */
const SESSION_SCOPE_EMBED =
  "payments!inner(installment_ref:installments!inner(class_ref:classes!inner(session_label)))";

type FilterableQuery = {
  eq(column: string, value: string): FilterableQuery;
  gte(column: string, value: string): FilterableQuery;
  lte(column: string, value: string): FilterableQuery;
  in(column: string, values: readonly string[]): FilterableQuery;
  or(filter: string): FilterableQuery;
};

/**
 * Applies the text query and every filter to a receipts select.
 *
 * One function for all three passes — the page, the aggregate and the facets —
 * because a filter applied to the list but not the total shows a stat strip
 * that disagrees with the rows under it.
 */
function applyReceiptFilters<Query extends FilterableQuery>(
  query: Query,
  searchQuery: string,
  filters: ReceiptPageFilters | undefined,
  dateRange: { from: string | null; to: string | null },
  options: {
    skipModes?: boolean;
    skipStaff?: boolean;
    /** Ids of fully reversed receipts, when "Reversed only" is on. */
    reversedIds?: readonly string[];
  } = {},
): Query {
  let next = query;

  if (options.reversedIds) {
    // An empty list is a real answer — nothing has been reversed — and `.in`
    // with no values correctly matches nothing.
    next = next.in("id", options.reversedIds) as Query;
  }

  const normalizedQuery = searchQuery.trim();
  if (normalizedQuery) {
    next = next.or(
      `receipt_number.ilike.%${normalizedQuery}%,reference_number.ilike.%${normalizedQuery}%`,
    ) as Query;
  }

  if (!filters) return next;

  if (dateRange.from) next = next.gte("payment_date", dateRange.from) as Query;
  if (dateRange.to) next = next.lte("payment_date", dateRange.to) as Query;

  if (!options.skipModes && filters.paymentModes.length > 0) {
    next = next.in("payment_mode", filters.paymentModes) as Query;
  }

  // "Discount close-outs" narrows to the mode that records a written-off
  // balance. It is not cash, and it never counts as money collected.
  if (filters.discountCloseOutsOnly) {
    next = next.eq("payment_mode", "discount") as Query;
  }

  if (!options.skipStaff && filters.receivedBy.length > 0) {
    next = next.in("received_by", filters.receivedBy) as Query;
  }

  // The class filter needs `students!inner`; see the select builder below. On a
  // non-inner embed PostgREST nulls the embed instead of dropping the parent
  // row, so this filter would return every receipt with a blank student.
  if (filters.classId) {
    next = next.eq("student_ref.class_id", filters.classId) as Query;
  }

  return next;
}

/**
 * Ids of receipts whose reversals cover their full amount.
 *
 * "Reversed" is not a column — it is `sum(reversal) >= total_amount`, computed
 * from `payment_adjustments`. So the "Reversed only" filter has to resolve the
 * id set first and hand it to the queries. That is affordable precisely because
 * reversals are rare: the view holds one row per reversed receipt, not one per
 * receipt.
 *
 * Capped at 500 ids: PostgREST serialises `.in(...)` into the request URL, and
 * the Ledger page proved that ceiling by dying at ~17,800 characters.
 */
async function resolveFullyReversedIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string[]> {
  const totals = await getAllReceiptReversalTotals(supabase);
  if (totals.size === 0) return [];

  const candidateIds = [...totals.keys()].slice(0, 500);
  const { data } = await supabase
    .from("receipts")
    .select("id, total_amount")
    .in("id", candidateIds);

  return ((data ?? []) as Array<{ id: string; total_amount: number | null }>)
    .filter((row) => isReceiptReversed(totals, row.id, Number(row.total_amount ?? 0)))
    .map((row) => row.id);
}

function receiptSelect(columns: string, filters: ReceiptPageFilters | undefined) {
  // `!inner` only when a class filter is on. Without it, receipts whose student
  // row is missing stop rendering as "Unknown student" and vanish instead.
  const studentJoin = filters?.classId ? "students!inner" : "students";
  return columns.replace("__STUDENT__", studentJoin);
}

const LIST_COLUMNS =
  "id, receipt_number, payment_date, payment_mode, total_amount, reference_number, notes, received_by, created_at, " +
  "student_ref:__STUDENT__(id, class_id, full_name, admission_no, father_name, primary_phone, class_ref:classes(class_name, section, stream_name), route_ref:transport_routes(route_name, route_code)), " +
  SESSION_SCOPE_EMBED;

export async function getReceiptsPage(
  searchQuery: string,
  pagination: { page: number; pageSize: number },
  sessionLabel: string,
  filters?: ReceiptPageFilters,
): Promise<{
  receipts: ReceiptListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  aggregate: ReceiptPageAggregate;
  facets?: ReceiptPageFacets;
}> {
  const supabase = await createClient();
  const page = Math.max(1, Math.floor(pagination.page));
  const pageSize = Math.min(100, Math.max(1, Math.floor(pagination.pageSize)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const dateRange = filters
    ? resolveDateRange(filters, schoolTodayIso())
    : { from: null, to: null };
  // Resolved before the queries are built, because it is one of their filters.
  const reversedIds = filters?.reversedOnly
    ? await resolveFullyReversedIds(supabase)
    : undefined;
  const filterOptions = { reversedIds };

  // Scope to the viewed session by the installment frozen on each payment, NOT the
  // student's current class — otherwise a promoted student's prior-year receipts would
  // follow them into their new session (and vanish from the old one). Step 1 resolves the
  // receipt ids whose payments settled an installment in this session; step 2 filters
  // receipts by those ids so `count: exact` and pagination stay correct.
  // Scoped through the JOIN rather than a list of receipt ids.
  //
  // This used to resolve every scoped receipt id and pass them to
  // `.in("id", …)`. PostgREST serialises that into the request URL, so the
  // filter grew with every receipt posted: at 181 receipts it was already a
  // ~6,700-character URL, and the Ledger page proved the ceiling by dying at
  // ~17,800 ("TypeError: fetch failed"). This one was on course to break
  // around 480 receipts — inside this academic year, during collection season.
  //
  // The embed is filter-only and keeps `count: "exact"` and `.range()` honest:
  // PostgREST returns one parent row per receipt with its children nested, so
  // the count is still receipts, not payments. Verified against live data —
  // the join and the id list select exactly the same 181 receipts, with zero
  // rows on either side of the difference.
  const listBase = supabase
    .from("receipts")
    .select(receiptSelect(LIST_COLUMNS, filters), { count: "exact" })
    .eq("payments.installment_ref.class_ref.session_label", sessionLabel);
  // Newest first by default; amount-high-to-low keeps `created_at` as the
  // second key so pagination stays stable across ties.
  const sorted = (
    filters?.sort === "amount"
      ? listBase.order("total_amount", { ascending: false }).order("created_at", { ascending: false })
      : listBase.order("payment_date", { ascending: false }).order("created_at", { ascending: false })
  ).range(from, to);

  const listQuery = applyReceiptFilters(
    sorted as unknown as FilterableQuery,
    searchQuery,
    filters,
    dateRange,
    filterOptions,
  ) as unknown as typeof sorted;

  const aggregateQuery = applyReceiptFilters(
    supabase
      .from("receipts")
      .select(receiptSelect(`id, total_amount, ${SESSION_SCOPE_EMBED}`, filters), {
        count: "exact",
      })
      .eq("payments.installment_ref.class_ref.session_label", sessionLabel)
      .range(0, AGGREGATE_ROW_CAP - 1) as unknown as FilterableQuery,
    searchQuery,
    filters,
    dateRange,
    filterOptions,
  );

  // Facets exclude the two filters they describe, so a count reads as "how
  // many more you would get", not "how many you already have".
  const facetsQuery = filters?.withFacets
    ? applyReceiptFilters(
        supabase
          .from("receipts")
          .select(
            receiptSelect(`payment_mode, received_by, ${SESSION_SCOPE_EMBED}`, filters),
          )
          .eq("payments.installment_ref.class_ref.session_label", sessionLabel)
          .range(0, AGGREGATE_ROW_CAP - 1) as unknown as FilterableQuery,
        searchQuery,
        filters,
        dateRange,
        { ...filterOptions, skipModes: true, skipStaff: true },
      )
    : null;

  const [listResult, aggregateResult, facetsResult] = await Promise.all([
    listQuery,
    aggregateQuery as unknown as PromiseLike<{
      data: Array<{ total_amount: number | null }> | null;
      error: unknown;
      count: number | null;
    }>,
    facetsQuery
      ? (facetsQuery as unknown as PromiseLike<{
          data: Array<{ payment_mode: string; received_by: string | null }> | null;
          error: unknown;
        }>)
      : Promise.resolve(null),
  ]);

  const { data, error, count } = listResult;

  if (error) {
    throw new Error(`Unable to load receipts: ${error.message}`);
  }

  // Cast via unknown: the select carries a filter-only `payments` embed that
  // ReceiptListRow deliberately does not model (nothing reads it — it exists to
  // scope the join), and the students embed omits columns the list never shows.
  // Without the widening step TS compares the two shapes structurally and
  // objects to fields this query has no reason to fetch.
  const listRows = (data ?? []) as unknown as ReceiptListRow[];
  const reversalTotals = await getReceiptReversalTotals(listRows.map((row) => row.id));
  const receipts = listRows.map((row) => {
    const student = toSingleRecord(row.student_ref);

    return {
      id: row.id,
      receiptNumber: row.receipt_number,
      paymentDate: row.payment_date,
      paymentMode: row.payment_mode,
      totalAmount: row.total_amount,
      referenceNumber: row.reference_number,
      notes: row.notes,
      receivedBy: row.received_by,
      createdAt: row.created_at,
      studentFullName: student?.full_name ?? "Unknown student",
      admissionNo: student?.admission_no ?? "N/A",
      classLabel: buildClassLabel(student?.class_ref ?? null),
      isReversed: isReceiptReversed(reversalTotals, row.id, row.total_amount),
    };
  });

  // Totals over the whole filtered set, not the page in hand — a stat strip
  // that reported the thirty rows on screen would be worse than none.
  //
  // Reversed receipts are struck through in the list directly below this strip,
  // so counting them here made the header contradict its own rows and overstated
  // what the school actually holds. The rows already carry the flag; the strip
  // needed its own lookup because the aggregate query reads further than one
  // page of the list.
  const aggregateRows = (aggregateResult.data ?? []) as Array<{
    id: string;
    total_amount: number | null;
  }>;
  const aggregateReversals = await getReceiptReversalTotals(
    aggregateRows.map((row) => row.id),
    supabase,
  );
  const countedAggregateRows = aggregateRows.filter(
    (row) => !isReceiptReversed(aggregateReversals, row.id, Number(row.total_amount ?? 0)),
  );
  const totalAmount = countedAggregateRows.reduce(
    (sum, row) => sum + Number(row.total_amount ?? 0),
    0,
  );
  // `aggregateResult.count` is the unfiltered server-side count, so it cannot be
  // used once reversed rows are dropped — fall back to what was actually summed.
  const receiptCount = countedAggregateRows.length;
  const aggregate: ReceiptPageAggregate = {
    totalAmount,
    receiptCount,
    averageAmount: receiptCount > 0 ? Math.round(totalAmount / receiptCount) : 0,
    // Truncation is still judged on the SERVER-side count, not the netted one:
    // `receiptCount` is now derived from the capped fetch, so comparing it to the
    // cap could never be true and the "showing a partial total" warning would
    // have gone quiet.
    truncated: (aggregateResult.count ?? aggregateRows.length) > AGGREGATE_ROW_CAP,
  };

  let facets: ReceiptPageFacets | undefined;
  if (facetsResult?.data) {
    const modeCounts = new Map<string, number>();
    const staffCounts = new Map<string, number>();
    for (const row of facetsResult.data) {
      modeCounts.set(row.payment_mode, (modeCounts.get(row.payment_mode) ?? 0) + 1);
      // Grouped on the RAW value. Two staff can render the same display name,
      // and the filter matches the stored string.
      const staff = (row.received_by ?? "").trim();
      if (staff) staffCounts.set(staff, (staffCounts.get(staff) ?? 0) + 1);
    }
    facets = {
      byMode: [...modeCounts.entries()]
        .map(([mode, countValue]) => ({ mode, count: countValue }))
        .sort((left, right) => right.count - left.count),
      byStaff: [...staffCounts.entries()]
        .map(([receivedBy, countValue]) => ({ receivedBy, count: countValue }))
        .sort((left, right) => right.count - left.count),
    };
  }

  return {
    receipts,
    totalCount: count ?? 0,
    page,
    pageSize,
    aggregate,
    facets,
  };
}

export async function getReceiptsList(
  searchQuery: string,
  sessionLabel: string,
): Promise<ReceiptListItem[]> {
  const page = await getReceiptsPage(searchQuery, { page: 1, pageSize: 80 }, sessionLabel);
  return page.receipts;
}

/**
 * Receipt detail for a caller that has no cookie session.
 *
 * Same body as `getReceiptDetail`, with the client injected — the pattern
 * `getReceiptReversalTotals` already uses (lib/receipts/reversals.ts). The
 * document bridge needs this: it runs as a service, not as a signed-in person,
 * so `createClient()` has no cookies to read and RLS returns nothing.
 */
/** Receipt detail for a signed-in staff request. */
export async function getReceiptDetail(receiptId: string): Promise<ReceiptDetail | null> {
  return getReceiptDetailWith(await createClient(), receiptId);
}

export async function getReceiptDetailWith(
  supabase: ReceiptDataClient,
  receiptId: string,
): Promise<ReceiptDetail | null> {
  const { data: receiptRaw, error: receiptError } = await supabase
    .from("receipts")
    .select(
      "id, student_id, receipt_number, payment_date, payment_mode, total_amount, reference_number, notes, received_by, created_at, created_by, student_ref:students(id, full_name, admission_no, father_name, primary_phone, secondary_phone, email, family_links:student_family_members(family_group_id, academic_session_label), class_ref:classes(session_label, class_name, section, stream_name), route_ref:transport_routes(route_name, route_code))",
    )
    .eq("id", receiptId)
    .maybeSingle();

  if (receiptError) {
    throw new Error(`Unable to load receipt details: ${receiptError.message}`);
  }

  if (!receiptRaw) {
    return null;
  }

  const receipt = receiptRaw as ReceiptDetailRow;

  const [
    { data: paymentsRaw, error: paymentsError },
    { data: userRaw, error: userError },
    { data: financialRaw, error: financialError },
    { data: studentReceiptsRaw, error: studentReceiptsError },
    { data: receiptAdjustmentsRaw, error: receiptAdjustmentsError },
    { data: conventionalAssignmentsRaw, error: conventionalAssignmentsError },
    { data: installmentBalancesRaw, error: installmentBalancesError },
    { data: paymentAdjustmentsRaw, error: paymentAdjustmentsError },
  ] = await Promise.all([
    supabase
      .from("payments")
      .select(
        // Allocation snapshot columns from migration
        // 20260527000000_persist_payment_allocation_snapshot.sql freeze the
        // moment-of-posting context (discount, waiver, pending before/after)
        // onto every payments row. Older rows have NULL for these — UI
        // renders that via <Money fallback="—" />.
        "id, amount, notes, discount_applied_at_posting, waiver_applied_at_posting, pending_before_posting, pending_after_posting, installment_ref:installments(installment_no, installment_label, due_date, class_ref:classes(session_label))",
      )
      .eq("receipt_id", receipt.id)
      .order("created_at", { ascending: true }),
    receipt.created_by
      ? supabase.from("users").select("id, full_name").eq("id", receipt.created_by).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("v_workbook_student_financials")
      .select(
        "student_id, session_label, student_status_label, tuition_fee, transport_fee, academic_fee, other_adjustment_head, other_adjustment_amount, discount_amount, base_charge_total, late_fee_total, late_fee_waiver_amount, total_due, total_paid, outstanding_amount",
      )
      .eq("student_id", receipt.student_id)
      .maybeSingle(),
    supabase
      .from("receipts")
      .select("id, receipt_number, total_amount, payment_date, created_at")
      .eq("student_id", receipt.student_id)
      .order("payment_date", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("receipt_adjustments")
      .select("receipt_id, adjustment_type, amount_delta")
      .eq("student_id", receipt.student_id),
    supabase
      .from("student_conventional_discount_assignments")
      .select(
        "id, academic_session_label, before_tuition_amount, resulting_tuition_amount, policy_ref:conventional_discount_policies(code, display_name)",
      )
      .eq("student_id", receipt.student_id)
      .eq("is_active", true),
    supabase
      .from("v_workbook_installment_balances")
      .select(
        "installment_no, installment_label, session_label, due_date, base_charge, total_charge, paid_amount, applied_amount, discount_closeout_amount, pending_amount, final_late_fee, balance_status",
      )
      .eq("student_id", receipt.student_id),
    // All append-only payment adjustments for this student. Corrections are
    // folded into receipt allocations; reversals also drive the VOID banner.
    supabase
      .from("payment_adjustments")
      .select("payment_id, amount_delta, adjustment_type, reason")
      .eq("student_id", receipt.student_id)
      .order("created_at", { ascending: true }),
  ]);

  if (paymentsError) {
    throw new Error(`Unable to load receipt breakdown: ${paymentsError.message}`);
  }

  if (userError) {
    throw new Error(`Unable to load receipt creator details: ${userError.message}`);
  }

  if (financialError && !financialError.message.includes("does not exist")) {
    throw new Error(`Unable to load workbook receipt context: ${financialError.message}`);
  }

  if (studentReceiptsError) {
    throw new Error(`Unable to load receipt history: ${studentReceiptsError.message}`);
  }

  if (receiptAdjustmentsError && !receiptAdjustmentsError.message.includes("does not exist")) {
    throw new Error(`Unable to load receipt adjustments: ${receiptAdjustmentsError.message}`);
  }

  if (conventionalAssignmentsError && !conventionalAssignmentsError.message.includes("does not exist")) {
    throw new Error(`Unable to load conventional discount receipt context: ${conventionalAssignmentsError.message}`);
  }

  if (installmentBalancesError && !installmentBalancesError.message.includes("does not exist")) {
    throw new Error(`Unable to load installment balances receipt context: ${installmentBalancesError.message}`);
  }

  if (paymentAdjustmentsError && !paymentAdjustmentsError.message.includes("does not exist")) {
    throw new Error(`Unable to load receipt adjustment context: ${paymentAdjustmentsError.message}`);
  }

  const paymentAdjustments = (
    (paymentAdjustmentsRaw ?? []) as Array<{
      payment_id: string;
      amount_delta: number;
      adjustment_type: string;
      reason: string | null;
    }>
  );
  const paymentAdjustmentTotals = new Map<string, number>();
  for (const adjustment of paymentAdjustments) {
    paymentAdjustmentTotals.set(
      adjustment.payment_id,
      (paymentAdjustmentTotals.get(adjustment.payment_id) ?? 0) + adjustment.amount_delta,
    );
  }

  const breakdown: ReceiptBreakdownItem[] = ((paymentsRaw ?? []) as ReceiptPaymentRow[])
    .map((row) => {
      const installment = toSingleRecord(row.installment_ref);

      if (!installment) {
        return null;
      }

      const adjustmentAmount = paymentAdjustmentTotals.get(row.id) ?? 0;
      const effectiveAmount = row.amount + adjustmentAmount;

      return {
        paymentId: row.id,
        installmentNo: installment.installment_no,
        installmentLabel: getDisplayInstallmentLabel({
          installmentNo: installment.installment_no,
          installmentLabel: installment.installment_label,
        }),
        sessionLabel: toSingleRecord(installment.class_ref)?.session_label ?? null,
        dueDate: installment.due_date,
        amount: effectiveAmount,
        originalAmount: row.amount,
        adjustmentAmount,
        effectiveAmount,
        notes: row.notes,
        discountAppliedAtPosting: row.discount_applied_at_posting ?? null,
        waiverAppliedAtPosting: row.waiver_applied_at_posting ?? null,
        pendingBeforePosting: row.pending_before_posting ?? null,
        pendingAfterPosting: row.pending_after_posting ?? null,
      };
    })
    .filter((value): value is ReceiptBreakdownItem => value !== null)
    .sort((left, right) => left.installmentNo - right.installmentNo);

  const student = toSingleRecord(receipt.student_ref);
  const studentClass = toSingleRecord(student?.class_ref ?? null);
  const createdByName = (userRaw as UserRow | null)?.full_name ?? null;
  const financial = (financialRaw ?? null) as WorkbookFinancialRow | null;
  const studentReceipts = (studentReceiptsRaw ?? []) as HistoricalReceiptRow[];
  const receiptAdjustments = (receiptAdjustmentsRaw ?? []) as ReceiptAdjustmentRow[];
  const currentReceiptIndex = studentReceipts.findIndex((row) => row.id === receipt.id);
  const receiptsUpToCurrent = currentReceiptIndex === -1 ? [] : studentReceipts.slice(0, currentReceiptIndex + 1);
  const receiptsBeforeCurrent = currentReceiptIndex <= 0 ? [] : studentReceipts.slice(0, currentReceiptIndex);
  const totalPaidBeforeReceipt = receiptsBeforeCurrent.reduce((sum, row) => sum + row.total_amount, 0);
  const totalPaidToDate = receiptsUpToCurrent.reduce((sum, row) => sum + row.total_amount, 0);
  const adjustmentTotals = buildReceiptAdjustmentTotals({
    currentReceiptId: receipt.id,
    receiptIdsUpToCurrent: receiptsUpToCurrent.map((row) => row.id),
    financialLateFeeTotal: financial?.late_fee_total ?? 0,
    adjustments: receiptAdjustments.map((row) => ({
      receiptId: row.receipt_id,
      adjustmentType: row.adjustment_type,
      amountDelta: row.amount_delta,
    })),
  });
  // Outstanding tracks base charges only — late fees are fines, not "expected".
  const outstandingAfterReceipt = Math.max(
    (financial?.base_charge_total ?? totalPaidToDate) - totalPaidToDate - adjustmentTotals.adjustmentsUpToCurrent,
    0,
  );
  const sessionLabel = resolveReceiptSessionLabel({
    paymentSessionLabels: breakdown.map((item) => item.sessionLabel),
    studentSessionLabel: studentClass?.session_label,
  });
  // Conventional discount policy rule: lowest candidate tuition wins (see
  // lib/fees/conventional-discount-rules.ts → applyConventionalDiscountsToTuition).
  // The receipt has historically rendered one savings row per active assignment,
  // which double-counts savings when a student holds two active policies. Keep
  // every assignment in the audit list, but mark the single winning row so the
  // receipt UI can show savings exactly once.
  const conventionalDiscountRows = (
    (conventionalAssignmentsRaw ?? []) as ConventionalDiscountAssignmentRow[]
  ).filter((row) => row.academic_session_label === sessionLabel);

  const winningAssignmentId = conventionalDiscountRows.reduce<
    { id: string; resulting: number } | null
  >((winner, row) => {
    const resulting = row.resulting_tuition_amount ?? Number.MAX_SAFE_INTEGER;
    if (!winner || resulting < winner.resulting) {
      return { id: row.id, resulting };
    }
    return winner;
  }, null)?.id ?? null;

  const historyReversalTotals = await getReceiptReversalTotals(
    receiptsBeforeCurrent.map((row) => row.id),
    supabase,
  );
  const previousReceipts: ReceiptHistoryItem[] = receiptsBeforeCurrent.map((row) => ({
    id: row.id,
    receiptNumber: row.receipt_number,
    paymentDate: row.payment_date,
    totalAmount: row.total_amount,
    isReversed: isReceiptReversed(historyReversalTotals, row.id, row.total_amount),
  }));

  const installmentStatus: ReceiptInstallmentStatusItem[] = buildInstallmentStatus(
    ((installmentBalancesRaw ?? []) as WorkbookInstallmentBalanceRow[]).filter(
      (row) => row.session_label === sessionLabel,
    ),
  );
  // Base-only outstanding (late fees excluded), summed from the per-installment
  // base pending so the headline reconciles with the status table.
  const baseOutstanding = installmentStatus.reduce((sum, item) => sum + item.pending, 0);

  // Use the raw payments rows, not `breakdown` — breakdown drops payments whose
  // installment lookup failed, and a reversal on such a row must still count.
  const receiptPaymentIds = new Set(
    ((paymentsRaw ?? []) as ReceiptPaymentRow[]).map((row) => row.id),
  );
  const receiptReversals = paymentAdjustments.filter(
    (row) =>
      receiptPaymentIds.has(row.payment_id) &&
      row.adjustment_type === "reversal" &&
      row.amount_delta < 0,
  );
  const reversedAmount = receiptReversals.reduce((sum, row) => sum + -row.amount_delta, 0);
  const isVoided = receipt.total_amount > 0 && reversedAmount >= receipt.total_amount;
  const voidReason = receiptReversals[0]?.reason ?? null;

  const conventionalDiscountAssignments: ConventionalDiscountAssignmentSummary[] =
    conventionalDiscountRows.map((row) => {
      const policy = toSingleRecord(row.policy_ref);

      return {
        assignmentId: row.id,
        policyCode: policy?.code ?? "unknown",
        policyDisplayName: policy?.display_name ?? "Conventional discount",
        beforeTuitionAmount: row.before_tuition_amount,
        resultingTuitionAmount: row.resulting_tuition_amount,
        isWinningPolicy: row.id === winningAssignmentId,
      };
    });

  return {
    id: receipt.id,
    studentId: receipt.student_id,
    receiptNumber: receipt.receipt_number,
    paymentDate: receipt.payment_date,
    paymentMode: receipt.payment_mode,
    totalAmount: receipt.total_amount,
    referenceNumber: receipt.reference_number,
    notes: receipt.notes,
    receivedBy: receipt.received_by,
    createdAt: receipt.created_at,
    createdByName,
    studentFullName: student?.full_name ?? "Unknown student",
    admissionNo: student?.admission_no ?? "N/A",
    fatherName: student?.father_name ?? null,
    fatherPhone: student?.primary_phone ?? null,
    motherPhone: student?.secondary_phone ?? null,
    // Scoped to this receipt's session on purpose: a student can sit in a
    // different family group year to year, and a statement built from last
    // year's group would show the wrong siblings.
    familyGroupId:
      student?.family_links?.find((link) => link.academic_session_label === sessionLabel)
        ?.family_group_id ?? null,
    parentEmail: student?.email ?? null,
    classLabel: buildClassLabel(student?.class_ref ?? null),
    sessionLabel,
    transportRouteLabel: buildRouteLabel(student?.route_ref ?? null),
    studentStatusLabel: financial?.student_status_label ?? "Old",
    feeSummary: buildFeeSummary(financial, {
      discountAmount: adjustmentTotals.receiptDiscountAmount,
      lateFeeAmount: adjustmentTotals.receiptLateFeeAmount,
      lateFeeWaived: adjustmentTotals.receiptLateFeeWaived,
    }),
    totalDue: financial ? (financial.base_charge_total ?? (financial.total_due - financial.late_fee_total)) : totalPaidToDate,
    totalPaidBeforeReceipt,
    totalPaidToDate,
    outstandingAfterReceipt,
    currentOutstanding: financial ? baseOutstanding : outstandingAfterReceipt,
    discountAmount: adjustmentTotals.receiptDiscountAmount,
    lateFeeAmount: adjustmentTotals.receiptLateFeeAmount,
    lateFeeWaived: adjustmentTotals.receiptLateFeeWaived,
    breakdown,
    installmentStatus,
    previousReceipts,
    conventionalDiscountAssignments,
    reversedAmount,
    isVoided,
    voidReason,
  };
}
