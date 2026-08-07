import { RouteLoading } from "@/components/admin/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      title="Fee time travel"
      description="Loading historical fee snapshots."
      variant="table"
    />
  );
}
