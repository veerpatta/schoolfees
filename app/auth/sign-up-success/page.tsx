import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";

export default function Page() {
  return (
    <Card className="w-full max-w-md border-slate-200/80 bg-white/95 shadow-2xl shadow-slate-200/60">
      <CardHeader>
        <CardTitle className="text-2xl">Check your email</CardTitle>
        <CardDescription>Bootstrap account created successfully.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-6 text-slate-600">
          Confirm the account from the email you received, then sign in. After
          the first admin account is working, move to invited staff accounts and
          disable open signups in Supabase Auth.
        </p>
        <Link
          href="/auth/login"
          className="text-sm font-medium text-slate-900 underline underline-offset-4"
        >
          Return to sign in
        </Link>
      </CardContent>
    </Card>
  );
}
