import type { ReactNode } from "react";

import type { PaymentDeskPhase } from "@/lib/payments/payment-desk-controller";
import { cn } from "@/platform/utils";

export function PaymentDeskRoot({
  children,
  phase,
}: {
  children: ReactNode;
  phase: PaymentDeskPhase;
}) {
  return (
    <div
      className="payment-entry-client-layout space-y-6 mobile-bottom-nav-clearance md:pb-4"
      data-payment-workflow-phase={phase}
    >
      {children}
    </div>
  );
}

export function DesktopPaymentDeskSection({ children }: { children: ReactNode }) {
  return (
    <section className="hidden md:block" aria-label="Payment Desk">
      {children}
    </section>
  );
}

export function DesktopPaymentDeskBody({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3" style={{ height: "calc(100vh - 160px)", minHeight: 560 }}>
      {children}
    </div>
  );
}

export function DesktopPaymentDeskStudentPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-[280px] shrink-0 flex-col gap-2 overflow-y-auto rounded-xl border border-border bg-card p-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DesktopPaymentDeskMainPanel({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto">{children}</div>;
}
