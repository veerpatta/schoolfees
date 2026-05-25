import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { Button } from "@/components/ui/button";
import { FamilyPayTogetherForm } from "@/components/family/pay-together-form";
import { isFamilyPaymentsEnabled } from "@/lib/family-payments/feature-flag";
import { getFamilyPaymentContext } from "@/lib/family-payments/data";
import { requireStaffPermission } from "@/lib/supabase/session";

import { postFamilyPaymentAction } from "./actions";

type Props = {
  params: Promise<{ familyGroupId: string }>;
  searchParams?: Promise<{
    error?: string;
    notice?: string;
  }>;
};

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default async function FamilyPayPage({ params, searchParams }: Props) {
  await requireStaffPermission("payments:write", { onDenied: "redirect" });
  const { familyGroupId } = await params;
  const resolved = searchParams ? await searchParams : undefined;
  const featureEnabled = isFamilyPaymentsEnabled();
  const context = await getFamilyPaymentContext(familyGroupId);

  if (!context) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Family"
        title="Pay Together (beta)"
        description="One amount, split across siblings. Generates one receipt per child, all linked back to the family batch."
        actions={
          <Button asChild variant="outline">
            <Link href={`/protected/students/family/${familyGroupId}/receipts`}>Back to receipts</Link>
          </Button>
        }
      />

      {!featureEnabled ? (
        <div className="rounded-xl border bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground">
          Family payments are disabled. Set <code className="font-mono">FAMILY_PAYMENTS_ENABLED=true</code> in
          environment variables to enable for testing.
        </div>
      ) : null}

      {resolved?.error ? (
        <div className="rounded-xl border bg-destructive-soft px-4 py-3 text-sm text-destructive-soft-foreground">
          {resolved.error}
        </div>
      ) : null}
      {resolved?.notice ? (
        <div className="rounded-xl border bg-success-soft px-4 py-3 text-sm text-success-soft-foreground">
          {resolved.notice}
        </div>
      ) : null}

      <SectionCard
        title="Allocation"
        description="The default split uses each child's pending share. Override per-child if the family wants a different allocation."
      >
        {context.members.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-strong bg-surface-2 px-4 py-6 text-center text-sm text-muted-foreground">
            No confirmed family members in session {context.academicSessionLabel}.
          </p>
        ) : (
          <FamilyPayTogetherForm
            familyGroupId={familyGroupId}
            defaultDate={todayIso()}
            members={context.members}
            totalPending={context.totalPending}
            disabled={!featureEnabled}
            action={postFamilyPaymentAction}
          />
        )}
      </SectionCard>
    </div>
  );
}
