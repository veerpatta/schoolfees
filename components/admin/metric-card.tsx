import { ReactNode } from "react";

type MetricCardProps = {
  title: string;
  value: ReactNode;
  hint?: ReactNode;
};

export function MetricCard({ title, value, hint }: MetricCardProps) {
  return (
    <div className="glass-panel rounded-[26px] p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700/75">
        {title}
      </p>
      <div className="mt-3 font-heading text-2xl font-semibold tracking-tight text-slate-950">
        {value}
      </div>
      {hint ? (
        <p className="mt-2 text-sm leading-6 text-slate-600">{hint}</p>
      ) : null}
    </div>
  );
}
