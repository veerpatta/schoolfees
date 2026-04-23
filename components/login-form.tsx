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
      <Card className="w-full max-w-md rounded-[32px] border-white/75 bg-white/92 shadow-[0_32px_90px_-50px_rgba(15,23,42,0.45)]">
        <CardHeader className="space-y-3">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-sky-100 bg-sky-50/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700">
            <ShieldCheck className="size-3.5" />
            Internal access
          </div>
          <CardTitle className="font-heading text-3xl leading-tight">
            Sign in to the staff workspace
          </CardTitle>
          <CardDescription className="text-sm leading-6">
            Use the invited school staff account for fee setup, collections,
            dues follow-up, and receipt operations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction}>
            <input type="hidden" name="next" value={next} />
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-sky-700/65" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="accounts@school.example"
                    required
                    className="pl-11"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    href="/auth/forgot-password"
                    className="text-xs font-medium text-sky-700 transition hover:text-sky-900"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-sky-700/65" />
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    required
                    className="pl-11"
                  />
                </div>
              </div>
              {state.message ? (
                <p className="rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {state.message}
                </p>
              ) : null}
              <Button
                type="submit"
                className="h-11 w-full justify-between px-4"
                disabled={isPending}
              >
                <span>{isPending ? "Signing in..." : "Open admin workspace"}</span>
                <ArrowRight className="size-4" />
              </Button>
            </div>
            <div className="mt-6 rounded-[24px] border border-sky-100/90 bg-sky-50/70 p-4 text-center">
              <p className="text-sm text-slate-700">
                Staff access is created internally by an admin. No public signup
                is available.
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                If you cannot sign in, ask an admin to reset your password or
                reactivate the staff account.
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
