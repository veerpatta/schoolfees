"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

type RateGaugeProps = {
  value: number;
  size?: "sm" | "md";
  className?: string;
};

export function RateGauge({ value, size = "md", className }: RateGaugeProps) {
  const arcRef = useRef<SVGCircleElement>(null);
  const clamped = Math.min(100, Math.max(0, value));

  const r = size === "sm" ? 18 : 30;
  const sw = size === "sm" ? 5 : 7;
  const wh = size === "sm" ? 52 : 80;
  const cx = wh / 2;
  const cy = wh / 2;
  const circumference = 2 * Math.PI * r;
  const targetOffset = circumference * (1 - clamped / 100);

  useEffect(() => {
    const arc = arcRef.current;
    if (!arc) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      arc.style.strokeDashoffset = String(targetOffset);
      return;
    }
    arc.style.transition = "none";
    arc.style.strokeDashoffset = String(circumference);
    void arc.getBoundingClientRect();
    arc.style.transition = "stroke-dashoffset 1.1s cubic-bezier(0.16, 1, 0.3, 1)";
    arc.style.strokeDashoffset = String(targetOffset);
  }, [circumference, targetOffset]);

  return (
    <svg
      width={wh}
      height={wh}
      viewBox={`0 0 ${wh} ${wh}`}
      role="img"
      aria-label={`Collection rate ${clamped}%`}
      className={cn("shrink-0", className)}
    >
      <circle
        cx={cx}
        cy={cy}
        r={r}
        strokeWidth={sw}
        className="fill-none stroke-surface-3"
      />
      <circle
        ref={arcRef}
        cx={cx}
        cy={cy}
        r={r}
        strokeWidth={sw}
        strokeLinecap="round"
        className="fill-none stroke-accent"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={circumference}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text
        x={cx}
        y={cy + (size === "sm" ? 4 : 5)}
        textAnchor="middle"
        className="fill-foreground font-sans tabular-nums"
        style={{ fontSize: size === "sm" ? "11px" : "15px", fontWeight: 500 }}
      >
        {clamped}%
      </text>
    </svg>
  );
}
