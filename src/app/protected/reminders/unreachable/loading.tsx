import { RouteLoading } from "@/ui/shell/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      badgeLabel="Loading families"
      title="Families WhatsApp cannot reach"
      description="Rebuilding the dues list to find who has no usable number."
      cards={3}
    />
  );
}
