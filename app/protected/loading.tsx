import { RouteLoading } from "@/components/admin/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      badgeLabel="Loading workspace"
      title="Fetching protected fee data"
      description="The app is validating the staff session and loading the current admin workspace."
    />
  );
}
