import { AuthConfigNotice } from "@/components/auth/auth-config-notice";
import { SignedOutCachePurge } from "@/components/auth/signed-out-cache-purge";
import { getAuthenticatedStaff } from "@/lib/supabase/session";
import { hasRequiredEnvVars } from "@/lib/env";
import { LoginForm } from "@/components/login-form";
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
