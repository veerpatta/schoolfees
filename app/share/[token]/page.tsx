import { notFound } from "next/navigation";

import { formatInr } from "@/lib/helpers/currency";
import {
  getParentShareView,
  recordShareLinkView,
  validateShareLinkToken,
} from "@/lib/share-links/data";

type Props = {
  params: Promise<{ token: string }>;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" });
}

export const dynamic = "force-dynamic";

export default async function ParentSharePage({ params }: Props) {
  const { token } = await params;
  const validation = await validateShareLinkToken(token);

  if (!validation.ok) {
    if (validation.reason === "not_found") {
      notFound();
    }
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-12 text-center">
        <h1 className="text-xl font-semibold text-foreground">
          {validation.reason === "expired" ? "Link expired" : "Link revoked"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Please ask the school office for a fresh link.
        </p>
      </main>
    );
  }

  const view = await getParentShareView(validation.studentId);
  await recordShareLinkView(validation.link.id);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:py-12">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Shri Veer Patta Senior Secondary School
        </p>
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          {view.student.fullName}
        </h1>
        <p className="text-sm text-muted-foreground">
          {view.student.classLabel} · SR {view.student.admissionNo}
        </p>
      </header>

      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Fees summary
        </h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Total paid</dt>
            <dd className="text-xl font-semibold">{formatInr(view.financial.totalPaid)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Outstanding</dt>
            <dd
              className={`text-xl font-semibold ${view.financial.outstandingAmount > 0 ? "text-destructive" : "text-success"}`}
            >
              {formatInr(view.financial.outstandingAmount)}
            </dd>
          </div>
          {view.financial.nextDueLabel ? (
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Next instalment</dt>
              <dd className="text-sm font-medium">
                {view.financial.nextDueLabel}
                {view.financial.nextDueAmount ? ` — ${formatInr(view.financial.nextDueAmount)}` : ""}
                {view.financial.nextDueDate ? ` (due ${formatDate(view.financial.nextDueDate)})` : ""}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Recent receipts
        </h2>
        {view.student.receipts.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No receipts yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {view.student.receipts.map((receipt) => (
              <li key={receipt.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{receipt.receiptNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(receipt.paymentDate)} · {receipt.paymentMode}
                  </p>
                </div>
                <p className="font-mono text-sm font-semibold">{formatInr(receipt.totalAmount)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-center text-xs text-muted-foreground">
        Read-only view shared by the school office. Contact the office for any corrections or to make a payment.
      </p>
    </main>
  );
}
