import { AuthConfigNotice } from "@/ui/auth/auth-config-notice";
import { ForgotPasswordForm } from "@/ui/auth/forgot-password-form";
import { hasRequiredEnvVars } from "@/platform/env";

export default function Page() {
  if (!hasRequiredEnvVars) {
    return <AuthConfigNotice />;
  }

  return <ForgotPasswordForm />;
}
