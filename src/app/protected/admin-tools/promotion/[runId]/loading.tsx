import { RouteLoading } from "@/ui/shell/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      title="Promotion run"
      description="Loading every student's promotion decision."
      variant="table"
    />
  );
}
