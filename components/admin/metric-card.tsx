import { ReactNode } from "react";

type MetricCardProps = {
  title: string;
  value: ReactNode;
  hint?: ReactNode;
};

export function MetricCard({ title, value, hint }: MetricCardProps) {
  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-white/95 p-5 shadow-sm shadow-slate-200/60">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
        {title}
      </p>
      <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
        {value}
      </div>
      {hint ? <p className="mt-2 text-sm leading-6 text-slate-600">{hint}</p> : null}
    </div>
  );
}
