import Link from "next/link";
import { getTranslations } from "next-intl/server";

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
  sessionLabel: string;
};

const selectClassName =
  "mt-2 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export async function DefaulterFilters({
  filters,
  classOptions,
  routeOptions,
  sessionLabel,
}: DefaulterFiltersProps) {
  const t = await getTranslations("Defaulters");
  const routeLabel = (route: StudentRouteOption) =>
    route.routeCode
      ? t("filterRouteWithCode", { label: route.label, code: route.routeCode })
      : route.label;

  return (
    <AutoSubmitForm method="get" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
      <input type="hidden" name="session" value={sessionLabel} />
      <div>
        <Label htmlFor="query">{t("filterSearchLabel")}</Label>
        <Input
          id="query"
          name="query"
          defaultValue={filters.searchQuery ?? ""}
          placeholder={t("filterSearchPlaceholder")}
          className="mt-2"
        />
      </div>
      <div>
        <Label htmlFor="classId">{t("filterClassLabel")}</Label>
        <select
          id="classId"
          name="classId"
          defaultValue={filters.classId}
          className={selectClassName}
        >
          <option value="">{t("filterClassAll")}</option>
          {classOptions.map((classOption) => (
            <option key={classOption.id} value={classOption.id}>
              {classOption.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="transportRouteId">{t("filterRouteLabel")}</Label>
        <select
          id="transportRouteId"
          name="transportRouteId"
          defaultValue={filters.transportRouteId}
          className={selectClassName}
        >
          <option value="">{t("filterRouteAll")}</option>
          {routeOptions.map((route) => (
            <option key={route.id} value={route.id}>
              {routeLabel(route)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="overdue">{t("filterOverdueLabelLong")}</Label>
        <select
          id="overdue"
          name="overdue"
          defaultValue={filters.overdue}
          className={selectClassName}
        >
          <option value="">{t("filterOverdueAll")}</option>
          <option value="overdue">{t("filterOverdueOnly")}</option>
        </select>
      </div>

      <div>
        <Label htmlFor="minPendingAmount">{t("filterMinPendingLabel")}</Label>
        <Input
          id="minPendingAmount"
          name="minPendingAmount"
          type="number"
          min="0"
          step="1"
          defaultValue={filters.minPendingAmount}
          placeholder={t("filterMinPendingPlaceholder")}
          className="mt-2"
        />
      </div>

      <div className="flex items-end gap-2 md:col-span-2 xl:col-span-5">
        <Button type="button" variant="outline" asChild>
          <Link href={`/protected/defaulters?session=${encodeURIComponent(sessionLabel)}`}>{t("filterClear")}</Link>
        </Button>
      </div>
    </AutoSubmitForm>
  );
}
