import { RouteLoading } from "@/ui/shell/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      badgeLabel="Loading dues"
      title="WhatsApp fee reminders"
      description="Rebuilding the eligible list from the ledger."
      cards={3}
    />
  );
}
