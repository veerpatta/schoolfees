import { getLocale, getTranslations } from "next-intl/server";

import { getDatabaseTarget } from "@/platform/db-target";

/**
 * A strip across the top of every page when this is not the production
 * database, naming the project it is actually reading.
 *
 * The guard in src/platform/db-target.ts stops the *wrong* thing happening.
 * This is for the right thing happening on the wrong data: a preview or a local
 * server looks exactly like production, and staff screenshots from one get read
 * as the other. Naming the database on screen is the cheapest way to stop
 * somebody acting on a figure that was never real.
 *
 * Renders nothing in production, so the live app is untouched. Server
 * component, no client JS, no state — it must not be something that can fail to
 * appear.
 *
 * The Hindi line is always shown alongside the English one (except when the app
 * is already in Hindi, where it would be a duplicate): most of the office reads
 * Hindi first, and a warning nobody reads is not a warning.
 */
export async function DevDatabaseBanner() {
  const target = getDatabaseTarget();

  if (target.kind === "production") {
    return null;
  }

  const [t, locale] = await Promise.all([getTranslations("DevBanner"), getLocale()]);
  const name = target.ref ?? t(target.kind === "local" ? "localLabel" : "unknownLabel");

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="dev-database-banner"
      className="sticky top-0 z-[100] w-full bg-amber-500 px-3 py-1 text-center text-amber-950"
    >
      <p className="text-xs font-semibold tracking-wide sm:text-sm">
        {t("line", { name })}
      </p>
      {locale === "hi" ? null : (
        <p className="font-devanagari text-xs">{t("hindiLine", { name })}</p>
      )}
    </div>
  );
}
