"use client";

import {
  PaymentDeskClient,
  type PaymentDeskMobileProps,
} from "@/modules/payments/ui/payment-desk-mobile";

export default function PaymentDeskDesktop(props: PaymentDeskMobileProps) {
  return <PaymentDeskClient {...props} formId="payment-entry-form" />;
}
