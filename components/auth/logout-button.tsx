"use client";

import { useFormStatus } from "react-dom";

import { logoutAction } from "@/app/auth/login/actions";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

function SubmitButton({ className }: { className?: string }) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size="sm"
      variant="outline"
      disabled={pending}
      loading={pending}
      loadingText="Signing out…"
      leadingIcon={<LogOut className="size-4" />}
      className={className}
    >
      Sign out
    </Button>
  );
}

export function LogoutButton({ className }: { className?: string }) {
  return (
    <form action={logoutAction}>
      <SubmitButton className={className} />
    </form>
  );
}
