import Link from "next/link";

import { AutoSubmitForm } from "@/components/office/auto-submit-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DefaulterFilters } from "@/lib/defaulters/types";
import type {
  StudentClassOption,
  StudentRouteOption,
} from "@/lib/students/types";

type DefaulterFiltersProps = {
  filters: DefaulterFilters;
  classOptions: StudentClassOption[];
  routeOptions: StudentRouteOption[];
};

const selectClassName =
  "mt-2 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function DefaulterFilters({
  filters,
  classOptions,
  routeOptions,
}: DefaulterFiltersProps) {
  return (
    <AutoSubmitForm method="get" className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <div>
        <Label htmlFor="query">Search</Label>
        <Input
          id="query"
          name="query"
          defaultValue={filters.searchQuery ?? ""}
          placeholder="Student, SR no, phone"
          className="mt-2"
        />
      </div>
      <div>
        <Label htmlFor="classId">Class</Label>
        <select
          id="classId"
          name="classId"
          defaultValue={filters.classId}
          className={selectClassName}
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
        <Label htmlFor="transportRouteId">Route</Label>
        <select
          id="transportRouteId"
          name="transportRouteId"
          defaultValue={filters.transportRouteId}
          className={selectClassName}
        >
          <option value="">All routes</option>
          {routeOptions.map((route) => (
            <option key={route.id} value={route.id}>
              {route.routeCode ? `${route.label} (${route.routeCode})` : route.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="overdue">Overdue installment</Label>
        <select
          id="overdue"
          name="overdue"
          defaultValue={filters.overdue}
          className={selectClassName}
        >
          <option value="">All open dues</option>
          <option value="overdue">Overdue only</option>
        </select>
      </div>

      <div>
        <Label htmlFor="minPendingAmount">Amount pending</Label>
        <Input
          id="minPendingAmount"
          name="minPendingAmount"
          type="number"
          min="0"
          step="1"
          defaultValue={filters.minPendingAmount}
          placeholder="Minimum pending amount"
          className="mt-2"
        />
      </div>

      <div className="flex items-end gap-2 md:col-span-2 xl:col-span-5">
        <Button type="button" variant="outline" asChild>
          <Link href="/protected/defaulters">Clear</Link>
        </Button>
      </div>
    </AutoSubmitForm>
  );
}
