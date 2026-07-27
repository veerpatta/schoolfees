import { Banknote, ClipboardList, ReceiptText, Search, UsersRound } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { ActionCard } from "@/components/dashboard/action-card";
import type { StaffRole } from "@/lib/auth/roles";
import { formatInr } from "@/lib/helpers/currency";

type RoleFocusActionsProps = {
  role: StaffRole;
  sessionLabel: string;
  todaysCollection: number;
  receiptsToday: number;
  urgentFollowUps: number;
  pendingImports: number;
  canPostPayments: boolean;
};

export async function RoleFocusActions({
  role,
  sessionLabel,
  todaysCollection,
  receiptsToday,
  urgentFollowUps,
  pendingImports,
  canPostPayments,
}: RoleFocusActionsProps) {
  const t = await getTranslations("Dashboard");
  const session = encodeURIComponent(sessionLabel);
  const collectionCard = canPostPayments
    ? {
        icon: Banknote,
        label: t("focusContinueCollection"),
        count: formatInr(todaysCollection),
        helper: t("focusReceiptsToday", { count: receiptsToday }),
        href: `/protected/payments?session=${session}`,
        cta: t("focusOpenPaymentDesk"),
        tone: "success" as const,
      }
    : {
        icon: ReceiptText,
        label: t("focusReviewCollection"),
        count: formatInr(todaysCollection),
        helper: t("focusReceiptsToday", { count: receiptsToday }),
        href:
          role === "view_only"
            ? `/protected/receipts?session=${session}`
            : `/protected/transactions?session=${session}`,
        cta:
          role === "view_only"
            ? t("focusOpenReceipts")
            : t("focusOpenTransactions"),
        tone: "success" as const,
      };
  const followUpCard = {
    icon: UsersRound,
    label: t("focusUrgentFollowUps"),
    count: urgentFollowUps,
    helper: t("focusFollowUpHelper"),
    href: `/protected/defaulters?session=${session}`,
    cta: t("focusOpenDefaulters"),
    tone: urgentFollowUps > 0 ? ("warning" as const) : ("neutral" as const),
  };
  const importCard = {
    icon: ClipboardList,
    label: t("focusPendingImports"),
    count: pendingImports,
    helper: pendingImports > 0 ? t("focusPendingImportsHelper") : t("focusNoPendingImports"),
    href: `/protected/imports?session=${session}`,
    cta: t("focusOpenImports"),
    tone: pendingImports > 0 ? ("info" as const) : ("neutral" as const),
  };
  const studentsCard = {
    icon: Search,
    label: t("focusStudentLookup"),
    helper: t("focusStudentLookupHelper"),
    href: `/protected/students?session=${session}`,
    cta: t("focusOpenStudents"),
    tone: "info" as const,
  };

  const cards =
    role === "fee_collector"
      ? [followUpCard, studentsCard, collectionCard]
      : role === "teacher"
        ? [studentsCard, followUpCard, collectionCard]
        : role === "view_only"
          ? [collectionCard, followUpCard, studentsCard]
          : [collectionCard, followUpCard, importCard];

  return (
    <section aria-labelledby="today-focus-title" className="space-y-2.5">
      <div>
        <h2 id="today-focus-title" className="text-base font-semibold text-foreground">
          {t("focusTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("focusDescription")}
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {cards.map((card) => (
          <ActionCard key={card.label} {...card} />
        ))}
      </div>
    </section>
  );
}
