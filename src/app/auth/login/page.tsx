import { AuthConfigNotice } from "@/ui/auth/auth-config-notice";
import { SignedOutCachePurge } from "@/modules/payments/ui/signed-out-cache-purge";
import { getAuthenticatedStaff } from "@/platform/supabase/session";
import { hasRequiredEnvVars } from "@/platform/env";
import { LoginForm } from "@/ui/auth/login-form";
import { redirect } from "next/navigation";

export default async function Page() {
  if (!hasRequiredEnvVars) {
    return <AuthConfigNotice />;
  }

  const staff = await getAuthenticatedStaff();

  if (staff) {
    redirect("/protected");
  }

  return (
    <>
      {/* Reaching this line proves there is no session (the redirect above is
          the only other way out), so clearing the previous staffer's cached
          student data is unconditionally safe here. */}
      <SignedOutCachePurge />
      <LoginForm />
    </>
  );
}
