import { RouteLoading } from "@/ui/shell/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      badgeLabel="Loading activity"
      title="Recent workspace activity"
      description="Pulling the latest payments, edits, exports, and follow-ups."
      cards={2}
    />
  );
}
