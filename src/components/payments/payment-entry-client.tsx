"use client";

import dynamic from "next/dynamic";

import type { PaymentDeskMobileProps } from "@/components/payments/payment-desk-mobile";

function PaymentDeskClientLoading() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading Payment Desk">
      <div className="h-24 rounded-xl border border-border bg-card anim-shimmer" />
      <div className="h-40 rounded-xl border border-border bg-card anim-shimmer" />
    </div>
  );
}

const PaymentDeskClient = dynamic(
  () => import("@/components/payments/payment-desk-mobile").then((mod) => mod.PaymentDeskClient),
  {
    ssr: false,
    loading: PaymentDeskClientLoading,
  },
);

export type PaymentEntryClientProps = PaymentDeskMobileProps;

export function PaymentEntryClient(props: PaymentEntryClientProps) {
  return <PaymentDeskClient {...props} formId="payment-entry-form" />;
}
