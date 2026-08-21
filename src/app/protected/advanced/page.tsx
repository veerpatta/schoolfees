import { redirect } from "next/navigation";

export default function AdvancedRedirectPage() {
  redirect("/protected/admin-tools");
}
