import { AuthConfigNotice } from "@/components/auth/auth-config-notice";
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

  return <LoginForm />;
}
