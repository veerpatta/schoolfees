"use client";

import {
  PaymentDeskClient,
  type PaymentDeskMobileProps,
} from "@/components/payments/payment-desk-mobile";

export default function PaymentDeskDesktop(props: PaymentDeskMobileProps) {
  return <PaymentDeskClient {...props} formId="payment-entry-form" />;
}
