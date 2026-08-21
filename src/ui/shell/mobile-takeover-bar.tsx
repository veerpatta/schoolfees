"use client";

import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";

import { isMobileTakeoverRoute } from "@/platform/config/navigation";

/**
 * Back bar for the phone app's takeover screens (mobile v2).
 *
 * The design keeps the tab bar on six screens and replaces the screen entirely
 * for the rest — detail views, records, the admin long tail. Those screens hide
 * the bar, so this is the ONLY way back and it is not optional.
 *
 * It renders the arrow alone rather than arrow + title: each page already
 * supplies its own title through `PageHeader`, and duplicating it here would
 * put the screen name on the phone twice. The design draws them on one row;
 * splitting them costs a few pixels and avoids editing fourteen pages to
 * suppress a heading they legitimately own.
 *
 * `router.back()` rather than a hard-coded parent href: a takeover is reached
 * from several places (Students list, More hub, a dashboard card), and the
 * honest "back" is wherever the user actually came from. Falls back to the
 * workspace root on a cold load with no history.
 */
export function MobileTakeoverBar() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("MobileApp");

  if (!isMobileTakeoverRoute(pathname)) return null;

  return (
    <div
      className="sticky top-0 z-30 border-b border-border bg-background/95 px-3 pb-2 backdrop-blur md:hidden print:hidden"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.5rem)" }}
    >
      <button
        type="button"
        aria-label={t("back")}
        onClick={() => {
          if (window.history.length > 1) {
            router.back();
            return;
          }
          router.push("/protected/dashboard");
        }}
        className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-card pl-2 pr-3 text-[12.5px] font-extrabold text-foreground transition-colors active:bg-surface-2"
      >
        <ArrowLeft className="size-[18px]" aria-hidden="true" />
        {t("back")}
      </button>
    </div>
  );
}
