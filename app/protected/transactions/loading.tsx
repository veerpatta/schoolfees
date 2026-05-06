import { RouteLoading } from "@/components/admin/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      badgeLabel="Transactions"
      title="Loading finance records"
      description="Fetching receipts, dues, and export-ready records for the selected view."
      cards={5}
    />
  );
}
