import { Badge } from "@/components/ui/badge";
import type { StudentStatus } from "@/lib/db/types";
import { cn } from "@/lib/utils";

type StudentStatusBadgeProps = {
  status: StudentStatus;
};

const statusClassMap: Record<StudentStatus, string> = {
  active: "bg-success-soft text-success-soft-foreground",
  inactive: "border-border bg-surface-2 text-foreground",
  left: "bg-warning-soft text-warning-soft-foreground",
  graduated: "bg-info-soft text-info-soft-foreground",
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
