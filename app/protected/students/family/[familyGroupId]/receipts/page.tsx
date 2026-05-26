import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";
import { ReceiptDocument } from "@/components/receipts/receipt-document";
import { FamilyReceiptsBatchActions } from "@/components/students/family-receipts-batch-actions";
import { appendSessionParam } from "@/lib/navigation/session-href";
import { FAMILY_REPRINT_RECEIPT_LIMIT, getFamilyReceiptsBundle } from "@/lib/receipts/family";
import { requireStaffPermission } from "@/lib/supabase/session";

type FamilyReceiptsPageProps = {
  params: Promise<{
    familyGroupId: string;
  }>;
  searchParams?: Promise<{
    print?: string;
    backTo?: string;
  }>;
};

export default async function FamilyReceiptsBatchPage({
  params,
  searchParams,
}: FamilyReceiptsPageProps) {
  const t = await getTranslations("Receipts");
  await requireStaffPermission("receipts:print", { onDenied: "redirect" });
  const resolvedParams = await params;
  const resolvedSearch = searchParams ? await searchParams : undefined;
  const bundle = await getFamilyReceiptsBundle(resolvedParams.familyGroupId);

  if (!bundle) {
    notFound();
  }

  const shouldAutoPrint = resolvedSearch?.print === "1";
  const sessionLabel = bundle.familyGroup.academic_session_label;
  const fallbackBack = bundle.members[0]
    ? appendSessionParam(`/protected/students/${bundle.members[0].id}`, sessionLabel)
    : "/protected/students";
  const backHref =
    resolvedSearch?.backTo && resolvedSearch.backTo.startsWith("/protected/")
      ? resolvedSearch.backTo
      : fallbackBack;

  const flatReceipts = bundle.members.flatMap((member) =>
    member.receipts.map((receipt) => ({ member, receipt })),
  );

  if (flatReceipts.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Receipts"
          title={`Family ${bundle.familyGroup.name} — Reprint receipts`}
          description="No receipts found for any sibling in this family group."
          actions={<FamilyReceiptsBatchActions backHref={backHref} autoPrint={false} disabled />}
          className="no-print"
        />
        <div className="rounded-lg border border-dashed border-border bg-surface-2/40 px-6 py-10 text-center">
          <p className="font-semibold text-foreground">Nothing to reprint yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            None of the linked siblings have posted receipts. Once a receipt is posted on Payment Desk
            it will appear here for a single batch reprint.
          </p>
        </div>
      </div>
    );
  }

  const hitLimit = bundle.receiptCount >= FAMILY_REPRINT_RECEIPT_LIMIT;

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 8mm;
          }

          .family-receipt-page {
            break-after: page;
            page-break-after: always;
            margin: 0 !important;
          }

          .family-receipt-page:last-of-type {
            break-after: auto;
            page-break-after: auto;
          }
        }
      `}</style>

      <PageHeader
        eyebrow="Receipts"
        title={`Family ${bundle.familyGroup.name} — Reprint receipts`}
        description={`${bundle.receiptCount} receipt${bundle.receiptCount === 1 ? "" : "s"} across ${bundle.members.filter((m) => m.receipts.length > 0).length} sibling${bundle.members.filter((m) => m.receipts.length > 0).length === 1 ? "" : "s"}.${hitLimit ? ` Capped at ${FAMILY_REPRINT_RECEIPT_LIMIT}.` : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <FamilyReceiptsBatchActions backHref={backHref} autoPrint={shouldAutoPrint} />
          </div>
        }
        className="no-print"
      />

      <div className="no-print rounded-lg border border-border bg-surface-2/60 px-4 py-3 text-xs text-muted-foreground">
        Each receipt prints on its own page. In the print dialog, choose <strong>Save as PDF</strong> as
        the destination if you need a digital copy instead of paper.
      </div>

      <div className="space-y-6">
        {flatReceipts.map(({ member, receipt }, index) => (
          <div key={receipt.id} className="family-receipt-page">
            <p className="no-print mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {index + 1} / {flatReceipts.length} · {member.full_name} (SR {member.admission_no})
            </p>
            <ReceiptDocument receipt={receipt} mode="saved" embedPageStyles={false} t={t} />
          </div>
        ))}
      </div>
    </div>
  );
}
