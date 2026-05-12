"use client";

import dynamic from "next/dynamic";

import {
  PaymentDeskMobile,
  type PaymentDeskMobileProps,
} from "@/components/payments/payment-desk-mobile";

const PaymentDeskDesktop = dynamic(
  () => import("@/components/payments/payment-desk-desktop"),
  { ssr: true },
);

export type PaymentEntryClientProps = PaymentDeskMobileProps;

export function PaymentEntryClient(props: PaymentEntryClientProps) {
  return (
    <>
      <div className="md:hidden">
        <PaymentDeskMobile {...props} formId="payment-entry-form" />
      </div>
      <div className="hidden md:block">
        <PaymentDeskDesktop {...props} />
      </div>
    </>
  );
}
