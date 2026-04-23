import { redirect } from "next/navigation";

import { getDefaultProtectedHref } from "@/lib/config/navigation";
import { requireAuthenticatedStaff } from "@/lib/supabase/session";

export default async function ProtectedPage() {
  const staff = await requireAuthenticatedStaff();

  redirect(getDefaultProtectedHref(staff.appRole));
}
