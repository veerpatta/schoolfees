import { redirect } from "next/navigation";

import { getDefaultProtectedHref } from "@/platform/config/navigation";
import { requireAuthenticatedStaff } from "@/platform/supabase/session";

export default async function ProtectedPage() {
  const staff = await requireAuthenticatedStaff();

  redirect(getDefaultProtectedHref(staff.appRole));
}
