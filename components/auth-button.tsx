import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

import { LogoutButton } from "./logout-button";
import { Button } from "./ui/button";

export async function AuthButton() {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  return user ? (
    <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="min-w-0 text-right">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          Signed in
        </p>
        <p className="max-w-[15rem] truncate text-sm font-semibold text-slate-900">
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
