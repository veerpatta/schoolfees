import { RouteLoading } from "@/components/admin/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      badgeLabel="Payment Desk"
      title="Opening payment entry"
      description="Loading student lookup and today's receipt activity. Selected-student dues load after a student is chosen."
      cards={4}
    />
  );
}
