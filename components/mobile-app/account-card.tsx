"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { KeyRound, UserRound } from "lucide-react";

import { SignOutSubmit } from "@/components/auth/sign-out-submit";
import { logoutAction } from "@/app/auth/login/actions";
import { IconTile, MobileRow } from "@/components/mobile-app/mobile-kit";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";

/**
 * Account block for Settings (mobile app v2).
 *
 * The phone app has no persistent top bar — the design gives every screen its
 * own header and keeps only the tab bar. That removes the account menu's old
 * home, so the things it carried (who am I, appearance, change password, sign
 * out) live here instead. Settings is where a phone user already looks for
 * them, and it is the one screen the design reserves for exactly this.
 *
 * Sign-out is a form post to the existing `logoutAction`, not a fetch — it must
 * keep working with JS disabled and must not be a link that a mis-tap can
 * trigger silently.
 */
export function MobileAccountCard({
  staffEmail,
  roleLabel,
  passwordHref,
  className,
}: {
  staffEmail: string;
  roleLabel: string;
  passwordHref: string;
  className?: string;
}) {
  const t = useTranslations("MobileApp");

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5">
        <IconTile tone="neutral">
          <UserRound className="size-[18px]" aria-hidden="true" />
        </IconTile>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-extrabold text-foreground">{staffEmail}</p>
          <p className="truncate text-[11px] font-semibold text-muted-foreground">{roleLabel}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="px-3.5 py-2.5">
          <MobileRow
            icon={
              <IconTile tone="neutral">
                <span className="text-[15px]">🌗</span>
              </IconTile>
            }
            title={t("appearance")}
            description={t("appearanceHint")}
            trailing={<ThemeToggle />}
          />
        </div>

        <Link
          href={passwordHref}
          className="focus-ring flex min-h-14 items-center gap-3 border-t border-border/60 px-3.5 py-2.5 transition-colors active:bg-surface-2"
        >
          <IconTile tone="neutral">
            <KeyRound className="size-[18px]" aria-hidden="true" />
          </IconTile>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-bold text-foreground">
              {t("changePassword")}
            </span>
          </span>
        </Link>
      </div>

      <form action={logoutAction}>
        <SignOutSubmit className="focus-ring flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-destructive/40 bg-card px-4 text-[13.5px] font-extrabold text-destructive transition-colors active:bg-destructive-soft">
          {t("signOut")}
        </SignOutSubmit>
      </form>
    </div>
  );
}
