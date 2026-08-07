import { RouteLoading } from "@/components/admin/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      title="Family receipts"
      description="Loading receipts for this family."
      variant="table"
    />
  );
}
