import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { Button } from "@/components/ui/button";
import { requireAuthenticatedStaff } from "@/lib/supabase/session";

type AccessDeniedPageProps = {
  searchParams?: Promise<{
    permission?: string;
  }>;
};

function formatPermissionLabel(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .join(", ");
}

export default async function AccessDeniedPage({
  searchParams,
}: AccessDeniedPageProps) {
  const staff = await requireAuthenticatedStaff();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedPermission = formatPermissionLabel(
    resolvedSearchParams?.permission ?? "",
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Access"
        title="Permission required"
        description="Your account is signed in, but this screen or action needs a permission that is not available to your current role."
      />

      <SectionCard
        title="Why access was denied"
        description="Use this page instead of a silent redirect so staff can see what capability is missing."
      >
        <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p>
            Signed in as <strong>{staff.email ?? "staff user"}</strong> with role{" "}
            <strong>{staff.appRole}</strong>.
          </p>
          <p>
            {requestedPermission
              ? `Required permission: ${requestedPermission}.`
              : "A higher permission is required for this route."}
          </p>
          <p>
            If this access is expected, ask an admin to review the staff role assignment
            in staff management.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/protected">Back to dashboard</Link>
          </Button>
          {staff.appRole === "admin" ? (
            <Button asChild variant="outline">
              <Link href="/protected/staff">Open staff management</Link>
            </Button>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
