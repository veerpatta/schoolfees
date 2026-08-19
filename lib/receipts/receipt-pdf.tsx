import "server-only";

import * as React from "react";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import { schoolProfile } from "@/lib/config/school";
import { isYearCleared } from "@/lib/fees/year-clear";
import { englishAmountWords } from "@/lib/helpers/amount-in-words";
import { amountInWordsHindi } from "@/lib/helpers/amount-in-words-hi";
import {
  Badge,
  ensurePdfFontsRegistered,
  formatPdfDate,
  HI_FONT,
  loadLogoImage,
  pdfTokens,
  renderQrDataUri,
  rs,
  SchoolLetterhead,
  sharedStyles,
  Th,
} from "@/lib/pdf/document-kit";
import type { ReceiptDetail } from "@/lib/receipts/types";

/**
 * A fee receipt as an actual PDF file.
 *
 * Until now the only way to get a receipt out of this system was to open it in a
 * browser and print. That is fine at the counter and useless everywhere else —
 * an assistant cannot hand a parent a web page, and there was nothing to attach
 * to a message.
 *
 * This mirrors components/receipts/receipt-document-v3.tsx section by section.
 * Where it cannot (react-pdf has no `transform`, so no rotated stamps, and
 * Helvetica has no ₹ glyph) the divergence is deliberate and noted. Everything
 * that is a *number* is computed the same way as the screen, from the same
 * helpers, because a printed receipt that disagrees with the one on the monitor
 * is worse than no PDF at all.
 */

const L = {
  receipt: { en: "FEE RECEIPT", hi: "शुल्क रसीद" },
  receiptNo: { en: "Receipt no.", hi: "रसीद संख्या" },
  session: { en: "Session", hi: "सत्र" },
  date: { en: "Date", hi: "तिथि" },
  student: { en: "Student", hi: "छात्र" },
  srNo: { en: "SR no.", hi: "क्रम संख्या" },
  father: { en: "Father", hi: "पिता" },
  className: { en: "Class", hi: "कक्षा" },
  mode: { en: "Payment mode", hi: "भुगतान माध्यम" },
  receivedBy: { en: "Received by", hi: "प्राप्तकर्ता" },
  amountPaid: { en: "Amount paid", hi: "जमा राशि" },
  amountInWords: { en: "In words", hi: "शब्दों में" },
  paidFor: { en: "What this receipt paid", hi: "इस रसीद से भुगतान" },
  installment: { en: "Installment", hi: "किस्त" },
  dueDate: { en: "Due date", hi: "देय तिथि" },
  pendingBefore: { en: "Pending before", hi: "पहले बकाया" },
  paid: { en: "Paid", hi: "जमा" },
  pendingAfter: { en: "Balance after", hi: "शेष" },
  total: { en: "Total", hi: "कुल" },
  yearAtGlance: { en: "Year at a glance", hi: "वर्ष का सारांश" },
  expected: { en: "Expected", hi: "अपेक्षित" },
  pending: { en: "Pending", hi: "बकाया" },
  totalExpected: { en: "Total expected this year", hi: "इस वर्ष कुल अपेक्षित" },
  paidSoFar: { en: "Paid so far", hi: "अब तक जमा" },
  balance: { en: "Balance", hi: "शेष" },
  discountPolicies: { en: "Discount policies on file", hi: "दर्ज छूट नीतियाँ" },
  policy: { en: "Policy", hi: "नीति" },
  tuitionBefore: { en: "Tuition before", hi: "पूर्व शुल्क" },
  tuitionAfter: { en: "Tuition after", hi: "पश्चात शुल्क" },
  applied: { en: "Applied", hi: "लागू" },
  verify: { en: "Verify this receipt", hi: "रसीद सत्यापित करें" },
  signature: { en: "Authorised signatory", hi: "अधिकृत हस्ताक्षरकर्ता" },
  parentCopy: { en: "Parent copy", hi: "अभिभावक प्रति" },
} as const;

const styles = StyleSheet.create({
  metaBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: pdfTokens.rule,
    borderStyle: "dashed",
    paddingVertical: 4,
    marginTop: 10,
    fontFamily: "Courier",
    fontSize: 8.5,
  },
  metaGrid: { flexDirection: "row", marginTop: 10, gap: 10 },
  metaCell: { flex: 1, paddingLeft: 6, borderLeftWidth: 2, borderLeftColor: pdfTokens.rule },
  metaLabel: { fontSize: 7, color: pdfTokens.muted, fontFamily: "Helvetica-Bold" },
  metaLabelHi: { fontSize: 6.5, color: pdfTokens.muted, fontFamily: HI_FONT },
  metaValue: { fontSize: 9, color: pdfTokens.inkStrong, marginTop: 1 },
  hero: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: pdfTokens.success,
    borderRadius: 4,
    backgroundColor: pdfTokens.successBg,
    padding: 10,
  },
  heroAmount: { fontSize: 22, fontFamily: "Helvetica-Bold", color: pdfTokens.success },
  heroWords: { fontSize: 8, color: pdfTokens.ink, marginTop: 3 },
  heroWordsHi: { fontSize: 8, color: pdfTokens.ink, marginTop: 1, fontFamily: HI_FONT },
  sectionTitle: { fontSize: 9.5, fontFamily: "Helvetica-Bold", marginTop: 14, color: pdfTokens.inkStrong },
  sectionTitleHi: { fontSize: 8, fontFamily: HI_FONT, color: pdfTokens.muted, marginBottom: 4 },
  totalRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: pdfTokens.inkStrong,
    fontFamily: "Helvetica-Bold",
  },
  voidBanner: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: pdfTokens.danger,
    borderRadius: 4,
    backgroundColor: pdfTokens.dangerBg,
    padding: 8,
  },
  voidBannerText: { color: pdfTokens.danger, fontFamily: "Helvetica-Bold", fontSize: 10 },
  // react-pdf cannot rotate, so the watermark is a wide low-contrast band rather
  // than the diagonal the HTML receipt draws.
  voidWatermark: {
    position: "absolute",
    top: 320,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 46,
    fontFamily: "Helvetica-Bold",
    color: "#f4cdc7",
    letterSpacing: 8,
  },
  tiles: { flexDirection: "row", gap: 6, marginTop: 6 },
  tile: { flex: 1, borderWidth: 0.5, borderColor: pdfTokens.rule, borderRadius: 3, padding: 5 },
  tileLabel: { fontSize: 7, color: pdfTokens.muted },
  tileValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: pdfTokens.inkStrong, marginTop: 2 },
  strip: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    backgroundColor: pdfTokens.panel,
    padding: 6,
    borderRadius: 3,
  },
  footerBlock: { flexDirection: "row", marginTop: 18, alignItems: "flex-end", gap: 12 },
  qr: { width: 56, height: 56 },
  signatureRule: {
    borderTopWidth: 0.5,
    borderTopColor: pdfTokens.ink,
    width: 150,
    marginTop: 28,
    paddingTop: 2,
    fontSize: 7.5,
    textAlign: "center",
  },
  stub: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: pdfTokens.rule,
    borderStyle: "dashed",
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
  },
});

function Label({ label }: { label: { en: string; hi: string } }) {
  return (
    <>
      <Text style={styles.metaLabel}>{label.en}</Text>
      <Text style={styles.metaLabelHi}>{label.hi}</Text>
    </>
  );
}

// Re-exported rather than defined here: the share sheet is a client component
// and cannot import this `server-only` module, but the name it downloads must
// match the one this route sends in Content-Disposition.
export { receiptPdfFilename } from "@/lib/receipts/document-names";

export type ReceiptPdfInput = {
  receipt: ReceiptDetail;
  verifyUrl?: string | null;
};

export async function renderReceiptPdf({ receipt, verifyUrl = null }: ReceiptPdfInput): Promise<Buffer> {
  ensurePdfFontsRegistered();
  const [logo, qr] = await Promise.all([loadLogoImage(), renderQrDataUri(verifyUrl)]);

  // Same arithmetic as receipt-document-v3: the effective breakdown wins, and
  // totalAmount is only the fallback. A receipt carrying an append-only
  // correction prints the corrected figure, not the original posting.
  const rows = receipt.breakdown.map((item) => ({
    label: item.installmentLabel,
    dueDate: item.dueDate,
    paid: item.amount,
    adjustmentAmount: item.adjustmentAmount,
    pendingBefore: item.pendingBeforePosting,
    pendingAfter: item.pendingAfterPosting,
  }));
  const breakdownTotal = rows.reduce((sum, row) => sum + row.paid, 0);
  const totalPaid = breakdownTotal || receipt.totalAmount;

  const isVoided = receipt.isVoided === true;
  // A reversed receipt is never also stamped PAID or YEAR CLEARED — same rule as
  // the screen. Suppressing them is half of what makes the reversal readable.
  const isYearClear =
    !isVoided &&
    isYearCleared({
      outstandingAmount: receipt.currentOutstanding,
      totalPaid: receipt.totalPaidToDate,
    });

  const modeLabel = receipt.paymentMode.replace(/_/g, " ").toUpperCase();
  const title = `${isVoided ? "REVERSED — " : ""}Receipt ${receipt.receiptNumber} — ${receipt.studentFullName}`;

  return renderToBuffer(
    <Document title={title} author={schoolProfile.name}>
      <Page size="A4" style={sharedStyles.page}>
        {isVoided ? <Text style={styles.voidWatermark} fixed>REVERSED</Text> : null}

        <SchoolLetterhead docTitleEn={L.receipt.en} docTitleHi={L.receipt.hi} logo={logo} centered />

        {isVoided ? (
          <View style={styles.voidBanner}>
            <Text style={styles.voidBannerText}>
              THIS RECEIPT HAS BEEN REVERSED IN FULL
            </Text>
            <Text style={{ fontSize: 8, color: pdfTokens.danger, marginTop: 2 }}>
              {receipt.voidReason
                ? `Reason: ${receipt.voidReason}. `
                : ""}
              It remains on file as a record and is excluded from every collection figure. It is not proof of payment.
            </Text>
          </View>
        ) : null}

        <View style={styles.metaBar}>
          <Text>{`${L.receiptNo.en}: ${receipt.receiptNumber}`}</Text>
          <Text>{`${L.session.en}: ${receipt.sessionLabel}`}</Text>
          <Text>{`${L.date.en}: ${formatPdfDate(receipt.paymentDate)}`}</Text>
        </View>

        <View style={styles.metaGrid}>
          <View style={styles.metaCell}>
            <Label label={L.student} />
            <Text style={styles.metaValue}>{receipt.studentFullName}</Text>
            <Text style={{ fontSize: 7.5, color: pdfTokens.muted }}>
              {`${L.srNo.en} ${receipt.admissionNo}`}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Label label={L.father} />
            <Text style={styles.metaValue}>{receipt.fatherName || "-"}</Text>
            <Text style={{ fontSize: 7.5, color: pdfTokens.muted }}>{receipt.fatherPhone || ""}</Text>
          </View>
          <View style={styles.metaCell}>
            <Label label={L.className} />
            <Text style={styles.metaValue}>{receipt.classLabel}</Text>
            <Text style={{ fontSize: 7.5, color: pdfTokens.muted }}>
              {receipt.transportRouteLabel}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Label label={L.mode} />
            <Text style={styles.metaValue}>{modeLabel}</Text>
            <Text style={{ fontSize: 7.5, color: pdfTokens.muted }}>
              {`${L.receivedBy.en}: ${receipt.receivedBy || receipt.createdByName || "-"}`}
            </Text>
          </View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.metaLabel}>{L.amountPaid.en}</Text>
          <Text style={styles.heroAmount}>{rs(totalPaid)}</Text>
          <Text style={styles.heroWords}>
            {`${L.amountInWords.en}: ${englishAmountWords(totalPaid, { style: "title" })}`}
          </Text>
          <Text style={styles.heroWordsHi}>{amountInWordsHindi(totalPaid)}</Text>
        </View>

        <Text style={styles.sectionTitle}>{L.paidFor.en}</Text>
        <Text style={styles.sectionTitleHi}>{L.paidFor.hi}</Text>
        <View style={sharedStyles.tableHeader}>
          <Th label={L.installment} />
          <Th label={L.dueDate} />
          <Th label={L.pendingBefore} right />
          <Th label={L.paid} right />
          <Th label={L.pendingAfter} right />
        </View>
        {rows.map((row, index) => (
          <View key={`${row.label}-${index}`} style={sharedStyles.tableRow}>
            <Text style={sharedStyles.th}>{row.label}</Text>
            <Text style={sharedStyles.th}>{formatPdfDate(row.dueDate)}</Text>
            <Text style={sharedStyles.thRight}>
              {row.pendingBefore === null ? "-" : rs(row.pendingBefore)}
            </Text>
            <Text style={sharedStyles.thRight}>
              {rs(row.paid)}
              {row.adjustmentAmount ? ` (adj ${rs(row.adjustmentAmount)})` : ""}
            </Text>
            <Text style={sharedStyles.thRight}>
              {row.pendingAfter === null ? "-" : rs(row.pendingAfter)}
            </Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={sharedStyles.th}>{L.total.en}</Text>
          <Text style={sharedStyles.th} />
          <Text style={sharedStyles.thRight} />
          <Text style={sharedStyles.thRight}>{rs(totalPaid)}</Text>
          <Text style={sharedStyles.thRight} />
        </View>

        {receipt.discountAmount > 0 || receipt.lateFeeAmount > 0 || receipt.lateFeeWaived > 0 ? (
          <Text style={{ fontSize: 8, color: pdfTokens.muted, marginTop: 6 }}>
            {[
              receipt.discountAmount > 0 ? `Discount applied ${rs(receipt.discountAmount)}` : null,
              receipt.lateFeeAmount > 0 ? `Late fee ${rs(receipt.lateFeeAmount)}` : null,
              receipt.lateFeeWaived > 0 ? `Late fee waived ${rs(receipt.lateFeeWaived)}` : null,
            ]
              .filter(Boolean)
              .join("  ·  ")}
            {"  ·  A late fee is a separate charge and is never part of fees pending."}
          </Text>
        ) : null}

        {receipt.conventionalDiscountAssignments.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>{L.discountPolicies.en}</Text>
            <Text style={styles.sectionTitleHi}>{L.discountPolicies.hi}</Text>
            <View style={sharedStyles.tableHeader}>
              <Th label={L.policy} />
              <Th label={L.tuitionBefore} right />
              <Th label={L.tuitionAfter} right />
              <Th label={L.applied} right />
            </View>
            {/* Every assignment on file, not just the winning one. The school
                rule is that the lowest candidate tuition wins; showing only the
                winner would hide what else was considered. */}
            {receipt.conventionalDiscountAssignments.map((policy) => (
              <View key={policy.assignmentId} style={sharedStyles.tableRow}>
                <Text style={sharedStyles.th}>{policy.policyDisplayName}</Text>
                <Text style={sharedStyles.thRight}>{rs(policy.beforeTuitionAmount)}</Text>
                <Text style={sharedStyles.thRight}>{rs(policy.resultingTuitionAmount)}</Text>
                <View style={sharedStyles.thRight}>
                  <Badge tone={policy.isWinningPolicy ? "success" : "neutral"}>
                    {policy.isWinningPolicy ? "Applied" : "Superseded"}
                  </Badge>
                </View>
              </View>
            ))}
          </>
        ) : null}

        <Text style={styles.sectionTitle}>{L.yearAtGlance.en}</Text>
        <Text style={styles.sectionTitleHi}>{L.yearAtGlance.hi}</Text>
        <View style={styles.tiles}>
          {receipt.installmentStatus.map((item) => (
            <View key={item.installmentNo} style={styles.tile}>
              <Text style={styles.tileLabel}>{item.label}</Text>
              <Text style={styles.tileValue}>{rs(item.pending)}</Text>
              <Text style={styles.tileLabel}>{item.status.toUpperCase()}</Text>
            </View>
          ))}
        </View>
        <View style={styles.strip}>
          <Text>{`${L.totalExpected.en}: ${rs(receipt.totalDue)}`}</Text>
          <Text>{`${L.paidSoFar.en}: ${rs(receipt.totalPaidToDate)}`}</Text>
          <Text>{`${L.balance.en}: ${rs(receipt.currentOutstanding)}`}</Text>
        </View>
        {/* The three figures do not subtract, and a parent who tries gets a
            different answer, so the document has to say why.

            It states the definitions rather than attributing the gap to a single
            cause. An earlier draft asserted the whole difference was late-fee
            money; on a reversed receipt that was flatly wrong — there the gap is
            the reversal. Naming a cause this document has not actually computed
            is how a confident wrong sentence gets printed and handed to a
            parent. */}
        {Math.round(receipt.totalDue - receipt.totalPaidToDate) !==
        Math.round(receipt.currentOutstanding) ? (
          <Text style={{ fontSize: 7.5, color: pdfTokens.muted, marginTop: 4 }}>
            {`These three will not subtract to each other, which is expected. "${L.totalExpected.en}" and "${L.balance.en}" count fees only, while "${L.paidSoFar.en}" counts every rupee received against this student — including money paid towards late fees, and receipts later reversed. A late fee is a separate charge and is never part of a fee balance.`}
          </Text>
        ) : null}

        <View style={styles.footerBlock}>
          {qr ? <Image src={qr} style={styles.qr} /> : null}
          <View style={{ flex: 1 }}>
            {verifyUrl ? (
              <>
                <Text style={{ fontSize: 7.5, fontFamily: "Helvetica-Bold" }}>{L.verify.en}</Text>
                <Text style={{ fontSize: 7, color: pdfTokens.muted }}>{verifyUrl}</Text>
              </>
            ) : null}
            <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
              {isVoided ? <Badge tone="danger">REVERSED</Badge> : <Badge tone="success">PAID</Badge>}
              {isYearClear ? <Badge tone="success">YEAR CLEARED</Badge> : null}
            </View>
          </View>
          <Text style={styles.signatureRule}>{L.signature.en}</Text>
        </View>

        <View style={styles.stub}>
          <Text>{`${L.parentCopy.en} · ${receipt.receiptNumber} · ${receipt.studentFullName} (${receipt.admissionNo})`}</Text>
          <Text>{`${rs(totalPaid)} · ${formatPdfDate(receipt.paymentDate)}`}</Text>
        </View>

        <Text style={sharedStyles.footer} fixed>
          {`${schoolProfile.name} · computer-generated receipt · ${receipt.receiptNumber}`}
        </Text>
      </Page>
    </Document>,
  );
}
