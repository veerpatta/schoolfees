import { SignUpForm } from "@/components/sign-up-form";
import { isBootstrapSignupEnabled } from "@/lib/env";
import { getAuthenticatedStaff } from "@/lib/supabase/session";
import { redirect } from "next/navigation";

export default async function Page() {
  const staff = await getAuthenticatedStaff();

  if (staff) {
    redirect("/protected");
  }

  if (!isBootstrapSignupEnabled()) {
    redirect("/auth/login");
  }

  return <SignUpForm />;
}
