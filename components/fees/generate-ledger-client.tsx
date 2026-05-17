"use client";

import { useEffect, useActionState } from "react";
import { AlertCircle, ArrowLeft, Loader2, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { LedgerRegenerationActionState } from "@/lib/fees/types";

type GenerateLedgerClientProps = {
  initialState: LedgerRegenerationActionState;
  action: (
    previous: LedgerRegenerationActionState,
    formData: FormData,
  ) => Promise<LedgerRegenerationActionState>;
};

function AlertBox({
  tone,
  title,
  message,
}: {
  tone: "error" | "success";
  title: string;
  message: string;
}) {
  const palette =
    tone === "error"
      ? "bg-destructive-soft text-destructive-soft-foreground"
      : "bg-success-soft text-success-soft-foreground";

  return (
    <div className={`flex gap-3 rounded-lg border p-4 text-sm ${palette}`}>
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <h4 className="font-semibold">{title}</h4>
        <p>{message}</p>
      </div>
    </div>
  );
}

export function GenerateLedgerClient({ initialState, action }: GenerateLedgerClientProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" size="sm" asChild>
          <Link href="/protected/fee-setup">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Fee Setup
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <RotateCcw className="h-5 w-5 text-info" />
            <span>Apply dues update</span>
          </CardTitle>
          <CardDescription>
            Apply the current Fee Setup to all unpaid and future dues. Rows with existing payments are preserved.
          </CardDescription>
        </CardHeader>

        <form action={formAction}>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="reason">Reason for dues update</Label>
              <textarea
                id="reason"
                name="reason"
                required
                rows={4}
                className="flex min-h-[96px] w-full rounded-md border border-border-strong bg-card px-3 py-2 text-sm shadow-sm transition-colors focus-visible:border-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40"
                placeholder="Describe why dues are being updated, such as a fee change or revised installment dates."
              />
              <p className="text-xs text-muted-foreground">
                This reason is saved with the audit record.
              </p>
            </div>

            {state.message && state.status === "error" ? (
              <AlertBox tone="error" title="Update failed" message={state.message} />
            ) : null}

            {state.message && state.status === "success" ? (
              <AlertBox tone="success" title="Dues updated successfully" message={state.message} />
            ) : null}

            {!state.message ? (
              <div className="rounded-2xl border border-dashed border-border-strong bg-surface-2 p-5 text-sm text-muted-foreground">
                Enter a reason and update dues to apply the current Fee Setup to all unpaid and future dues.
              </div>
            ) : null}
          </CardContent>

          <CardFooter className="flex flex-col gap-3 border-t border-border bg-surface-2 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-muted-foreground">
              Payments, receipts, and payment adjustments remain append-only. This workflow only
              recalculates future or unpaid rows and leaves paid history intact.
            </p>

            <Button
              type="submit"
              disabled={pending || state.status === "success"}
            >
              {pending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update dues now"
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
