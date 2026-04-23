import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { Button } from "@/components/ui/button";
import { roleLabels } from "@/lib/auth/roles";
import { getDefaultProtectedHref } from "@/lib/config/navigation";
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
        title="This screen is not available"
        description="Your account is signed in, but this screen or action is not included in your current role."
      />

      <SectionCard
        title="Why you were stopped"
        description="This page explains the block clearly instead of silently redirecting you."
      >
        <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p>
            Signed in as <strong>{staff.email ?? "staff user"}</strong> with role{" "}
            <strong>{roleLabels[staff.appRole]}</strong>.
          </p>
          <p>
            {requestedPermission
              ? `This action needs: ${requestedPermission}.`
              : "This route needs a permission that is not included in your role."}
          </p>
          <p>
            If you should have this access, ask an admin to review the role assignment in staff management.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild>
            <Link href={getDefaultProtectedHref(staff.appRole)}>Go to workspace</Link>
          </Button>
          {staff.appRole === "admin" ? (
            <Button asChild variant="outline">
              <Link href="/protected/staff">Review staff access</Link>
            </Button>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
