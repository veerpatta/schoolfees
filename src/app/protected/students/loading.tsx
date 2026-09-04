import { getTranslations } from "next-intl/server";

import { StudentsListSkeleton } from "@/modules/students/ui/students-list-skeleton";
import { PageHeader } from "@/ui/shell/page-header";

export default async function Loading() {
  const t = await getTranslations("Students");
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />

      <StudentsListSkeleton />
    </div>
  );
}
