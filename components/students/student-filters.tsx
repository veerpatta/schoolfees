import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STUDENT_STATUSES } from "@/lib/students/constants";
import type {
  StudentClassOption,
  StudentListFilters,
  StudentRouteOption,
} from "@/lib/students/types";

type StudentFiltersProps = {
  filters: StudentListFilters;
  classOptions: StudentClassOption[];
  routeOptions: StudentRouteOption[];
};

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function StudentFilters({
  filters,
  classOptions,
  routeOptions,
}: StudentFiltersProps) {
  return (
    <form method="get" className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <div className="xl:col-span-2">
        <Label htmlFor="query">Search by student name</Label>
        <Input
          id="query"
          name="query"
          placeholder="Type full or partial student name"
          defaultValue={filters.query}
          className="mt-2"
        />
      </div>

      <div>
        <Label htmlFor="classId">Class</Label>
        <select
          id="classId"
          name="classId"
          defaultValue={filters.classId}
          className={`${selectClassName} mt-2`}
        >
          <option value="">All classes</option>
          {classOptions.map((classOption) => (
            <option key={classOption.id} value={classOption.id}>
              {classOption.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="transportRouteId">Transport route</Label>
        <select
          id="transportRouteId"
          name="transportRouteId"
          defaultValue={filters.transportRouteId}
          className={`${selectClassName} mt-2`}
        >
          <option value="">All routes</option>
          {routeOptions.map((route) => (
            <option key={route.id} value={route.id}>
              {route.routeCode
                ? `${route.label} (${route.routeCode})`
                : route.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="status">Status</Label>
        <select
          id="status"
          name="status"
          defaultValue={filters.status}
          className={`${selectClassName} mt-2`}
        >
          <option value="">All statuses</option>
          {STUDENT_STATUSES.map((statusOption) => (
            <option key={statusOption.value} value={statusOption.value}>
              {statusOption.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-end gap-2 xl:col-span-5">
        <Button type="submit">Apply filters</Button>
        <Button type="button" variant="outline" asChild>
          <Link href="/protected/students">Clear</Link>
        </Button>
      </div>
    </form>
  );
}
