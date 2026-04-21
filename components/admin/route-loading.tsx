import { StatusBadge } from "@/components/admin/status-badge";

type RouteLoadingProps = {
  title: string;
  description: string;
  badgeLabel?: string;
};

export function RouteLoading({
  title,
  description,
  badgeLabel = "Loading",
}: RouteLoadingProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-slate-200 bg-white/95 p-6 shadow-sm">
        <StatusBadge label={badgeLabel} tone="neutral" />
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
          {title}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          {description}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="animate-pulse rounded-[24px] border border-slate-200 bg-white/80 p-5"
          >
            <div className="h-4 w-28 rounded bg-slate-200" />
            <div className="mt-4 h-8 w-2/3 rounded bg-slate-200" />
            <div className="mt-3 h-4 w-full rounded bg-slate-100" />
            <div className="mt-2 h-4 w-5/6 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
