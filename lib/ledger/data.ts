import "server-only";

import type { AdjustmentType } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";
import type {
  LedgerAdjustmentRow,
  LedgerEntryFilter,
  LedgerPageData,
  LedgerPaymentRow,
  LedgerSelectedStudent,
  LedgerStudentOption,
} from "@/lib/ledger/types";

type StudentClassRow = {
  class_name: string;
  section: string | null;
  stream_name: string | null;
};

type StudentRow = {
  id: string;
  full_name: string;
  admission_no: string;
  class_ref: StudentClassRow | StudentClassRow[] | null;
};

type ReceiptRow = {
  receipt_number: string;
  payment_date: string;
  payment_mode: "cash" | "upi" | "bank_transfer" | "cheque";
  reference_number: string | null;
  received_by: string | null;
};

type InstallmentRow = {
  installment_label: string;
  due_date: string;
};

type PaymentRow = {
  id: string;
  amount: number;
  notes: string | null;
  created_at: string;
  receipt_ref: ReceiptRow | ReceiptRow[] | null;
  installment_ref: InstallmentRow | InstallmentRow[] | null;
};

type PaymentAdjustmentRow = {
  id: string;
  payment_id: string;
  amount_delta: number;
  adjustment_type: AdjustmentType;
  reason: string;
  notes: string | null;
  created_at: string;
  created_by: string | null;
};

type UserRow = {
  id: string;
  full_name: string;
};

type InstallmentBalanceRow = {
  outstanding_amount: number;
};

function toSingleRecord<T>(value: T | T[] | null) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function buildClassLabel(value: {
  class_name: string;
  section: string | null;
  stream_name: string | null;
}) {
  const parts = [value.class_name];

  if (value.section) {
    parts.push(`Section ${value.section}`);
  }

  if (value.stream_name) {
    parts.push(value.stream_name);
  }

  return parts.join(" - ");
}

function mapStudentOptions(rows: StudentRow[]): LedgerStudentOption[] {
  return rows.map((row) => {
    const classRef = toSingleRecord(row.class_ref);

    return {
      id: row.id,
      fullName: row.full_name,
      admissionNo: row.admission_no,
      classLabel: classRef ? buildClassLabel(classRef) : "Unknown class",
    };
  });
}

function normalizeEntryFilter(value: string | undefined): LedgerEntryFilter {
  if (value === "payments" || value === "adjustments") {
    return value;
  }

  return "all";
}

function buildAdjustmentMap(rows: PaymentAdjustmentRow[]) {
  return rows.reduce(
    (acc, row) => {
      const existing = acc.get(row.payment_id);

      if (existing) {
        existing.count += 1;
        existing.net += row.amount_delta;
      } else {
        acc.set(row.payment_id, {
          count: 1,
          net: row.amount_delta,
        });
      }

      return acc;
    },
    new Map<string, { count: number; net: number }>(),
  );
}

function rowMatchesQuery(value: string, query: string) {
  return value.toLowerCase().includes(query.toLowerCase());
}

function buildPaymentSearchText(row: LedgerPaymentRow) {
  return [
    row.receiptNumber,
    row.installmentLabel,
    row.paymentMode,
    row.referenceNumber ?? "",
    row.receivedBy ?? "",
    row.notes ?? "",
  ].join(" ");
}

function buildAdjustmentSearchText(row: LedgerAdjustmentRow) {
  return [
    row.receiptNumber,
    row.installmentLabel,
    row.adjustmentType,
    row.reason,
    row.notes ?? "",
    row.createdByName ?? "",
  ].join(" ");
}

function filterByEntry(
  payments: LedgerPaymentRow[],
  adjustments: LedgerAdjustmentRow[],
  filter: LedgerEntryFilter,
  query: string,
) {
  const normalizedQuery = query.trim();
  const shouldFilterText = normalizedQuery.length > 0;

  const filteredPayments =
    filter === "adjustments"
      ? []
      : payments.filter((row) =>
          shouldFilterText ? rowMatchesQuery(buildPaymentSearchText(row), normalizedQuery) : true,
        );

  const filteredAdjustments =
    filter === "payments"
      ? []
      : adjustments.filter((row) =>
          shouldFilterText
            ? rowMatchesQuery(buildAdjustmentSearchText(row), normalizedQuery)
            : true,
        );

  return {
    payments: filteredPayments,
    adjustments: filteredAdjustments,
  };
}

function buildSelectedStudent(
  student: LedgerStudentOption,
  filteredPayments: LedgerPaymentRow[],
  filteredAdjustments: LedgerAdjustmentRow[],
  allPayments: LedgerPaymentRow[],
  allAdjustments: LedgerAdjustmentRow[],
): LedgerSelectedStudent {
  const totalPayments = allPayments.reduce((sum, row) => sum + row.paymentAmount, 0);
  const totalAdjustmentNet = allAdjustments.reduce((sum, row) => sum + row.amountDelta, 0);
  const totalCreditAdjustments = allAdjustments
    .filter((row) => row.amountDelta > 0)
    .reduce((sum, row) => sum + row.amountDelta, 0);
  const totalDebitAdjustments = allAdjustments
    .filter((row) => row.amountDelta < 0)
    .reduce((sum, row) => sum + Math.abs(row.amountDelta), 0);

  return {
    id: student.id,
    fullName: student.fullName,
    admissionNo: student.admissionNo,
    classLabel: student.classLabel,
    paymentOptions: allPayments,
    payments: filteredPayments,
    adjustments: filteredAdjustments,
    totalPayments,
    totalAdjustmentNet,
    totalCreditAdjustments,
    totalDebitAdjustments,
  };
}

export async function getLedgerPageData(payload: {
  searchQuery: string;
  studentId: string | null;
  entryFilter: string | undefined;
  entryQuery: string;
}): Promise<LedgerPageData> {
  const supabase = await createClient();

  let studentsQuery = supabase
    .from("students")
    .select(
      "id, full_name, admission_no, class_ref:classes(class_name, section, stream_name)",
    )
    .in("status", ["active", "inactive"])
    .order("full_name", { ascending: true })
    .limit(150);

  const normalizedSearchQuery = payload.searchQuery.trim();

  if (normalizedSearchQuery) {
    studentsQuery = studentsQuery.or(
      `full_name.ilike.%${normalizedSearchQuery}%,admission_no.ilike.%${normalizedSearchQuery}%`,
    );
  }

  const { data: studentsRaw, error: studentsError } = await studentsQuery;

  if (studentsError) {
    throw new Error(`Unable to load students for ledger: ${studentsError.message}`);
  }

  const studentOptions = mapStudentOptions((studentsRaw ?? []) as StudentRow[]);

  const entryFilter = normalizeEntryFilter(payload.entryFilter);
  const entryQuery = payload.entryQuery.trim();

  if (!payload.studentId) {
    return {
      searchQuery: normalizedSearchQuery,
      entryFilter,
      entryQuery,
      studentOptions,
      selectedStudent: null,
    };
  }

  const selectedStudent = studentOptions.find((student) => student.id === payload.studentId);

  if (!selectedStudent) {
    return {
      searchQuery: normalizedSearchQuery,
      entryFilter,
      entryQuery,
      studentOptions,
      selectedStudent: null,
    };
  }

  const [{ data: paymentsRaw, error: paymentsError }, { data: adjustmentsRaw, error: adjustmentsError }] =
    await Promise.all([
      supabase
        .from("payments")
        .select(
          "id, amount, notes, created_at, receipt_ref:receipts(receipt_number, payment_date, payment_mode, reference_number, received_by), installment_ref:installments(installment_label, due_date)",
        )
        .eq("student_id", selectedStudent.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("payment_adjustments")
        .select("id, payment_id, amount_delta, adjustment_type, reason, notes, created_at, created_by")
        .eq("student_id", selectedStudent.id)
        .order("created_at", { ascending: false }),
    ]);

  if (paymentsError) {
    throw new Error(`Unable to load payment history: ${paymentsError.message}`);
  }

  if (adjustmentsError) {
    throw new Error(`Unable to load adjustment history: ${adjustmentsError.message}`);
  }

  const adjustmentRows = (adjustmentsRaw ?? []) as PaymentAdjustmentRow[];
  const adjustmentMap = buildAdjustmentMap(adjustmentRows);

  const paymentRows: LedgerPaymentRow[] = ((paymentsRaw ?? []) as PaymentRow[])
    .map((row) => {
      const receiptRef = toSingleRecord(row.receipt_ref);
      const installmentRef = toSingleRecord(row.installment_ref);

      if (!receiptRef || !installmentRef) {
        return null;
      }

      const linkedAdjustments = adjustmentMap.get(row.id) ?? { count: 0, net: 0 };

      return {
        id: row.id,
        createdAt: row.created_at,
        paymentDate: receiptRef.payment_date,
        receiptNumber: receiptRef.receipt_number,
        installmentLabel: installmentRef.installment_label,
        dueDate: installmentRef.due_date,
        paymentMode: receiptRef.payment_mode,
        paymentAmount: row.amount,
        referenceNumber: receiptRef.reference_number,
        receivedBy: receiptRef.received_by,
        notes: row.notes,
        adjustmentCount: linkedAdjustments.count,
        adjustmentNetDelta: linkedAdjustments.net,
      };
    })
    .filter((row): row is LedgerPaymentRow => row !== null);

  const paymentMap = new Map<string, LedgerPaymentRow>(
    paymentRows.map((payment) => [payment.id, payment]),
  );

  const creatorIds = Array.from(
    new Set(
      adjustmentRows
        .map((row) => row.created_by)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const creatorNameMap = new Map<string, string>();

  if (creatorIds.length > 0) {
    const { data: creatorsRaw, error: creatorsError } = await supabase
      .from("users")
      .select("id, full_name")
      .in("id", creatorIds);

    if (creatorsError) {
      throw new Error(`Unable to load adjustment creator details: ${creatorsError.message}`);
    }

    ((creatorsRaw ?? []) as UserRow[]).forEach((row) => {
      creatorNameMap.set(row.id, row.full_name);
    });
  }

  const mappedAdjustments: LedgerAdjustmentRow[] = adjustmentRows
    .map((row) => {
      const linkedPayment = paymentMap.get(row.payment_id);

      if (!linkedPayment) {
        return null;
      }

      return {
        id: row.id,
        createdAt: row.created_at,
        paymentId: row.payment_id,
        receiptNumber: linkedPayment.receiptNumber,
        paymentDate: linkedPayment.paymentDate,
        installmentLabel: linkedPayment.installmentLabel,
        dueDate: linkedPayment.dueDate,
        paymentAmount: linkedPayment.paymentAmount,
        adjustmentType: row.adjustment_type,
        amountDelta: row.amount_delta,
        reason: row.reason,
        notes: row.notes,
        createdBy: row.created_by,
        createdByName: row.created_by ? (creatorNameMap.get(row.created_by) ?? null) : null,
      };
    })
    .filter((row): row is LedgerAdjustmentRow => row !== null);

  const filtered = filterByEntry(paymentRows, mappedAdjustments, entryFilter, entryQuery);

  return {
    searchQuery: normalizedSearchQuery,
    entryFilter,
    entryQuery,
    studentOptions,
    selectedStudent: buildSelectedStudent(
      selectedStudent,
      filtered.payments,
      filtered.adjustments,
      paymentRows,
      mappedAdjustments,
    ),
  };
}

export async function addPaymentAdjustment(payload: {
  studentId: string;
  paymentId: string;
  adjustmentType: AdjustmentType;
  amountDelta: number;
  reason: string;
  notes: string | null;
}) {
  const supabase = await createClient();

  const { data: paymentRaw, error: paymentError } = await supabase
    .from("payments")
    .select("id, installment_id")
    .eq("id", payload.paymentId)
    .eq("student_id", payload.studentId)
    .single();

  if (paymentError || !paymentRaw) {
    throw new Error("Selected payment row was not found for this student.");
  }

  if (payload.amountDelta > 0) {
    const { data: balanceRaw, error: balanceError } = await supabase
      .from("v_installment_balances")
      .select("outstanding_amount")
      .eq("student_id", payload.studentId)
      .eq("installment_id", paymentRaw.installment_id)
      .single();

    if (balanceError || !balanceRaw) {
      throw new Error("Unable to validate installment balance for this adjustment.");
    }

    const balance = balanceRaw as InstallmentBalanceRow;

    if (payload.amountDelta > balance.outstanding_amount) {
      throw new Error("Positive adjustment cannot exceed current outstanding amount for this installment.");
    }
  }

  const { data: insertedRaw, error: insertError } = await supabase
    .from("payment_adjustments")
    .insert({
      payment_id: paymentRaw.id,
      student_id: payload.studentId,
      installment_id: paymentRaw.installment_id,
      adjustment_type: payload.adjustmentType,
      amount_delta: payload.amountDelta,
      reason: payload.reason,
      notes: payload.notes,
    })
    .select("id, created_at")
    .single();

  if (insertError || !insertedRaw) {
    throw new Error(insertError?.message ?? "Unable to add adjustment right now.");
  }

  const { data: auditRaw, error: auditError } = await supabase
    .from("audit_logs")
    .select("id")
    .eq("table_name", "payment_adjustments")
    .eq("record_id", insertedRaw.id)
    .eq("action", "insert")
    .limit(1)
    .maybeSingle();

  if (auditError || !auditRaw) {
    throw new Error("Adjustment was saved but audit trail was not confirmed. Please contact admin.");
  }

  return {
    id: insertedRaw.id,
    createdAt: insertedRaw.created_at,
  };
}
