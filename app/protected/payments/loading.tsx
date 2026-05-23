import { PageHeader } from "@/components/admin/page-header";
import { PaymentDeskSkeleton } from "@/components/payments/payment-desk-skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Payments"
        title="Payment Desk"
        description="Select a student, review dues, collect payment, and print the receipt."
      />
      <PaymentDeskSkeleton />
    </div>
  );
}
