import "server-only";

import * as React from "react";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import { schoolProfile } from "@/platform/config/school";
import { isYearCleared } from "@/modules/fees/domain/year-clear";
import { englishAmountWords } from "@/platform/helpers/amount-in-words";
import { amountInWordsHindi } from "@/platform/helpers/amount-in-words-hi";
import {
  Badge,
  ensurePdfFontsRegistered,
  formatPdfDate,
  HI_FONT,
  inr,
  loadLogoImage,
  loadSignatureImage,
  MONEY_FONT,
  ParentDocumentLetterhead,
  pdfTokens,
  SignatureBlock,
  sharedStyles,
  Th,
} from "@/platform/pdf/document-kit";
import type { ReceiptDetail } from "@/modules/receipts/domain/types";

/**
 * A fee receipt as an actual PDF file.
 *
 * Until now the only way to get a receipt out of this system was to open it in a
 * browser and print. That is fine at the counter and useless everywhere else —
 * an assistant cannot hand a parent a web page, and there was nothing to attach
 * to a message. It is now the document every paying parent receives on WhatsApp
 * within seconds of the cashier posting, which raises the bar for it
 * considerably: this is the school's face, not an export.
 *
 * It mirrors `receipts/ui/receipt-document-v3.tsx` section by section, and since
 * 2026-09-12 that mirroring is close enough to be recognisable side by side:
 * the centred letterhead with the mark above the name, the boxed FEE RECEIPT
 * title, the monospace receipt/session/date line between dashed rules, the
 * saffron-ruled student cell, the green TOTAL PAID panel, the year tiles, and
 * the perforated parent stub.
 *
 * Three deliberate divergences remain, all forced by react-pdf:
 *
 *   - No rotated PAID stamp: react-pdf has no `transform`, so the stamps read
 *     as bordered badges.
 *   - The REVERSED watermark is a wide band rather than a diagonal, same cause.
 *   - The perforation is a dotted rule rather than bitten-out half circles;
 *     there is no mask.
 *
 * The ₹ divergence is gone. Noto Sans Devanagari carries U+20B9, so money reads
 * `₹4,500` here exactly as it does on screen — see `inr` in the document kit.
 *
 * Everything that is a *number* is computed the same way as the screen, from
 * the same helpers, because a receipt that disagrees with the one on the
 * monitor is worse than no PDF at all.
 */

const L = {
  receipt: { en: "FEE RECEIPT", hi: "शुल्क रसीद" },
  receiptNo: { en: "Receipt No", hi: "रसीद संख्या" },
  session: { en: "Session", hi: "सत्र" },
  student: { en: "STUDENT NAME", hi: "विद्यार्थी का नाम" },
  srNo: { en: "SR No", hi: "क्रम संख्या" },
  father: { en: "FATHER NAME", hi: "पिता का नाम" },
  date: { en: "DATE", hi: "दिनांक" },
  mode: { en: "PAYMENT MODE", hi: "भुगतान माध्यम" },
  receivedBy: { en: "Received By", hi: "प्राप्तकर्ता" },
  totalPaid: { en: "TOTAL PAID", hi: "कुल जमा" },
  amountInWords: { en: "Amount in Words", hi: "शब्दों में" },
  paidFor: { en: "What this receipt paid", hi: "इस रसीद से भुगतान" },
  installment: { en: "Installment", hi: "किस्त" },
  dueDate: { en: "Due date", hi: "देय तिथि" },
  pendingBefore: { en: "Pending before", hi: "पहले बकाया" },
  paid: { en: "Paid", hi: "जमा" },
  pendingAfter: { en: "Balance after", hi: "शेष" },
  total: { en: "Total", hi: "कुल" },
  yearAtGlance: { en: "Year at a glance", hi: "वर्ष का सारांश" },
  totalExpected: { en: "Total expected this year", hi: "इस वर्ष कुल अपेक्षित" },
  paidSoFar: { en: "Paid so far", hi: "अब तक जमा" },
  balanceDue: { en: "Balance due", hi: "शेष राशि" },
  allClear: { en: "All dues cleared", hi: "सभी बकाया चुकता" },
  due: { en: "due", hi: "देय" },
  paidTick: { en: "Paid", hi: "चुकता" },
  discountPolicies: { en: "Discount policies on file", hi: "दर्ज छूट नीतियाँ" },
  policy: { en: "Policy", hi: "नीति" },
  tuitionBefore: { en: "Tuition before", hi: "पूर्व शुल्क" },
  tuitionAfter: { en: "Tuition after", hi: "पश्चात शुल्क" },
  applied: { en: "Applied", hi: "लागू" },
  official: {
    en: "This is an official school fee receipt.",
    hi: "यह विद्यालय की आधिकारिक शुल्क रसीद है।",
  },
  keepRecords: {
    en: "Please keep this receipt for your records.",
    hi: "कृपया इस रसीद को सुरक्षित रखें।",
  },
} as const;

const styles = StyleSheet.create({
  page: {
    padding: 24,
    fontSize: 9,
    color: pdfTokens.ink,
    fontFamily: "Helvetica",
    backgroundColor: pdfTokens.paper,
  },
  /** Receipt no · session · date, monospace between dashed rules — a ledger line. */
  metaBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 0.5,
    borderBottomColor: pdfTokens.rule,
    borderStyle: "dashed",
    paddingVertical: 5,
    fontFamily: "Courier",
    fontSize: 8.5,
  },

  /** Four across, as the desktop app lays it out. */
  metaGrid: { flexDirection: "row", marginTop: 9, gap: 10 },
  metaCell: { flex: 1, paddingLeft: 7, borderLeftWidth: 1, borderLeftColor: pdfTokens.rule },
  /** The student is the subject of the document, so it carries the one saffron. */
  metaCellLead: { borderLeftWidth: 2, borderLeftColor: pdfTokens.accent },
  metaLabel: {
    fontSize: 6.5,
    color: pdfTokens.muted,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.7,
  },
  metaLabelHi: { fontSize: 6.5, color: pdfTokens.muted, fontFamily: HI_FONT },
  metaValue: { fontSize: 10, color: pdfTokens.inkStrong, marginTop: 2, fontFamily: "Helvetica-Bold" },
  metaSub: { fontSize: 7.5, color: pdfTokens.muted, marginTop: 1 },
  metaSubHi: { fontSize: 7.5, color: pdfTokens.muted, fontFamily: HI_FONT },

  hero: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: pdfTokens.success,
    borderRadius: 5,
    backgroundColor: pdfTokens.successBg,
    padding: 9,
  },
  heroLabel: {
    fontSize: 6.5,
    color: pdfTokens.success,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
  },
  heroLabelHi: { fontSize: 7, color: pdfTokens.success, fontFamily: HI_FONT },
  heroAmount: {
    fontSize: 24,
    fontFamily: MONEY_FONT,
    color: pdfTokens.success,
    marginTop: 2,
  },
  heroWords: { fontSize: 7.5, color: pdfTokens.ink, marginTop: 3 },
  heroWordsHi: { fontSize: 7.5, color: pdfTokens.ink, marginTop: 1, fontFamily: HI_FONT },

  sectionTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    marginTop: 10,
    color: pdfTokens.muted,
    letterSpacing: 0.9,
  },
  sectionTitleHi: { fontSize: 7.5, fontFamily: HI_FONT, color: pdfTokens.muted, marginBottom: 4 },

  money: { fontFamily: MONEY_FONT },
  moneyRight: { flex: 1, textAlign: "right", fontFamily: MONEY_FONT },

  totalRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: pdfTokens.inkStrong,
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
  voidWatermark: {
    position: "absolute",
    top: 330,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 46,
    fontFamily: "Helvetica-Bold",
    color: "#f4cdc7",
    letterSpacing: 8,
  },

  /**
   * Three per row, wrapping.
   *
   * The screen shows two because a phone is 390px wide and four because a desk
   * is not; A4 sits between them. Three is also what keeps a receipt on ONE
   * page with a carry-forward row present — at two per row a five-tile year
   * pushed the parent stub onto page two, and a stub on a page nobody prints is
   * not a stub. The long "Previous year tuition balance from 2025-26" label
   * still has room to wrap at this width.
   */
  tileGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 6, marginHorizontal: -3 },
  tile: {
    width: "33.333%",
    paddingHorizontal: 3,
    paddingBottom: 6,
  },
  tileInner: { borderWidth: 0.5, borderColor: pdfTokens.rule, borderRadius: 4, padding: 6 },
  tileInnerPaid: { borderColor: pdfTokens.success, backgroundColor: pdfTokens.successBg },
  tileLabel: { fontSize: 6.5, color: pdfTokens.muted, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 },
  tileValueRow: { flexDirection: "row", alignItems: "baseline", marginTop: 2 },
  tileDate: { fontSize: 7, color: pdfTokens.muted, marginTop: 1 },

  strip: {
    marginTop: 4,
    backgroundColor: pdfTokens.panel,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  stripRow: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap" },

  /** react-pdf has no mask, so the tear line is a dotted rule rather than the
   *  bitten-out half circles the screen draws. Same message, fewer tricks. */
  perforation: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: pdfTokens.muted,
    borderStyle: "dotted",
  },
  stub: {
    marginTop: 8,
    borderWidth: 0.8,
    borderColor: pdfTokens.muted,
    borderStyle: "dashed",
    borderRadius: 4,
    backgroundColor: pdfTokens.stub,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  stubRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
});

function Label({ label }: { label: { en: string; hi: string } }) {
  return (
    <>
      <Text style={styles.metaLabel}>{label.en}</Text>
      <Text style={styles.metaLabelHi}>{label.hi}</Text>
    </>
  );
}

/**
 * A money figure beside its words.
 *
 * Split into two <Text> on purpose: the amount needs {@link MONEY_FONT} for the
 * ₹ glyph, and that font has no Latin letters — so "Balance due" and "₹22,000"
 * cannot share one node.
 */
function MoneyWithLabel({
  labelEn,
  labelHi,
  value,
  bold = false,
  color,
  size = 9,
}: {
  labelEn: string;
  labelHi?: string;
  value: number;
  bold?: boolean;
  color?: string;
  size?: number;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline" }}>
      <Text style={{ fontSize: size, color: color ?? pdfTokens.muted, fontFamily: bold ? "Helvetica-Bold" : "Helvetica" }}>
        {labelEn}
      </Text>
      {labelHi ? (
        <Text style={{ fontSize: size, color: color ?? pdfTokens.muted, fontFamily: HI_FONT }}>
          {` / ${labelHi}`}
        </Text>
      ) : null}
      <Text style={{ fontSize: size, color: color ?? pdfTokens.muted }}>: </Text>
      <Text style={{ fontSize: size, fontFamily: MONEY_FONT, color: color ?? pdfTokens.inkStrong }}>
        {inr(value)}
      </Text>
    </View>
  );
}

// Re-exported rather than defined here: the share sheet is a client component
// and cannot import this `server-only` module, but the name it downloads must
// match the one this route sends in Content-Disposition.
export { receiptPdfFilename } from "@/modules/receipts/domain/document-names";

export type ReceiptPdfInput = {
  receipt: ReceiptDetail;
  /**
   * Retained so existing call sites need no change, and ignored.
   *
   * The footer QR was removed on 2026-09-12: the office does not verify
   * receipts by scanning them, and the code encoded whatever
   * `NEXT_PUBLIC_SITE_URL` happened to be — which in production was
   * `http://localhost:3000`, so every QR ever printed pointed at nothing.
   * A square that cannot work is worse than no square.
   */
  verifyUrl?: string | null;
};

export async function renderReceiptPdf({ receipt }: ReceiptPdfInput): Promise<Buffer> {
  ensurePdfFontsRegistered();
  const [logo, signature] = await Promise.all([loadLogoImage(), loadSignatureImage()]);

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

  const nextDue = receipt.installmentStatus.find(
    (row) => row.status !== "paid" && row.pending > 0,
  );
  const outstanding = Math.max(receipt.currentOutstanding, 0);

  const modeLabel = receipt.paymentMode.replace(/_/g, " ");
  const modeTitle = modeLabel.charAt(0).toUpperCase() + modeLabel.slice(1);
  const title = `${isVoided ? "REVERSED — " : ""}Receipt ${receipt.receiptNumber} — ${receipt.studentFullName}`;

  return renderToBuffer(
    <Document title={title} author={schoolProfile.name}>
      <Page size="A4" style={styles.page}>
        {isVoided ? <Text style={styles.voidWatermark} fixed>REVERSED</Text> : null}

        <ParentDocumentLetterhead
          docTitleEn={L.receipt.en}
          docTitleHi={L.receipt.hi}
          logo={logo}
        />

        <View style={styles.metaBar}>
          <Text>{`${L.receiptNo.en} ${receipt.receiptNumber}`}</Text>
          <Text>{`${L.session.en} ${receipt.sessionLabel}`}</Text>
          <Text>{formatPdfDate(receipt.paymentDate)}</Text>
        </View>

        {isVoided ? (
          <View style={styles.voidBanner}>
            <Text style={styles.voidBannerText}>
              THIS RECEIPT HAS BEEN REVERSED IN FULL
            </Text>
            <Text style={{ fontSize: 8, color: pdfTokens.danger, marginTop: 2 }}>
              {receipt.voidReason ? `Reason: ${receipt.voidReason}. ` : ""}
              It remains on file as a record and is excluded from every collection figure. It is not proof of payment.
            </Text>
          </View>
        ) : null}

        {/* Four across, which is the desktop app's `sm:grid-cols-4`. The phone
            screenshot stacks them 2x2 because it is 390px wide; A4 is not, and
            two rows here pushed the parent stub onto a second page. */}
        <View style={styles.metaGrid}>
          <View style={[styles.metaCell, styles.metaCellLead]}>
            <Label label={L.student} />
            <Text style={styles.metaValue}>{receipt.studentFullName}</Text>
            <Text style={styles.metaSub}>
              {`${L.srNo.en} ${receipt.admissionNo}  ·  ${receipt.classLabel}`}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Label label={L.father} />
            <Text style={styles.metaValue}>{receipt.fatherName || "—"}</Text>
            {receipt.fatherPhone ? (
              <Text style={styles.metaSub}>{receipt.fatherPhone}</Text>
            ) : null}
          </View>
          <View style={styles.metaCell}>
            <Label label={L.date} />
            <Text style={styles.metaValue}>{formatPdfDate(receipt.paymentDate)}</Text>
            <Text style={styles.metaSub}>
              {`${L.receivedBy.en}: ${receipt.receivedBy || receipt.createdByName || "—"}`}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Label label={L.mode} />
            <Text style={styles.metaValue}>{modeTitle}</Text>
            <Text style={styles.metaSubHi}>{L.mode.hi}</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroLabel}>{L.totalPaid.en}</Text>
          <Text style={styles.heroLabelHi}>{L.totalPaid.hi}</Text>
          <Text style={styles.heroAmount}>{inr(totalPaid)}</Text>
          <Text style={styles.heroWords}>
            {`${L.amountInWords.en}: ${englishAmountWords(totalPaid, { style: "title" })} Rupees Only`}
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
            <Text style={styles.moneyRight}>
              {row.pendingBefore === null ? "—" : inr(row.pendingBefore)}
            </Text>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <Text style={styles.money}>{inr(row.paid)}</Text>
              {row.adjustmentAmount ? (
                <Text style={{ fontSize: 6.5, color: pdfTokens.muted }}>
                  {`adjustment ${row.adjustmentAmount > 0 ? "+" : "−"}`}
                  <Text style={styles.money}>{inr(Math.abs(row.adjustmentAmount))}</Text>
                </Text>
              ) : null}
            </View>
            <Text style={styles.moneyRight}>
              {row.pendingAfter === null ? "—" : inr(row.pendingAfter)}
            </Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={[sharedStyles.th, { fontFamily: "Helvetica-Bold", letterSpacing: 0.6 }]}>
            {L.total.en.toUpperCase()}
          </Text>
          <Text style={sharedStyles.th} />
          <Text style={sharedStyles.thRight} />
          <Text style={[styles.moneyRight, { fontSize: 11, color: pdfTokens.inkStrong }]}>
            {inr(totalPaid)}
          </Text>
          <Text style={[styles.moneyRight, { color: pdfTokens.muted }]}>
            {inr(Math.max(receipt.outstandingAfterReceipt, 0))}
          </Text>
        </View>

        {receipt.discountAmount > 0 || receipt.lateFeeAmount > 0 || receipt.lateFeeWaived > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 6, gap: 10 }}>
            {receipt.discountAmount > 0 ? (
              <MoneyWithLabel labelEn="Discount applied" value={receipt.discountAmount} size={7.5} />
            ) : null}
            {receipt.lateFeeAmount > 0 ? (
              <MoneyWithLabel labelEn="Late fee" value={receipt.lateFeeAmount} size={7.5} />
            ) : null}
            {receipt.lateFeeWaived > 0 ? (
              <MoneyWithLabel labelEn="Late fee waived" value={receipt.lateFeeWaived} size={7.5} />
            ) : null}
            <Text style={{ fontSize: 7.5, color: pdfTokens.muted }}>
              A late fee is a separate charge and is never part of fees pending.
            </Text>
          </View>
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
                <Text style={styles.moneyRight}>{inr(policy.beforeTuitionAmount)}</Text>
                <Text style={styles.moneyRight}>{inr(policy.resultingTuitionAmount)}</Text>
                <View style={sharedStyles.thRight}>
                  <Badge tone={policy.isWinningPolicy ? "success" : "neutral"}>
                    {policy.isWinningPolicy ? "Applied" : "Superseded"}
                  </Badge>
                </View>
              </View>
            ))}
          </>
        ) : null}

        {receipt.installmentStatus.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>{L.yearAtGlance.en}</Text>
            <Text style={styles.sectionTitleHi}>{L.yearAtGlance.hi}</Text>
            <View style={styles.tileGrid}>
              {receipt.installmentStatus.map((item) => {
                const settled = item.status === "paid";
                return (
                  <View key={`${item.installmentNo}-${item.label}`} style={styles.tile}>
                    <View style={[styles.tileInner, settled ? styles.tileInnerPaid : {}]}>
                      <Text style={styles.tileLabel}>{item.label.toUpperCase()}</Text>
                      {settled ? (
                        <Text
                          style={{
                            fontSize: 10,
                            fontFamily: "Helvetica-Bold",
                            color: pdfTokens.success,
                            marginTop: 2,
                          }}
                        >
                          {/* No tick glyph: U+2713 is in neither Helvetica nor
                              Noto Sans Devanagari, so the screen's "Paid ✓"
                              would print as a blank box. The word alone, in
                              green, says the same thing and always renders. */}
                          {L.paidTick.en.toUpperCase()}
                        </Text>
                      ) : (
                        <View style={styles.tileValueRow}>
                          <Text
                            style={{
                              fontSize: 11,
                              fontFamily: MONEY_FONT,
                              color: pdfTokens.inkStrong,
                            }}
                          >
                            {inr(item.pending)}
                          </Text>
                          <Text style={{ fontSize: 8, color: pdfTokens.muted }}>
                            {` ${L.due.en}`}
                          </Text>
                        </View>
                      )}
                      <Text style={styles.tileDate}>{formatPdfDate(item.dueDate)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
            <View style={styles.strip}>
              <View style={styles.stripRow}>
                <MoneyWithLabel labelEn={L.totalExpected.en} value={receipt.totalDue} size={8} />
                <Text style={{ fontSize: 8, color: pdfTokens.muted }}>{"   ·   "}</Text>
                <MoneyWithLabel labelEn={L.paidSoFar.en} value={receipt.totalPaidToDate} size={8} />
              </View>
              <View style={{ marginTop: 3 }}>
                {outstanding > 0 ? (
                  <MoneyWithLabel
                    labelEn={L.balanceDue.en}
                    labelHi={L.balanceDue.hi}
                    value={outstanding}
                    bold
                    color={pdfTokens.warning}
                    size={9}
                  />
                ) : (
                  <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: pdfTokens.success }}>
                    {L.allClear.en}
                  </Text>
                )}
              </View>
            </View>
          </>
        ) : null}

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
          <Text style={{ fontSize: 7, color: pdfTokens.muted, marginTop: 4 }}>
            {`These three will not subtract to each other, which is expected. "${L.totalExpected.en}" and "${L.balanceDue.en}" count fees only, while "${L.paidSoFar.en}" counts every rupee received against this student — including money paid towards late fees, and receipts later reversed. A late fee is a separate charge and is never part of a fee balance.`}
          </Text>
        ) : null}

        <View style={{ flexDirection: "row", gap: 6, marginTop: 12 }}>
          {isVoided ? <Badge tone="danger">REVERSED</Badge> : <Badge tone="success">PAID</Badge>}
          {isYearClear ? <Badge tone="success">YEAR CLEARED</Badge> : null}
        </View>

        <SignatureBlock
          signature={signature}
          statementEn={L.official.en}
          statementHi={L.official.hi}
        />

        <View style={styles.perforation} />
        <View style={styles.stub}>
          <View style={styles.stubRow}>
            <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: pdfTokens.inkStrong }}>
              {`${L.receiptNo.en} ${receipt.receiptNumber}`}
            </Text>
            <MoneyWithLabel
              labelEn="Total paid"
              value={totalPaid}
              bold
              color={pdfTokens.success}
              size={9}
            />
          </View>
          <View style={[styles.stubRow, { marginTop: 3 }]}>
            <Text style={{ fontSize: 8, color: pdfTokens.muted }}>
              {`${receipt.studentFullName}  ·  ${receipt.classLabel}`}
            </Text>
            <MoneyWithLabel
              labelEn={L.balanceDue.en}
              labelHi={L.balanceDue.hi}
              value={outstanding}
              bold
              color={pdfTokens.inkStrong}
              size={9}
            />
          </View>
          {nextDue && outstanding > 0 ? (
            <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: 3 }}>
              <Text style={{ fontSize: 8, color: pdfTokens.muted }}>{`${L.balanceDue.en}: `}</Text>
              <Text style={{ fontSize: 8, fontFamily: MONEY_FONT, color: pdfTokens.muted }}>
                {inr(outstanding)}
              </Text>
              <Text style={{ fontSize: 8, color: pdfTokens.muted }}>
                {` — kindly pay by ${formatPdfDate(nextDue.dueDate)}`}
              </Text>
            </View>
          ) : null}
          <Text style={{ fontSize: 7.5, color: pdfTokens.muted, marginTop: 4 }}>
            {L.keepRecords.en}
          </Text>
          <Text style={{ fontSize: 7.5, color: pdfTokens.muted, fontFamily: HI_FONT }}>
            {L.keepRecords.hi}
          </Text>
        </View>

        <Text style={sharedStyles.footer} fixed>
          {`${schoolProfile.name} · computer-generated receipt · ${receipt.receiptNumber}`}
        </Text>
      </Page>
    </Document>,
  );
}
