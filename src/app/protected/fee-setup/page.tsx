import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { FeeSetupClient } from "@/modules/fees/ui/fee-setup-client";
import { PageHeader } from "@/ui/shell/page-header";
import { Button } from "@/ui/primitives/button";
import { getFeeSetupPageData } from "@/modules/fees/domain/queries";
import { INITIAL_FEE_SETUP_ACTION_STATE } from "@/modules/fees/domain/types";
import { getMasterDataPageData } from "@/modules/master-data/data/queries";
import { getViewSessionCookie } from "@/platform/session/cookie";
import { resolveViewSession } from "@/platform/session/resolver";
import { appendSessionParam } from "@/platform/navigation/session-href";
import { hasStaffPermission, requireStaffPermission } from "@/platform/supabase/session";

import { saveWorkbookFeeSetupAction } from "./actions";
import {
  searchParamString,
  type SearchParamValue,
} from "@/platform/helpers/search-params";
import type { MasterDataActionState } from "@/app/protected/master-data/actions";
import {
  createClassAction,
  createRouteAction,
  deleteClassAction,
  deleteRouteAction,
  updateClassAction,
  updateRouteAction,
} from "@/app/protected/master-data/actions";

const INITIAL_MASTER_DATA_ACTION_STATE: MasterDataActionState = {
  status: "idle",
  message: "",
};

export const revalidate = 60;

type FeeSetupSectionId =
  | "session"
  | "basic"
  | "classes"
  | "transport"
  | "fee-heads"
  | "discounts";

type FeeSetupPageProps = {
  // `string | string[]`: Next hands a page an array whenever a parameter
  // repeats, and reading one as if it were always a string is what threw out
  // of the Dashboard and Transactions Server Components.
  searchParams?: Promise<{ session?: SearchParamValue; section?: SearchParamValue }>;
};

// Maps a ?section=… deep link to a Fee Setup section. Installment dates live in
// the "basic" section, so ?section=installments lands there.
function resolveDeepLinkSection(value: SearchParamValue): FeeSetupSectionId | undefined {
  const normalized = searchParamString(value).toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "installments") return "basic";
  const valid: FeeSetupSectionId[] = ["session", "basic", "classes", "transport", "fee-heads", "discounts"];
  return valid.includes(normalized as FeeSetupSectionId)
    ? (normalized as FeeSetupSectionId)
    : undefined;
}

export default async function FeeSetupPage({ searchParams }: FeeSetupPageProps) {
  const t = await getTranslations("FeeSetup");
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialSection = resolveDeepLinkSection(resolvedSearchParams?.section);
  const viewSession = await resolveViewSession({
    searchParamSession: resolvedSearchParams?.session,
    cookieSession: await getViewSessionCookie(),
  });
  const [staff, data, masterData] = await Promise.all([
    requireStaffPermission("fees:view", { onDenied: "redirect" }),
    getFeeSetupPageData({ sessionLabel: viewSession.sessionLabel }),
    getMasterDataPageData(),
  ]);

  const withSession = (href: string) => appendSessionParam(href, viewSession.sessionLabel);

  const canEdit = hasStaffPermission(staff, "fees:write");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
        actions={
          <Button asChild variant="outline">
            <Link href={withSession("/protected/fee-setup/time-travel")}>{t("timeTravelAction")}</Link>
          </Button>
        }
      />

      <FeeSetupClient
        data={data}
        masterData={{
          sessions: masterData.sessions,
          classes: masterData.classes,
          routes: masterData.routes,
        }}
        canEdit={canEdit}
        saveWorkbookFeeSetupAction={saveWorkbookFeeSetupAction}
        initialState={INITIAL_FEE_SETUP_ACTION_STATE}
        initialMasterDataState={INITIAL_MASTER_DATA_ACTION_STATE}
        initialSelectedSessionLabel={viewSession.sessionLabel}
        initialSection={initialSection}
        actions={{
          createClassAction,
          updateClassAction,
          deleteClassAction,
          createRouteAction,
          updateRouteAction,
          deleteRouteAction,
        }}
      />
    </div>
  );
}
