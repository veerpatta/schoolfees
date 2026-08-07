import { RouteLoading } from "@/components/admin/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      title="Dues"
      description="Loading outstanding dues."
      variant="table"
    />
  );
}
