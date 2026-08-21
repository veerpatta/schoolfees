import { RouteLoading } from "@/ui/shell/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      title="Finance controls"
      description="Loading the day book, refunds and correction reviews."
      variant="table"
    />
  );
}
