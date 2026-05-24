"use client";

import { useRouter } from "next/navigation";

import { Sheet } from "@/components/ui/sheet";

type Props = {
  returnTo?: string;
  children: React.ReactNode;
};

export function PaymentDrawerShell({ returnTo, children }: Props) {
  const router = useRouter();

  const handleClose = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(returnTo ?? "/protected/dashboard");
    }
  };

  return (
    <Sheet
      open={true}
      onClose={handleClose}
      side="right"
      title="Payment Desk"
      description="Review dues and collect payment."
    >
      <div className="space-y-6">{children}</div>
    </Sheet>
  );
}
