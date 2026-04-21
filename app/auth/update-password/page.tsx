import { AuthConfigNotice } from "@/components/auth/auth-config-notice";
import { UpdatePasswordForm } from "@/components/update-password-form";
import { hasRequiredEnvVars } from "@/lib/env";

export default function Page() {
  if (!hasRequiredEnvVars) {
    return <AuthConfigNotice />;
  }

  return <UpdatePasswordForm />;
}
