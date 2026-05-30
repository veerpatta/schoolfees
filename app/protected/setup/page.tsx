import { redirect } from "next/navigation";

// First-time setup was retired once the school went live. Any stale link or
// bookmark now lands on Admin Tools, where session transfer, school settings,
// and lists live.
export default function SetupPage() {
  redirect("/protected/admin-tools");
}
