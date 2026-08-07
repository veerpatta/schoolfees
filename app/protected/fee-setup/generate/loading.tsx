import { RouteLoading } from "@/components/admin/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      title="Regenerate dues"
      description="Loading the current fee policy."
      variant="cards"
    />
  );
}
