import { RouteLoading } from "@/components/admin/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      badgeLabel="Dashboard"
      title="Preparing today's office overview"
      description="Loading collection totals, pending dues, and follow-up lists for the active school year."
      cards={6}
    />
  );
}
