import { RouteLoading } from "@/components/admin/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      badgeLabel="Fee Setup"
      title="Loading fee setup"
      description="Opening yearly fee defaults, classes, routes, and review status."
      cards={4}
    />
  );
}
