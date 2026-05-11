import Link from "next/link";
import { getAuthenticatedStaff } from "@/lib/supabase/session";

import { LogoutButton } from "./logout-button";
import { Button } from "./ui/button";

export async function AuthButton() {
  const user = await getAuthenticatedStaff();

  return user ? (
    <div className="flex items-center gap-3 rounded-full border border-border bg-card px-3 py-2 shadow-sm">
      <div className="min-w-0 text-right">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Signed in
        </p>
        <p className="max-w-[15rem] truncate text-sm font-semibold text-foreground">
          {user.email ?? "Authorized staff"}
        </p>
      </div>
      <LogoutButton />
    </div>
  ) : (
    <Button asChild size="sm">
        <Link href="/auth/login">Sign in</Link>
    </Button>
  );
}
