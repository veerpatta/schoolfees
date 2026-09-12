import { RouteLoading } from "@/ui/shell/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      title="WhatsApp"
      description="Loading the message settings and this month's usage."
      variant="cards"
    />
  );
}
