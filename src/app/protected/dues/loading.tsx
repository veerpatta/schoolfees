import { RouteLoading } from "@/ui/shell/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      title="Dues"
      description="Loading outstanding dues."
      variant="table"
    />
  );
}
