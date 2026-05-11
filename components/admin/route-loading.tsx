import { LoadingBlock, LoadingProgress } from "@/components/ui/loading-skeleton";
import { Badge } from "@/components/ui/badge";

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
    <div className="space-y-6 anim-fade-in">
      <div className="space-y-3">
        <Badge variant="neutral" dot="info">
          {badgeLabel}
        </Badge>
        <h2 className="text-[22px] font-semibold leading-tight tracking-tight text-foreground sm:text-2xl">
          {title}
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
        <LoadingProgress className="max-w-sm" label={title} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: cards }).map((_, index) => (
          <LoadingBlock key={index} />
        ))}
      </div>
    </div>
  );
}
