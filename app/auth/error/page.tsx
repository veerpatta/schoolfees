import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Suspense } from "react";

async function ErrorContent({
  searchParams,
}: {
  searchParams: Promise<{ error: string }>;
}) {
  const params = await searchParams;

  return (
    <>
      {params?.error ? (
        <p className="text-sm leading-6 text-muted-foreground">
          Authentication error: {params.error}
        </p>
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">
          An unspecified authentication error occurred.
        </p>
      )}
    </>
  );
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ error: string }>;
}) {
  return (
    <Card className="w-full max-w-md border-slate-200/80 bg-white/95 shadow-2xl shadow-slate-200/60">
      <CardHeader>
        <CardTitle className="text-2xl">
          Something blocked the authentication flow.
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Suspense>
          <ErrorContent searchParams={searchParams} />
        </Suspense>
        <Link
          href="/auth/login"
          className="text-sm font-medium text-slate-900 underline underline-offset-4"
        >
          Back to sign in
        </Link>
      </CardContent>
    </Card>
  );
}
