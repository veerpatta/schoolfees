import { RouteLoading } from "@/ui/shell/route-loading";

export default function Loading() {
  return (
    <RouteLoading
      badgeLabel="Loading templates"
      title="WhatsApp templates"
      description="Loading message templates for defaulter and receipt outreach."
      cards={2}
    />
  );
}
