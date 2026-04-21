"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";

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
      <Card className="w-full max-w-md rounded-3xl border-slate-200 bg-white shadow-lg">
        <CardHeader className="space-y-3">
          <div className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Internal access
          </div>
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <CardDescription>
            Use your invited school staff account to open the fee admin
            workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction}>
            <input type="hidden" name="next" value={next} />
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="accounts@school.example"
                  required
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">Password</Label>
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                />
              </div>
              {state.message ? (
                <p className="text-sm text-red-500">{state.message}</p>
              ) : null}
              <Button type="submit" className="h-10 w-full" disabled={isPending}>
                {isPending ? "Signing in..." : "Open admin shell"}
              </Button>
            </div>
            <div className="mt-5 space-y-2 text-center">
              <p className="text-sm text-slate-600">
                Staff access is created internally by an admin. No public signup
                is available.
              </p>
              <p className="text-xs text-slate-500">
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
