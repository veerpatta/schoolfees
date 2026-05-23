import { formatInr } from "@/lib/helpers/currency";
import { cn } from "@/lib/utils";

export type CollectionHeatmapPoint = {
  date: string;
  amount: number;
};

type CollectionHeatmapProps = {
  collections: CollectionHeatmapPoint[];
};

function getSchoolMonthParts() {
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [year, month] = today.split("-").map(Number);

  return { year, month };
}

function getAmountClass(amount: number) {
  if (amount <= 0) return "bg-surface-2 text-muted-foreground";
  if (amount < 10000) return "bg-success-soft/40 text-foreground";
  if (amount < 50000) return "bg-success-soft/70 text-foreground";
  return "bg-success-soft font-semibold text-success-soft-foreground";
}

export function CollectionHeatmap({ collections }: CollectionHeatmapProps) {
  const { year, month } = getSchoolMonthParts();
  const firstDate = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startOffset = firstDate.getDay();
  const amountByDate = new Map(collections.map((item) => [item.date, item.amount]));
  const cells = [
    ...Array.from({ length: startOffset }, (_, index) => ({ key: `blank-${index}`, day: null, date: "", amount: 0 })),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return { key: date, day, date, amount: amountByDate.get(date) ?? 0 };
    }),
  ];

  return (
    <div className="grid grid-cols-7 gap-1.5">
      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
        <div key={day} className="px-1 text-center text-[10px] font-semibold uppercase text-muted-foreground">
          {day}
        </div>
      ))}
      {cells.map((cell) => (
        <div
          key={cell.key}
          className={cn(
            "flex aspect-square items-start justify-start rounded-md px-1.5 py-1 text-xs tabular-nums",
            cell.day === null ? "bg-transparent" : getAmountClass(cell.amount),
          )}
          title={cell.day === null ? undefined : `${cell.date}: ${formatInr(cell.amount)}`}
        >
          {cell.day}
        </div>
      ))}
    </div>
  );
}
