"use client";

import { RouteErrorState } from "@/components/admin/route-error-state";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(127,29,29,0.12),_transparent_28%),linear-gradient(180deg,_#f8f4ea_0%,_#f6f6f5_45%,_#eef2f7_100%)] px-4 py-6 md:px-6 md:py-8">
      <div className="mx-auto w-full max-w-3xl">
        <RouteErrorState
          title="The app could not finish loading"
          description="Check the deployment environment values and Supabase connection settings, then try the request again."
          errorDigest={error.digest}
          reset={reset}
        />
      </div>
    </main>
  );
}
