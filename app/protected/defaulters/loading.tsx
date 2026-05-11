import { RouteLoading } from "@/components/admin/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      badgeLabel="Defaulters"
      title="Loading follow-up list"
      description="Preparing pending dues and student follow-up records."
      cards={4}
    />
  );
}
