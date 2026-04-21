"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

type RouteErrorStateProps = {
  title: string;
  description: string;
  reset: () => void;
  homeHref?: string;
  homeLabel?: string;
};

export function RouteErrorState({
  title,
  description,
  reset,
  homeHref = "/",
  homeLabel = "Back to overview",
}: RouteErrorStateProps) {
  return (
    <div className="rounded-[28px] border border-rose-200 bg-white/95 p-6 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-600">
        Something failed
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
        {title}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
        {description}
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button type="button" onClick={reset}>
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href={homeHref}>{homeLabel}</Link>
        </Button>
      </div>
    </div>
  );
}
