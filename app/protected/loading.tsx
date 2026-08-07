import { RouteLoading } from "@/components/admin/route-loading";

/**
 * Inherited by every route under /protected that has no loading.tsx of its own,
 * so the copy has to make sense everywhere. It used to say "Fetching protected
 * fee data", which read as wrong on a student edit form or a settings page.
 */
export default function Loading() {
  return (
    <RouteLoading
      badgeLabel="Loading"
      title="One moment"
      description="Opening this page."
    />
  );
}
