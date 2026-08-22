import { RouteLoading } from "@/ui/shell/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      badgeLabel="Loading campaigns"
      title="Campaigns"
      description="Reading saved settings and what each run collected."
      cards={2}
    />
  );
}
