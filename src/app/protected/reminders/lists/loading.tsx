import { RouteLoading } from "@/ui/shell/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      badgeLabel="Loading dues"
      title="Collection lists"
      description="Grouping the eligible list for printing."
      cards={3}
    />
  );
}
