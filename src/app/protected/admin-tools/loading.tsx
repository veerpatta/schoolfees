import { RouteLoading } from "@/ui/shell/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      badgeLabel="Loading admin tools"
      title="Opening Admin Tools"
      description="Loading staff tools, session health, and recent activity."
    />
  );
}
