import { Badge } from "@/components/ui/badge";
import type { StudentStatus } from "@/lib/db/types";
import { cn } from "@/lib/utils";

type StudentStatusBadgeProps = {
  status: StudentStatus;
};

const statusClassMap: Record<StudentStatus, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  inactive: "border-slate-200 bg-slate-100 text-slate-700",
  left: "border-amber-200 bg-amber-50 text-amber-800",
  graduated: "border-blue-200 bg-blue-50 text-blue-700",
};

const statusLabelMap: Record<StudentStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  left: "Left",
  graduated: "Graduated",
};

export function StudentStatusBadge({ status }: StudentStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full px-3 py-1 text-xs font-medium", statusClassMap[status])}
    >
      {statusLabelMap[status]}
    </Badge>
  );
}
