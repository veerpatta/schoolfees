"use client";

import Link from "next/link";
import { AlertOctagon } from "lucide-react";

import { Button } from "@/components/ui/button";

type RouteErrorStateProps = {
  title: string;
  description: string;
  reset: () => void;
  errorDigest?: string;
  homeHref?: string;
  homeLabel?: string;
};

export function RouteErrorState({
  title,
  description,
  reset,
  errorDigest,
  homeHref = "/",
  homeLabel = "Back to overview",
}: RouteErrorStateProps) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive-soft p-6 anim-fade-in">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-destructive text-destructive-foreground">
          <AlertOctagon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-destructive-soft-foreground">
            Something failed
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {title}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-destructive-soft-foreground">
            {description}
          </p>
          {errorDigest ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Error ref: <span className="font-mono">{errorDigest}</span>
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-2">
            <Button type="button" variant="primary" onClick={reset}>
              Try again
            </Button>
            <Button asChild variant="outline">
              <Link href={homeHref}>{homeLabel}</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
