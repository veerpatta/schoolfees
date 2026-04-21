import { AuthConfigNotice } from "@/components/auth/auth-config-notice";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { hasRequiredEnvVars } from "@/lib/env";

export default function Page() {
  if (!hasRequiredEnvVars) {
    return <AuthConfigNotice />;
  }

  return <ForgotPasswordForm />;
}
