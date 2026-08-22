import { RouteLoading } from "@/ui/shell/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      badgeLabel="Loading run"
      title="Reminder run"
      description="Working out who was messaged and what has come in since."
      cards={3}
    />
  );
}
