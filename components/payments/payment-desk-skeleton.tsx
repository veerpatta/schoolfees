export function PaymentDeskSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading Payment Desk" role="status">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="h-4 w-24 rounded bg-slate-200 animate-shimmer-fast" />
        <div className="mt-3 h-11 rounded-lg bg-slate-100 animate-shimmer-fast" />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="h-4 w-32 rounded bg-slate-200 animate-shimmer-fast" />
        <div className="mt-3 h-11 rounded-lg bg-slate-100 animate-shimmer-fast" />
      </div>
      <div className="grid gap-3 md:hidden">
        {[0, 1, 2].map((item) => (
          <div key={item} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="h-4 w-28 rounded bg-slate-200 animate-shimmer-fast" />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="h-3 rounded bg-slate-100 animate-shimmer-fast" />
              <div className="h-3 rounded bg-slate-100 animate-shimmer-fast" />
              <div className="h-3 rounded bg-slate-100 animate-shimmer-fast" />
              <div className="h-3 rounded bg-slate-100 animate-shimmer-fast" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
