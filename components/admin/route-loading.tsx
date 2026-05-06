import { StatusBadge } from "@/components/admin/status-badge";
import { LoadingBlock, LoadingProgress } from "@/components/ui/loading-skeleton";

type RouteLoadingProps = {
  title: string;
  description: string;
  badgeLabel?: string;
  cards?: number;
};

export function RouteLoading({
  title,
  description,
  badgeLabel = "Loading",
  cards = 4,
}: RouteLoadingProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-slate-200 bg-white/95 p-6 shadow-sm">
        <StatusBadge label={badgeLabel} tone="neutral" />
        <LoadingProgress className="mt-4 max-w-sm" label={title} />
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
          {title}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          {description}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: cards }).map((_, index) => (
          <LoadingBlock key={index} className="rounded-[24px] bg-white/80 p-5" />
        ))}
      </div>
    </div>
  );
}
