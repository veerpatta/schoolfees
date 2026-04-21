import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthConfigNotice() {
  return (
    <Card className="w-full max-w-md rounded-3xl border-amber-200 bg-white shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Login is not configured yet</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-6 text-slate-600">
          This deployment is missing the required Supabase public environment
          values. Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> in Vercel, then
          redeploy.
        </p>
        <Link
          href="/"
          className="text-sm font-medium text-slate-900 underline underline-offset-4"
        >
          Back to overview
        </Link>
      </CardContent>
    </Card>
  );
}
