export function PaymentDeskSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading Payment Desk" role="status">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="h-4 w-24 rounded bg-surface-3 anim-shimmer" />
        <div className="mt-3 h-11 rounded-lg bg-surface-2 anim-shimmer" />
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="h-4 w-32 rounded bg-surface-3 anim-shimmer" />
        <div className="mt-3 h-11 rounded-lg bg-surface-2 anim-shimmer" />
      </div>
      <div className="grid gap-3 md:hidden">
        {[0, 1, 2].map((item) => (
          <div key={item} className="rounded-xl border border-border bg-card p-3">
            <div className="h-4 w-28 rounded bg-surface-3 anim-shimmer" />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="h-3 rounded bg-surface-2 anim-shimmer" />
              <div className="h-3 rounded bg-surface-2 anim-shimmer" />
              <div className="h-3 rounded bg-surface-2 anim-shimmer" />
              <div className="h-3 rounded bg-surface-2 anim-shimmer" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
