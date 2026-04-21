import { getAuthenticatedStaff } from "@/lib/supabase/session";
import { LoginForm } from "@/components/login-form";
import { redirect } from "next/navigation";

export default async function Page() {
  const staff = await getAuthenticatedStaff();

  if (staff) {
    redirect("/protected");
  }

  return <LoginForm />;
}
