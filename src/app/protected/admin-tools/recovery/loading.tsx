import { RouteLoading } from "@/ui/shell/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      badgeLabel="Loading recovery queue"
      title="Left Students With Dues"
      description="Loading left/graduated students with pending balances."
      cards={2}
    />
  );
}
