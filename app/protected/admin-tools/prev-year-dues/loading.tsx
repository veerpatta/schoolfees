import { RouteLoading } from "@/components/admin/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      badgeLabel="Loading previous-year dues"
      title="Previous Year Dues"
      description="Loading carry-forward import batches and per-row results."
      cards={2}
    />
  );
}
