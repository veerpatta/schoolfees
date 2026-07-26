import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildStudentFeeUpiPayment } from "@/lib/payments/upi";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/**
 * Source with comments removed.
 *
 * The negative assertions below ("must not mention hi-IN", "must not claim
 * auto-confirmation") are about what the CODE does and what the UI says. The
 * files explain at length why those things are absent, and matching prose
 * that documents a decision as if it were the decision would make it
 * impossible to write the comment at all.
 */
const readCode = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/**
 * The two prototype affordances that turned out to be genuinely buildable.
 *
 * The rest of that list — printer status, UPI auto-confirmation, an offline
 * sync clock, a 9am reminder job — was deliberately NOT built, because each
 * would have to lie about a capability the school does not have. These two
 * are the ones where the underlying thing already exists.
 */

describe("voice search", () => {
  const hook = readCode("hooks/use-voice-search.ts");
  const button = readCode("components/mobile-app/voice-search-button.tsx");

  it("recognises in en-IN whatever the UI language is", () => {
    // Student names and SR numbers are stored in Latin script. Under hi-IN a
    // clerk saying "Rahul Sharma" gets "राहुल शर्मा" back, which matches no
    // row — the feature would break precisely for the users the Hindi UI
    // exists to serve.
    expect(hook).toContain('recognition.lang = "en-IN"');
    expect(hook).not.toContain("hi-IN");
  });

  it("renders no mic at all where speech recognition is missing", () => {
    // iOS Safari and most in-app browsers. A button that does nothing when
    // tapped is worse than no button.
    expect(hook).toContain("webkitSpeechRecognition");
    expect(button).toContain("if (!supported) return null");
  });

  it("cancels rather than stacking when tapped while listening", () => {
    expect(hook).toContain("recognitionRef.current.abort()");
  });

  it("stays silent on a denied mic instead of raising an error", () => {
    // The clerk can just type; a permission toast for a feature they did not
    // commit to is noise.
    expect(hook).toContain("recognition.onerror");
    expect(hook).not.toMatch(/onerror[\s\S]{0,200}toast\(/);
  });
});

describe("UPI QR", () => {
  it("encodes the entered amount into a real UPI intent", () => {
    const payment = buildStudentFeeUpiPayment({ admissionNo: "SR 245", amount: 7500 });
    expect(payment.uri).toContain("upi://pay?");
    expect(payment.uri).toContain("am=7500");
    expect(payment.uri).toContain("cu=INR");
    expect(payment.vpa).toBe("shriveerpattassecsch.68347408@hdfcbank");
  });

  it("rounds to whole rupees and never goes negative", () => {
    expect(buildStudentFeeUpiPayment({ admissionNo: "X", amount: 100.4 }).amount).toBe(100);
    expect(buildStudentFeeUpiPayment({ admissionNo: "X", amount: -50 }).amount).toBe(0);
  });

  it("claims no auto-confirmation anywhere in the card", () => {
    // The prototype promised the payment "confirms here automatically". That
    // needs a gateway webhook the school does not have, so the card must not
    // imply it — the clerk still saves the receipt by hand.
    const card = readCode("components/payments/upi-qr-card.tsx");
    expect(card).not.toMatch(/auto.?confirm/i);
    expect(card).not.toMatch(/webhook|gateway/i);
  });

  it("renders nothing until there is an amount to encode", () => {
    const card = readCode("components/payments/upi-qr-card.tsx");
    expect(card).toContain("if (payment.amount <= 0) return null");
  });

  it("keeps qrcode out of the payments route's initial bundle", () => {
    // quality/route-bundle-baseline.json budgets this route in gzip bytes.
    const card = readCode("components/payments/upi-qr-card.tsx");
    expect(card).toContain('await import("qrcode")');
    expect(card).not.toMatch(/^import .*from "qrcode"/m);
  });

  it("plates the QR on white so it scans in dark mode", () => {
    const card = readCode("components/payments/upi-qr-card.tsx");
    expect(card).toContain('color: { dark: "#000000", light: "#ffffff" }');
    expect(card).toContain("bg-white");
  });
});
