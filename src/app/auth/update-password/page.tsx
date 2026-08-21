import { AuthConfigNotice } from "@/ui/auth/auth-config-notice";
import { UpdatePasswordForm } from "@/ui/auth/update-password-form";
import { hasRequiredEnvVars } from "@/platform/env";

export default function Page() {
  if (!hasRequiredEnvVars) {
    return <AuthConfigNotice />;
  }

  return <UpdatePasswordForm />;
}
