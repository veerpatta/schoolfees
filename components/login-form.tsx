"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, LockKeyhole, Mail, ShieldCheck } from "lucide-react";

import { loginAction, type LoginActionState } from "@/app/auth/login/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const initialState: LoginActionState = {
    status: "idle",
    message: null,
  };
  const searchParams = useSearchParams();
  const [state, formAction, isPending] = useActionState(
    loginAction,
    initialState,
  );
  const next = searchParams.get("next") ?? "/protected";

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="w-full rounded-lg border-slate-200 bg-white shadow-[0_24px_80px_-48px_rgba(15,23,42,0.4)]">
        <CardHeader className="space-y-3 border-b border-slate-100 p-6 sm:p-7">
          <div className="inline-flex w-fit items-center gap-2 rounded-md border border-sky-100 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
            <ShieldCheck className="size-3.5" />
            Internal staff access
          </div>
          <CardTitle className="font-heading text-3xl leading-tight text-slate-950">
            Sign in
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-600">
            Use your school staff email and password to open the admin
            workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 sm:p-7">
          <form action={formAction} className="space-y-6">
            <input type="hidden" name="next" value={next} />
            <div className="space-y-5">
              <div className="grid gap-2.5">
                <Label htmlFor="email" className="text-sm font-semibold">
                  Staff email
                </Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="accounts@vpps.example"
                    required
                    autoComplete="email"
                    className="h-12 pl-11"
                  />
                </div>
              </div>
              <div className="grid gap-2.5">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="password" className="text-sm font-semibold">
                    Password
                  </Label>
                  <Link
                    href="/auth/forgot-password"
                    className="text-sm font-medium text-sky-700 transition hover:text-sky-900"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    className="h-12 pl-11"
                  />
                </div>
              </div>
              {state.message ? (
                <p
                  aria-live="polite"
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700"
                >
                  {state.message}
                </p>
              ) : null}
              <Button
                type="submit"
                className="h-12 w-full justify-between px-4 text-base"
                disabled={isPending}
              >
                <span>{isPending ? "Signing in..." : "Sign in"}</span>
                <ArrowRight className="size-4" />
              </Button>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm leading-6 text-slate-700">
                Staff accounts are created by an admin. Public signup is not
                available.
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
