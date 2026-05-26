import { RouteLoading } from "@/components/admin/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      badgeLabel="Loading promotion"
      title="Year-End Class Promotion"
      description="Reading recent promotion runs and the next-year session setup."
      cards={2}
    />
  );
}
