import "server-only";

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as React from "react";
import { Font, Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import QRCode from "qrcode";

import { schoolProfile } from "@/platform/config/school";

/**
 * What every generated PDF shares: fonts, money and date formatting, the
 * letterhead, and the two binary assets (logo, QR) that react-pdf needs handed
 * to it rather than pointed at.
 *
 * Extracted from lib/students/fee-statement-pdf.tsx when the receipt PDF was
 * written, so the two documents cannot drift on the things a reader compares
 * across them — the school's name block, the way an amount is spelled, and
 * which font carries Devanagari.
 */

// Devanagari for the Hindi half of every bilingual label. The built-in
// Helvetica (English + amounts) has no Devanagari glyphs, and this Noto face has
// no Latin letters, so each <Text> picks its family by script. The TTFs ship in
// public/fonts and are traced into every PDF route via
// `outputFileTracingIncludes` in next.config.ts — miss that and the route works
// locally and 500s on Vercel.
export const HI_FONT = "NotoDevanagari";

let fontRegistered = false;
export function ensurePdfFontsRegistered(): void {
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

/**
 * react-pdf's Helvetica has no ₹ glyph, so amounts read "Rs. 12,000".
 * The on-screen documents use ₹; this is the one deliberate divergence.
 */
export function rs(value: number): string {
  const rounded = Math.round(value || 0);
  return `Rs. ${rounded.toLocaleString("en-IN")}`;
}

export function formatPdfDate(value: string | null | undefined): string {
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

export type PdfImage = { data: Buffer; format: "png" };

let logoCache: PdfImage | null = null;

/**
 * The school mark, read into a Buffer rather than passed as a path.
 *
 * Two reasons it is not `<Image src={path.join(process.cwd(), …)} />`: Vercel's
 * file tracer cannot see a computed path argument, and the 192px PNG is 16 KB
 * against the letterhead JPEG's 230 KB — which would have been the largest part
 * of every receipt.
 */
export async function loadLogoImage(): Promise<PdfImage | null> {
  if (logoCache) return logoCache;
  try {
    const data = await fs.readFile(path.join(process.cwd(), "public/branding/icon-192.png"));
    logoCache = { data, format: "png" };
    return logoCache;
  } catch {
    // A missing logo must never fail a receipt. The letterhead falls back to
    // the school's name alone, which is what the document is actually for.
    return null;
  }
}

/**
 * A QR as a PNG data URI.
 *
 * The HTML receipt renders an SVG string; react-pdf cannot, so this produces
 * the one thing `<Image src>` accepts for generated content.
 */
export async function renderQrDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    return await QRCode.toDataURL(url, { margin: 0, width: 256, errorCorrectionLevel: "M" });
  } catch {
    return null;
  }
}

export const pdfTokens = {
  ink: "#1f2937",
  inkStrong: "#111827",
  muted: "#6b7280",
  rule: "#e5e7eb",
  ruleSoft: "#eceff3",
  success: "#2f7f56",
  successBg: "#f0f8f3",
  danger: "#b42318",
  dangerBg: "#fef3f2",
  panel: "#f3f4f6",
} as const;

export const sharedStyles = StyleSheet.create({
  page: { padding: 28, fontSize: 9, color: pdfTokens.ink, fontFamily: "Helvetica" },
  schoolName: { fontSize: 15, fontFamily: "Helvetica-Bold", color: pdfTokens.inkStrong },
  schoolMeta: { fontSize: 8, color: pdfTokens.muted, marginTop: 2 },
  schoolMetaHi: { fontSize: 8, color: pdfTokens.muted, marginTop: 1, fontFamily: HI_FONT },
  docTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 10, color: pdfTokens.inkStrong },
  docTitleHi: { fontSize: 9, fontFamily: HI_FONT, color: pdfTokens.muted },
  rule: { borderBottomWidth: 1, borderBottomColor: pdfTokens.rule, marginVertical: 8 },
  row: { flexDirection: "row" },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: pdfTokens.panel,
    paddingVertical: 3,
    paddingHorizontal: 4,
    fontSize: 8.5,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: pdfTokens.ruleSoft,
  },
  th: { flex: 1 },
  thRight: { flex: 1, textAlign: "right" },
  thEn: { fontFamily: "Helvetica-Bold" },
  thEnRight: { fontFamily: "Helvetica-Bold", textAlign: "right" },
  thHi: { fontFamily: HI_FONT, fontSize: 7, color: pdfTokens.muted },
  thHiRight: { fontFamily: HI_FONT, fontSize: 7, color: pdfTokens.muted, textAlign: "right" },
  muted: { color: pdfTokens.muted },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 28,
    right: 28,
    fontSize: 7.5,
    color: pdfTokens.muted,
    textAlign: "center",
  },
  logo: { width: 42, height: 42 },
});

/** Bilingual column heading, English over Hindi. */
export function Th({
  label,
  right = false,
}: {
  label: { en: string; hi: string };
  right?: boolean;
}) {
  return (
    <View style={right ? sharedStyles.thRight : sharedStyles.th}>
      <Text style={right ? sharedStyles.thEnRight : sharedStyles.thEn}>{label.en}</Text>
      <Text style={right ? sharedStyles.thHiRight : sharedStyles.thHi}>{label.hi}</Text>
    </View>
  );
}

/** A bordered badge. react-pdf has no `transform`, so a stamp reads as a box. */
export function Badge({
  children,
  tone = "neutral",
}: {
  children: string;
  tone?: "success" | "danger" | "neutral";
}) {
  const color =
    tone === "success" ? pdfTokens.success : tone === "danger" ? pdfTokens.danger : pdfTokens.muted;
  return (
    <Text
      style={{
        alignSelf: "flex-start",
        borderWidth: 1.5,
        borderColor: color,
        borderStyle: "solid",
        borderRadius: 3,
        paddingHorizontal: 6,
        paddingVertical: 2,
        fontSize: 8,
        fontFamily: "Helvetica-Bold",
        color,
      }}
    >
      {children}
    </Text>
  );
}

/** The school's name block, identical across every document it heads. */
export function SchoolLetterhead({
  docTitleEn,
  docTitleHi,
  logo,
  centered = false,
}: {
  docTitleEn: string;
  docTitleHi: string;
  logo?: PdfImage | null;
  centered?: boolean;
}) {
  const meta = [schoolProfile.address, schoolProfile.phone, schoolProfile.email]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join("  ·  ");

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: centered ? "center" : "flex-start",
        gap: 10,
      }}
    >
      {logo ? <Image src={logo} style={sharedStyles.logo} /> : null}
      <View style={centered ? { alignItems: "center" } : undefined}>
        <Text style={sharedStyles.schoolName}>{schoolProfile.name}</Text>
        {meta ? <Text style={sharedStyles.schoolMeta}>{meta}</Text> : null}
        <Text style={sharedStyles.docTitle}>{docTitleEn}</Text>
        <Text style={sharedStyles.docTitleHi}>{docTitleHi}</Text>
      </View>
    </View>
  );
}
