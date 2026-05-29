import "server-only";

import * as React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

import { schoolProfile } from "@/lib/config/school";
import {
  buildFeeBreakdownSummary,
  type FeeBreakdownSummary,
} from "@/lib/fees/fee-breakdown-summary";

// react-pdf's built-in Helvetica font has no ₹ glyph, so amounts use an ASCII
// "Rs." prefix to stay legible in the generated PDF.
function rs(value: number): string {
  const rounded = Math.round(value || 0);
  return `Rs. ${rounded.toLocaleString("en-IN")}`;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export type FeePdfStudent = {
  fullName: string;
  admissionNo: string;
  classLabel: string;
  fatherName: string | null;
  phones: string[];
  summary: FeeBreakdownSummary;
  installments: Array<{
    label: string;
    dueDate: string;
    baseCharge: number;
    lateFee: number;
    paid: number;
    pending: number;
    status: string;
  }>;
  receipts: Array<{
    number: string;
    date: string;
    modeLabel: string;
    amount: number;
  }>;
};

/** Shape of the per-student workspace produced by getStudentWorkspaceData. */
type WorkspaceLike = {
  student: {
    fullName: string;
    admissionNo: string;
    classLabel: string;
    fatherName: string | null;
    fatherPhone: string | null;
    motherPhone: string | null;
  } | null;
  financialSnapshot: {
    resolvedBreakdown: Parameters<typeof buildFeeBreakdownSummary>[0]["resolvedBreakdown"];
  } | null;
  installmentBalances: Array<{
    installmentLabel: string;
    dueDate: string;
    baseCharge: number;
    finalLateFee: number;
    paidAmount: number;
    pendingAmount: number;
    waiverApplied: number;
    balanceStatus: string;
  }>;
  receipts: Array<{
    receiptNumber: string;
    paymentDate: string;
    totalAmount: number;
    paymentMode: string;
    paymentModeLabel: string;
  }>;
};

/** Map a loaded workspace into the data the PDF renders. Returns null if the
 * workspace has no student / fee snapshot (nothing to print). */
export function toFeePdfStudent(workspace: WorkspaceLike): FeePdfStudent | null {
  const { student, financialSnapshot, installmentBalances, receipts } = workspace;
  if (!student || !financialSnapshot) {
    return null;
  }

  const discountCloseouts = receipts
    .filter((r) => r.paymentMode === "discount")
    .reduce((sum, r) => sum + r.totalAmount, 0);

  const summary = buildFeeBreakdownSummary({
    resolvedBreakdown: financialSnapshot.resolvedBreakdown,
    installmentBalances,
    discountCloseouts,
  });

  const phones = [student.fatherPhone?.trim(), student.motherPhone?.trim()].filter(
    (p): p is string => Boolean(p),
  );

  return {
    fullName: student.fullName,
    admissionNo: student.admissionNo,
    classLabel: student.classLabel,
    fatherName: student.fatherName,
    phones,
    summary,
    installments: installmentBalances.map((b) => ({
      label: b.installmentLabel,
      dueDate: b.dueDate,
      baseCharge: b.baseCharge,
      lateFee: b.finalLateFee,
      paid: b.paidAmount,
      pending: b.pendingAmount,
      status: b.balanceStatus,
    })),
    // Cash receipts first; discount-mode write-offs are summarised separately.
    receipts: receipts
      .filter((r) => r.paymentMode !== "discount")
      .map((r) => ({
        number: r.receiptNumber,
        date: r.paymentDate,
        modeLabel: r.paymentModeLabel,
        amount: r.totalAmount,
      })),
  };
}

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 9, color: "#1f2937", fontFamily: "Helvetica" },
  schoolName: { fontSize: 15, fontFamily: "Helvetica-Bold", color: "#111827" },
  schoolMeta: { fontSize: 8, color: "#6b7280", marginTop: 2 },
  docTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 10, color: "#111827" },
  rule: { borderBottomWidth: 1, borderBottomColor: "#e5e7eb", marginVertical: 8 },
  studentHead: { marginTop: 6 },
  studentName: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#111827" },
  studentMeta: { fontSize: 8.5, color: "#374151", marginTop: 2 },
  sectionTitle: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    marginTop: 12,
    marginBottom: 4,
    color: "#111827",
  },
  row: { flexDirection: "row" },
  cellLabel: { flex: 1 },
  cellAmount: { width: 90, textAlign: "right", fontFamily: "Helvetica" },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    paddingVertical: 3,
    paddingHorizontal: 4,
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eceff3",
  },
  th: { flex: 1 },
  thRight: { flex: 1, textAlign: "right" },
  summaryBox: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 4,
    padding: 8,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  summaryTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 4,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    fontFamily: "Helvetica-Bold",
  },
  muted: { color: "#6b7280" },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 28,
    right: 28,
    fontSize: 7.5,
    color: "#9ca3af",
    textAlign: "center",
  },
});

function SummaryLine({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <View style={strong ? styles.summaryTotal : styles.summaryRow}>
      <Text style={muted ? styles.muted : undefined}>{label}</Text>
      <Text style={muted ? styles.muted : undefined}>{value}</Text>
    </View>
  );
}

function StudentFeeSection({ student, sessionLabel }: { student: FeePdfStudent; sessionLabel: string }) {
  const s = student.summary;
  return (
    <View wrap={false} style={styles.studentHead}>
      <Text style={styles.studentName}>{student.fullName}</Text>
      <Text style={styles.studentMeta}>
        SR {student.admissionNo} | {student.classLabel} | Session {sessionLabel}
        {student.fatherName ? ` | Father: ${student.fatherName}` : ""}
        {student.phones.length ? ` | ${student.phones.join(", ")}` : ""}
      </Text>

      <Text style={styles.sectionTitle}>Fee heads</Text>
      {student.summary.rows.map((row, idx) => (
        <View style={styles.row} key={`${row.id}-${idx}`}>
          <Text style={styles.cellLabel}>{row.label}</Text>
          <Text style={styles.cellAmount}>
            {row.kind === "discount" ? `- ${rs(Math.abs(row.amount))}` : rs(row.amount)}
          </Text>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Installments</Text>
      <View style={styles.tableHeader}>
        <Text style={styles.th}>Installment</Text>
        <Text style={styles.th}>Due date</Text>
        <Text style={styles.thRight}>Base</Text>
        <Text style={styles.thRight}>Late fee</Text>
        <Text style={styles.thRight}>Paid</Text>
        <Text style={styles.thRight}>Pending</Text>
      </View>
      {student.installments.map((inst, idx) => (
        <View style={styles.tableRow} key={idx}>
          <Text style={styles.th}>{inst.label}</Text>
          <Text style={styles.th}>{formatDate(inst.dueDate)}</Text>
          <Text style={styles.thRight}>{rs(inst.baseCharge)}</Text>
          <Text style={styles.thRight}>{inst.lateFee > 0 ? rs(inst.lateFee) : "-"}</Text>
          <Text style={styles.thRight}>{rs(inst.paid)}</Text>
          <Text style={styles.thRight}>{rs(inst.pending)}</Text>
        </View>
      ))}

      {student.receipts.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Receipts</Text>
          <View style={styles.tableHeader}>
            <Text style={styles.th}>Receipt</Text>
            <Text style={styles.th}>Date</Text>
            <Text style={styles.th}>Mode</Text>
            <Text style={styles.thRight}>Amount</Text>
          </View>
          {student.receipts.map((r, idx) => (
            <View style={styles.tableRow} key={idx}>
              <Text style={styles.th}>{r.number}</Text>
              <Text style={styles.th}>{formatDate(r.date)}</Text>
              <Text style={styles.th}>{r.modeLabel}</Text>
              <Text style={styles.thRight}>{rs(r.amount)}</Text>
            </View>
          ))}
        </>
      ) : null}

      <View style={styles.summaryBox}>
        <SummaryLine label="Expected (before discount)" value={rs(s.expectedGross)} />
        {s.totalDiscount > 0 ? (
          <SummaryLine label="Discounts (conventional + manual)" value={`- ${rs(s.totalDiscount)}`} muted />
        ) : null}
        <SummaryLine label="Expected (net)" value={rs(s.expectedNet)} strong />
        {s.lateFeeCharged > 0 ? <SummaryLine label="Late fee" value={rs(s.lateFeeCharged)} muted /> : null}
        {s.lateFeeWaiver > 0 ? (
          <SummaryLine label="Late-fee waived" value={`- ${rs(s.lateFeeWaiver)}`} muted />
        ) : null}
        <SummaryLine label="Paid (cash)" value={rs(s.paid)} />
        {s.discountCloseouts > 0 ? (
          <SummaryLine label="Closed as discount" value={`- ${rs(s.discountCloseouts)}`} muted />
        ) : null}
        <SummaryLine label="Pending" value={rs(s.pending)} strong />
      </View>
    </View>
  );
}

function FeeStatementDocument({
  students,
  sessionLabel,
  title,
}: {
  students: FeePdfStudent[];
  sessionLabel: string;
  title: string;
}) {
  return (
    <Document title={title}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.schoolName}>{schoolProfile.name}</Text>
        <Text style={styles.schoolMeta}>Fee statement | Session {sessionLabel}</Text>
        <Text style={styles.docTitle}>{title}</Text>
        <View style={styles.rule} />

        {students.map((student, idx) => (
          <View key={idx}>
            {idx > 0 ? <View style={styles.rule} /> : null}
            <StudentFeeSection student={student} sessionLabel={sessionLabel} />
          </View>
        ))}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `${schoolProfile.name} - computer-generated fee statement - page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}

export async function renderFeeStatementPdf(input: {
  students: FeePdfStudent[];
  sessionLabel: string;
  title: string;
}): Promise<Buffer> {
  return renderToBuffer(
    <FeeStatementDocument
      students={input.students}
      sessionLabel={input.sessionLabel}
      title={input.title}
    />,
  );
}
