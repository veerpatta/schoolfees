import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthConfigNotice() {
  return (
    <Card className="w-full max-w-md border-amber-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl">
          Sign-in is temporarily unavailable
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-6 text-slate-600">
          Please contact the school admin.
        </p>
        <details className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          <summary className="cursor-pointer font-semibold text-slate-800">
            Technical details
          </summary>
          <p className="mt-2 leading-6">
            Required public sign-in settings are missing. Ask the app admin to
            check the school sign-in settings before staff try again.
          </p>
        </details>
      </CardContent>
    </Card>
  );
}
