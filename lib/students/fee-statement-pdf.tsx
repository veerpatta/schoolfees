import "server-only";

import * as path from "node:path";
import * as React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  renderToBuffer,
} from "@react-pdf/renderer";

import { schoolProfile } from "@/lib/config/school";
import { localizedFeeLabel } from "@/lib/fees/fee-label";
import { createBilingualReceiptTranslator } from "@/lib/i18n/bilingual-receipt";
import {
  buildFeeBreakdownSummary,
  type FeeBreakdownSummary,
} from "@/lib/fees/fee-breakdown-summary";

// Devanagari font for the Hindi half of every bilingual label. The built-in
// Helvetica (used for English + amounts) has no Devanagari glyphs, and this
// Noto face has no Latin letters — so each <Text> picks its family by script.
// The TTFs ship in public/fonts and are traced into the fee-pdf routes via
// `outputFileTracingIncludes` in next.config.ts.
const HI_FONT = "NotoDevanagari";
let fontRegistered = false;
function ensureFontRegistered() {
  if (fontRegistered) return;
  Font.register({
    family: HI_FONT,
    fonts: [
      { src: path.join(process.cwd(), "public/fonts/NotoSansDevanagari-Regular.ttf") },
      {
        src: path.join(process.cwd(), "public/fonts/NotoSansDevanagari-Bold.ttf"),
        fontWeight: "bold",
      },
    ],
  });
  fontRegistered = true;
}

// Statement-specific bilingual labels. Fee-head row labels reuse the shared
// `localizedFeeLabel` so the PDF and the on-screen receipt read identically.
const PL = {
  feeStatement: { en: "Fee statement", hi: "शुल्क विवरण" },
  session: { en: "Session", hi: "सत्र" },
  feeHeads: { en: "Fee heads", hi: "शुल्क मदें" },
  installments: { en: "Installments", hi: "किस्तें" },
  installment: { en: "Installment", hi: "किस्त" },
  dueDate: { en: "Due date", hi: "देय तिथि" },
  base: { en: "Base", hi: "मूल" },
  lateFee: { en: "Late fee", hi: "विलंब शुल्क" },
  paid: { en: "Paid", hi: "जमा" },
  pending: { en: "Pending", hi: "बकाया" },
  receipts: { en: "Receipts", hi: "रसीदें" },
  receipt: { en: "Receipt", hi: "रसीद" },
  date: { en: "Date", hi: "तिथि" },
  mode: { en: "Mode", hi: "माध्यम" },
  amount: { en: "Amount", hi: "राशि" },
  expectedGross: { en: "Expected (before discount)", hi: "अपेक्षित (छूट से पहले)" },
  discounts: { en: "Discounts (conventional + manual)", hi: "छूट (पारंपरिक + मैनुअल)" },
  expectedNet: { en: "Expected (net)", hi: "अपेक्षित (शुद्ध)" },
  lateFeeWaived: { en: "Late-fee waived", hi: "विलंब शुल्क माफ" },
  paidCash: { en: "Paid (cash)", hi: "जमा (नकद)" },
  closedAsDiscount: { en: "Closed as discount", hi: "छूट के रूप में बंद" },
} as const;

// react-pdf's built-in Helvetica has no ₹ glyph, so amounts use an ASCII
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
  schoolMetaHi: { fontSize: 8, color: "#6b7280", marginTop: 1, fontFamily: HI_FONT },
  docTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 10, color: "#111827" },
  rule: { borderBottomWidth: 1, borderBottomColor: "#e5e7eb", marginVertical: 8 },
  studentHead: { marginTop: 6 },
  studentName: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#111827" },
  studentMeta: { fontSize: 8.5, color: "#374151", marginTop: 2 },
  sectionTitle: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    marginTop: 12,
    color: "#111827",
  },
  sectionTitleHi: {
    fontSize: 8.5,
    fontFamily: HI_FONT,
    color: "#6b7280",
    marginBottom: 4,
  },
  row: { flexDirection: "row" },
  cellLabel: { flex: 1 },
  cellLabelHi: { fontFamily: HI_FONT, fontSize: 7.5, color: "#6b7280" },
  cellAmount: { width: 90, textAlign: "right", fontFamily: "Helvetica" },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    paddingVertical: 3,
    paddingHorizontal: 4,
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
  thEn: { fontFamily: "Helvetica-Bold" },
  thEnRight: { fontFamily: "Helvetica-Bold", textAlign: "right" },
  thHi: { fontFamily: HI_FONT, fontSize: 7, color: "#6b7280" },
  thHiRight: { fontFamily: HI_FONT, fontSize: 7, color: "#6b7280", textAlign: "right" },
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
  summaryLabelHi: { fontFamily: HI_FONT, fontSize: 7.5, color: "#6b7280" },
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

/** A bilingual section heading: English bold over muted Devanagari. */
function SectionTitle({ label }: { label: { en: string; hi: string } }) {
  return (
    <>
      <Text style={styles.sectionTitle}>{label.en}</Text>
      <Text style={styles.sectionTitleHi}>{label.hi}</Text>
    </>
  );
}

/** A bilingual table-header cell (English over muted Devanagari). */
function Th({ label, right }: { label: { en: string; hi: string }; right?: boolean }) {
  return (
    <View style={right ? styles.thRight : styles.th}>
      <Text style={right ? styles.thEnRight : styles.thEn}>{label.en}</Text>
      <Text style={right ? styles.thHiRight : styles.thHi}>{label.hi}</Text>
    </View>
  );
}

function SummaryLine({
  label,
  hiLabel,
  value,
  muted,
  strong,
}: {
  label: string;
  hiLabel: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <View style={strong ? styles.summaryTotal : styles.summaryRow}>
      <View>
        <Text style={muted ? styles.muted : undefined}>{label}</Text>
        <Text style={styles.summaryLabelHi}>{hiLabel}</Text>
      </View>
      <Text style={muted ? styles.muted : undefined}>{value}</Text>
    </View>
  );
}

function StudentFeeSection({
  student,
  sessionLabel,
  enT,
  hiT,
}: {
  student: FeePdfStudent;
  sessionLabel: string;
  enT: (key: string) => string;
  hiT: (key: string) => string;
}) {
  const s = student.summary;
  return (
    <View wrap={false} style={styles.studentHead}>
      <Text style={styles.studentName}>{student.fullName}</Text>
      <Text style={styles.studentMeta}>
        SR {student.admissionNo} | {student.classLabel} | {PL.session.en} {sessionLabel}
        {student.fatherName ? ` | Father: ${student.fatherName}` : ""}
        {student.phones.length ? ` | ${student.phones.join(", ")}` : ""}
      </Text>

      <SectionTitle label={PL.feeHeads} />
      {student.summary.rows.map((row, idx) => (
        <View style={styles.row} key={`${row.id}-${idx}`}>
          <View style={styles.cellLabel}>
            <Text>{localizedFeeLabel(row.label, enT)}</Text>
            {localizedFeeLabel(row.label, hiT) !== localizedFeeLabel(row.label, enT) ? (
              <Text style={styles.cellLabelHi}>{localizedFeeLabel(row.label, hiT)}</Text>
            ) : null}
          </View>
          <Text style={styles.cellAmount}>
            {row.kind === "discount" ? `- ${rs(Math.abs(row.amount))}` : rs(row.amount)}
          </Text>
        </View>
      ))}

      <SectionTitle label={PL.installments} />
      <View style={styles.tableHeader}>
        <Th label={PL.installment} />
        <Th label={PL.dueDate} />
        <Th label={PL.base} right />
        <Th label={PL.lateFee} right />
        <Th label={PL.paid} right />
        <Th label={PL.pending} right />
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
          <SectionTitle label={PL.receipts} />
          <View style={styles.tableHeader}>
            <Th label={PL.receipt} />
            <Th label={PL.date} />
            <Th label={PL.mode} />
            <Th label={PL.amount} right />
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
        <SummaryLine label={PL.expectedGross.en} hiLabel={PL.expectedGross.hi} value={rs(s.expectedGross)} />
        {s.totalDiscount > 0 ? (
          <SummaryLine
            label={PL.discounts.en}
            hiLabel={PL.discounts.hi}
            value={`- ${rs(s.totalDiscount)}`}
            muted
          />
        ) : null}
        <SummaryLine label={PL.expectedNet.en} hiLabel={PL.expectedNet.hi} value={rs(s.expectedNet)} strong />
        {s.lateFeeCharged > 0 ? (
          <SummaryLine label={PL.lateFee.en} hiLabel={PL.lateFee.hi} value={rs(s.lateFeeCharged)} muted />
        ) : null}
        {s.lateFeeWaiver > 0 ? (
          <SummaryLine
            label={PL.lateFeeWaived.en}
            hiLabel={PL.lateFeeWaived.hi}
            value={`- ${rs(s.lateFeeWaiver)}`}
            muted
          />
        ) : null}
        <SummaryLine label={PL.paidCash.en} hiLabel={PL.paidCash.hi} value={rs(s.paid)} />
        {s.discountCloseouts > 0 ? (
          <SummaryLine
            label={PL.closedAsDiscount.en}
            hiLabel={PL.closedAsDiscount.hi}
            value={`- ${rs(s.discountCloseouts)}`}
            muted
          />
        ) : null}
        <SummaryLine label={PL.pending.en} hiLabel={PL.pending.hi} value={rs(s.pending)} strong />
      </View>
    </View>
  );
}

function FeeStatementDocument({
  students,
  sessionLabel,
  title,
  enT,
  hiT,
}: {
  students: FeePdfStudent[];
  sessionLabel: string;
  title: string;
  enT: (key: string) => string;
  hiT: (key: string) => string;
}) {
  return (
    <Document title={title}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.schoolName}>{schoolProfile.name}</Text>
        <Text style={styles.schoolMeta}>
          {PL.feeStatement.en} | {PL.session.en} {sessionLabel}
        </Text>
        <Text style={styles.schoolMetaHi}>
          {PL.feeStatement.hi} | {PL.session.hi} {sessionLabel}
        </Text>
        <Text style={styles.docTitle}>{title}</Text>
        <View style={styles.rule} />

        {students.map((student, idx) => (
          <View key={idx}>
            {idx > 0 ? <View style={styles.rule} /> : null}
            <StudentFeeSection student={student} sessionLabel={sessionLabel} enT={enT} hiT={hiT} />
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
  ensureFontRegistered();
  const bt = createBilingualReceiptTranslator();
  return renderToBuffer(
    <FeeStatementDocument
      students={input.students}
      sessionLabel={input.sessionLabel}
      title={input.title}
      enT={bt.en}
      hiT={bt.hi}
    />,
  );
}
