import { describe, expect, it } from "vitest";

import {
  SCHOOL_UPI_PAYMENT_CONFIG,
  buildStudentFeeUpiPayment,
} from "@/lib/payments/upi";

describe("buildStudentFeeUpiPayment", () => {
  it("builds a school UPI intent with exact rupee amount and admission reference", () => {
    const payment = buildStudentFeeUpiPayment({
      admissionNo: "ADM1234",
      amount: 8000,
    });

    expect(payment.uri).toBe(
      "upi://pay?pa=shriveerpattassecsch.68347408%40hdfcbank&pn=SHRI%20VEER%20PATTA%20S%20SEC%20SCH&am=8000&cu=INR&tn=Fee%20ADM1234",
    );
    expect(payment.displayReference).toBe("Fee ADM1234");
    expect(payment.payeeName).toBe(SCHOOL_UPI_PAYMENT_CONFIG.payeeName);
  });

  it("caps the UPI note to a short office-readable reference", () => {
    const payment = buildStudentFeeUpiPayment({
      admissionNo: "VERY-LONG-ADMISSION-NUMBER-123456789",
      amount: 12500.75,
    });

    expect(payment.displayReference.length).toBeLessThanOrEqual(35);
    expect(payment.uri).toContain("am=12501");
    expect(payment.uri).toContain("tn=");
  });
});
