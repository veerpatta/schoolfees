"use client";

import {
  PaymentDeskMobile,
  type PaymentDeskMobileProps,
} from "@/components/payments/payment-desk-mobile";

export default function PaymentDeskDesktop(props: PaymentDeskMobileProps) {
  return <PaymentDeskMobile {...props} formId="payment-entry-form-desktop" />;
}

