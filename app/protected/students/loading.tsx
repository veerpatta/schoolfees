import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/admin/page-header";

export default async function Loading() {
  const t = await getTranslations("Students");
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />

      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="h-4 w-32 rounded bg-surface-3 anim-shimmer" />
        <div className="grid gap-3 md:grid-cols-4">
          <div className="h-11 rounded-lg bg-surface-2 anim-shimmer" />
          <div className="h-11 rounded-lg bg-surface-2 anim-shimmer" />
          <div className="h-11 rounded-lg bg-surface-2 anim-shimmer" />
          <div className="h-11 rounded-lg bg-surface-2 anim-shimmer" />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="bg-surface-2 px-6 py-3 border-b border-border/40 flex justify-between">
          <div className="h-3 w-16 bg-surface-3 rounded anim-shimmer" />
          <div className="h-3 w-32 bg-surface-3 rounded anim-shimmer" />
          <div className="h-3 w-20 bg-surface-3 rounded anim-shimmer" />
          <div className="h-3 w-20 bg-surface-3 rounded anim-shimmer" />
          <div className="h-3 w-24 bg-surface-3 rounded anim-shimmer" />
        </div>
        <div className="divide-y divide-border/40">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((row) => (
            <div key={row} className="px-6 py-4 flex items-center justify-between">
              <div className="space-y-2 flex-1">
                <div className="h-4 w-40 bg-surface-3 rounded anim-shimmer" />
                <div className="h-3 w-24 bg-surface-2 rounded anim-shimmer" />
              </div>
              <div className="flex gap-8 items-center">
                <div className="h-3 w-24 bg-surface-2 rounded anim-shimmer" />
                <div className="h-7 w-20 bg-surface-3 rounded-md anim-shimmer" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
