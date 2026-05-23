import { formatInr } from "@/lib/helpers/currency";
import type { DashboardClassSummaryRow } from "@/lib/dashboard/summary";

type ClassCollectionProgressProps = {
  rows: DashboardClassSummaryRow[];
};

export function ClassCollectionProgress({ rows }: ClassCollectionProgressProps) {
  const sortedRows = rows
    .map((row) => ({
      ...row,
      pct: row.expectedAmount > 0 ? Math.min(100, Math.round((row.collectedAmount / row.expectedAmount) * 100)) : 0,
    }))
    .sort((left, right) => left.pct - right.pct || left.classLabel.localeCompare(right.classLabel));

  if (sortedRows.length === 0) {
    return <p className="text-sm text-muted-foreground">No class collection data yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="py-2 pr-3">Class</th>
            <th className="px-3 py-2">Progress</th>
            <th className="px-3 py-2 text-right">Collected</th>
            <th className="py-2 pl-3 text-right">%</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr key={row.classId} className="border-t border-border">
              <td className="py-2 pr-3 font-medium text-foreground">{row.classLabel}</td>
              <td className="px-3 py-2">
                <div className="h-2 rounded-full bg-surface-2">
                  <div className="h-2 rounded-full bg-accent" style={{ width: `${row.pct}%` }} />
                </div>
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                {formatInr(row.collectedAmount)} of {formatInr(row.expectedAmount)}
              </td>
              <td className="py-2 pl-3 text-right font-semibold tabular-nums text-foreground">{row.pct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
