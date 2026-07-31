"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Phone } from "lucide-react";

import { MobileTabs } from "@/components/mobile-app/mobile-tabs";
import {
  PhoneActionMenu,
  buildStudentPhoneEntries,
} from "@/components/students/phone-chooser";
import { ShareFeeWhatsApp } from "@/components/students/share-fee-whatsapp";
import { StudentRowCollectButton } from "@/components/students/student-row-collect-button";

type TabId = "fees" | "family" | "about";

/**
 * The phone student profile (mobile app v2, §STUDENT DETAIL).
 *
 * Three tabs instead of the desktop workspace's five: the desktop *payments*
 * tab (one row per installment allocation) folds into the receipt rows, which
 * tap through to a receipt page that already shows its own allocation, and the
 * annual half of *fee plan* becomes a collapsed card at the end of Fees. Nothing
 * is dropped — a counter clerk just stops scrolling past a desk-audit view to
 * reach the number a parent is asking about.
 *
 * Tab bodies are server-rendered and passed in, the same shape
 * `StudentWorkspaceTabs` uses, so this stays a thin interaction shell.
 */
export function MobileStudentProfile({
  studentId,
  studentName,
  classLabel,
  admissionNo,
  fatherPhone,
  motherPhone,
  canPostPayments,
  canShare,
  isActive,
  returnTo,
  initialTab,
  familyGroupId,
  pendingAmount,
  feesContent,
  familyContent,
  aboutContent,
  familyCount,
}: {
  studentId: string;
  studentName: string;
  classLabel: string;
  admissionNo: string;
  fatherPhone: string | null;
  motherPhone: string | null;
  canPostPayments: boolean;
  canShare: boolean;
  isActive: boolean;
  returnTo: string;
  initialTab: TabId;
  familyGroupId: string | null;
  pendingAmount: number;
  feesContent: ReactNode;
  familyContent: ReactNode;
  aboutContent: ReactNode;
  /** Sibling count, shown on the Family tab label so it reads before you tap. */
  familyCount: number;
}) {
  const t = useTranslations("MobileApp");
  const [tab, setTab] = useState<TabId>(initialTab);
  const [shareOpen, setShareOpen] = useState(false);

  const phoneEntries = buildStudentPhoneEntries(
    { fatherPhone, motherPhone },
    { father: t("phoneLabelFather"), mother: t("phoneLabelMother") },
  );
  const showCollectAction = canPostPayments && isActive;
  const hasActionBar = canShare || showCollectAction;

  return (
    <div className="anim-slide-up">
      {/* No app bar and no back arrow here: /protected/students/[id] is a
          takeover route, so MobileTakeoverBar already pins the ← at the top of
          the scroll region. */}
      <div className="sticky top-0 z-20 -mx-4 -mt-4 border-b border-border bg-background/95 px-4 pb-0 pt-3 backdrop-blur">
        <div className="flex items-center gap-2.5 pb-2.5">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[16.5px] font-extrabold leading-tight text-foreground">
              {studentName}
            </h1>
            <p className="truncate text-[11.5px] font-semibold text-muted-foreground">
              {classLabel} · SR {admissionNo}
            </p>
          </div>
          {phoneEntries.length > 0 ? (
            <PhoneActionMenu
              entries={phoneEntries}
              menuLabel={t("studentCallMenuLabel")}
              onSelect={(phone) => {
                window.location.href = `tel:${phone}`;
              }}
            >
              <button
                type="button"
                aria-label={t("studentCallAria")}
                className="focus-ring grid size-10 shrink-0 place-items-center rounded-xl bg-success text-success-foreground active:scale-95"
              >
                <Phone className="size-[17px]" aria-hidden="true" />
              </button>
            </PhoneActionMenu>
          ) : null}
        </div>

        <MobileTabs
          ariaLabel={t("studentTabsAria")}
          activeId={tab}
          onSelect={(id) => setTab(id as TabId)}
          tabs={[
            { id: "fees", label: t("studentTabFees") },
            {
              id: "family",
              label: familyCount > 0 ? `${t("studentTabFamily")} · ${familyCount}` : t("studentTabFamily"),
            },
            { id: "about", label: t("studentTabAbout") },
          ]}
        />
      </div>

      {/* Bottom padding clears the fixed action bar so the last card is
          reachable — 3.5rem bar + its safe-area inset + breathing room. */}
      <div
        className="pt-3"
        style={
          hasActionBar
            ? { paddingBottom: "calc(var(--mobile-safe-area-bottom, 0px) + 6rem)" }
            : undefined
        }
      >
        {tab === "fees" ? <div className="anim-fade-in">{feesContent}</div> : null}
        {tab === "family" ? <div className="anim-fade-in">{familyContent}</div> : null}
        {tab === "about" ? <div className="anim-fade-in">{aboutContent}</div> : null}
      </div>

      {/* Fixed, not sticky: on a sibling-less student the About tab is shorter
          than the viewport, and `sticky bottom-0` would pin the bar to the end
          of the content — mid-screen — instead of the bottom edge.

          Safe-area padding only. This route is a mobile takeover, so
          MobileBottomNav returns null and ScrollRestoringMain sets
          data-bottom-nav="false"; there is no fixed tab bar to clear, and
          adding --mobile-bottom-nav-offset here would float the bar 68px above
          the home indicator. */}
      {hasActionBar ? (
        <div
          data-mobile-student-actions="true"
          className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-border bg-background/95 px-4 pt-2.5 backdrop-blur md:hidden print:hidden"
          style={{ paddingBottom: "calc(var(--mobile-safe-area-bottom, 0px) + 0.75rem)" }}
        >
          {canShare ? (
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="focus-ring h-14 w-28 shrink-0 rounded-2xl border border-success/30 bg-success-soft text-[13px] font-extrabold text-success-soft-foreground active:scale-[0.98]"
            >
              {t("studentWhatsAppCta")}
            </button>
          ) : null}
          {showCollectAction ? (
            <StudentRowCollectButton
              studentId={studentId}
              studentLabel={studentName}
              classLabel={classLabel}
              returnTo={returnTo}
              label={t("studentCollectCta")}
              variant="primary"
              className="h-14 flex-1 justify-center rounded-2xl text-[15.5px] font-extrabold"
            />
          ) : null}
        </div>
      ) : null}

      {canShare ? (
        <ShareFeeWhatsApp
          headless
          open={shareOpen}
          onOpenChange={setShareOpen}
          studentId={studentId}
          studentName={studentName}
          familyGroupId={familyGroupId}
          fatherPhone={fatherPhone}
          motherPhone={motherPhone}
          pendingAmount={pendingAmount}
        />
      ) : null}
    </div>
  );
}
