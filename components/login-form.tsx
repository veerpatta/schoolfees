"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";

import { loginAction, type LoginActionState } from "@/app/auth/login/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
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
      <Card className="w-full border-slate-200 bg-white shadow-sm">
        <CardContent className="p-5 sm:p-6">
          <form action={formAction} className="space-y-6">
            <input type="hidden" name="next" value={next} />
            <div className="space-y-5">
              <div className="grid gap-2.5">
                <Label htmlFor="email" className="text-sm font-semibold">
                  Email / Username
                </Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="name@school.in"
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
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700"
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
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
