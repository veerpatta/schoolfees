"use client";

import {
  PaymentDeskClient,
  type PaymentDeskMobileProps,
} from "@/components/payments/payment-desk-mobile";

export type PaymentEntryClientProps = PaymentDeskMobileProps;

export function PaymentEntryClient(props: PaymentEntryClientProps) {
  return <PaymentDeskClient {...props} formId="payment-entry-form" />;
}
