import { RouteLoading } from "@/components/admin/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      badgeLabel="Loading session health"
      title="Checking academic sessions"
      description="Reading dues and class fee setup for every session in the workspace."
      cards={3}
    />
  );
}
