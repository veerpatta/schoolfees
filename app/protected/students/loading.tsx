import { RouteLoading } from "@/components/admin/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      badgeLabel="Students"
      title="Loading students"
      description="Preparing student records, filters, and office actions."
      cards={4}
    />
  );
}
