import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { Button } from "@/components/ui/button";
import { roleLabels } from "@/lib/auth/roles";
import { getDefaultProtectedHref } from "@/lib/config/navigation";
import { requireAuthenticatedStaff } from "@/lib/supabase/session";

import { getViewSessionCookie } from "@/lib/session/cookie";
import { resolveViewSession } from "@/lib/session/resolver";
import { appendSessionParam } from "@/lib/navigation/session-href";

type AccessDeniedPageProps = {
  searchParams?: Promise<{
    permission?: string;
    session?: string | string[];
  }>;
};

function asString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[value.length - 1] ?? "";
  return value ?? "";
}

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
  const viewSession = await resolveViewSession({
    searchParamSession: asString(resolvedSearchParams?.session),
    cookieSession: await getViewSessionCookie(),
  });
  const withSession = (href: string) => appendSessionParam(href, viewSession.sessionLabel);
  const requestedPermission = formatPermissionLabel(
    asString(resolvedSearchParams?.permission),
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
        <div className="space-y-4 rounded-2xl border bg-warning-soft p-4 text-sm text-warning-soft-foreground">
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
            <Link href={withSession(getDefaultProtectedHref(staff.appRole))}>Go to workspace</Link>
          </Button>
          {staff.appRole === "admin" ? (
            <Button asChild variant="outline">
              <Link href={withSession("/protected/staff")}>Review staff access</Link>
            </Button>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
