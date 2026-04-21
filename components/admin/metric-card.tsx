import { ReactNode } from "react";

type MetricCardProps = {
  title: string;
  value: ReactNode;
  hint?: ReactNode;
};

export function MetricCard({ title, value, hint }: MetricCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
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
