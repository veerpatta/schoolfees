import { PageHeader } from "@/ui/shell/page-header";
import { SectionCard } from "@/ui/shell/section-card";
import { PasswordChangeForm } from "@/modules/staff/ui/password-change-form";
import {
  changeOwnPasswordAction,
} from "@/app/protected/password/actions";
import { INITIAL_STAFF_FORM_ACTION_STATE } from "@/modules/staff/data/queries";
import { requireAuthenticatedStaff } from "@/platform/supabase/session";

export default async function PasswordPage() {
  const staff = await requireAuthenticatedStaff();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Change your password"
        description="Use this page to change the password for your internal staff account. Password updates happen through secure server-side logic."
      />

      <SectionCard
        title="Update password"
        description={`Signed in as ${staff.email ?? "authorized staff"}.`}
        className="max-w-2xl"
      >
        <PasswordChangeForm
          action={changeOwnPasswordAction}
          initialState={INITIAL_STAFF_FORM_ACTION_STATE}
        />
      </SectionCard>
    </div>
  );
}
