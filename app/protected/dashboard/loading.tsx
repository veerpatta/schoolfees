import { PageHeader } from "@/components/admin/page-header";

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Dashboard"
        description="Today's collection, pending dues, and follow-up - at a glance."
      />

      <div className="h-4 w-40 bg-surface-2 rounded anim-shimmer" />

      {/* KPI Cards Skeleton */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="h-3 w-28 bg-surface-3 rounded anim-shimmer" />
            <div className="h-8 w-36 bg-surface-2 rounded anim-shimmer" />
            <div className="h-3 w-48 bg-surface-3 rounded anim-shimmer" />
          </div>
        ))}
      </div>

      {/* Quick Actions Skeleton */}
      <div className="flex flex-wrap gap-2">
        <div className="h-10 w-44 bg-surface-3 rounded-md anim-shimmer" />
        <div className="h-10 w-32 bg-surface-2 rounded-md anim-shimmer" />
        <div className="h-10 w-32 bg-surface-2 rounded-md anim-shimmer" />
        <div className="h-10 w-28 bg-surface-2 rounded-md anim-shimmer" />
      </div>

      {/* Collection Funnel Skeleton */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="space-y-2">
          <div className="h-4 w-36 bg-surface-3 rounded anim-shimmer" />
          <div className="h-3 w-64 bg-surface-2 rounded anim-shimmer" />
        </div>
        <div className="h-8 w-full bg-surface-2 rounded-full anim-shimmer" />
        <div className="grid grid-cols-3 gap-4 pt-2">
          <div className="space-y-2"><div className="h-3 w-20 bg-surface-3 rounded anim-shimmer" /><div className="h-4 w-24 bg-surface-2 rounded anim-shimmer" /></div>
          <div className="space-y-2"><div className="h-3 w-20 bg-surface-3 rounded anim-shimmer" /><div className="h-4 w-24 bg-surface-2 rounded anim-shimmer" /></div>
          <div className="space-y-2"><div className="h-3 w-20 bg-surface-3 rounded anim-shimmer" /><div className="h-4 w-24 bg-surface-2 rounded anim-shimmer" /></div>
        </div>
      </div>

      {/* Daily Momentum Skeleton */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="h-4 w-40 bg-surface-3 rounded anim-shimmer" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((col) => (
            <div key={col} className="space-y-2">
              <div className="h-3 w-24 bg-surface-3 rounded anim-shimmer" />
              <div className="h-6 w-20 bg-surface-2 rounded anim-shimmer" />
              <div className="h-3 w-28 bg-surface-3 rounded anim-shimmer" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
